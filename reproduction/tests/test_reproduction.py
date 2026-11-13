"""Tests for reproduction/src. No network, no build/ directory needed.

Run: python3 -m pytest -q reproduction/tests
"""
import pathlib
import re
import sys

import numpy as np
import pytest

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

import control_shuffled  # noqa: E402
import pipeline  # noqa: E402
import preprocess  # noqa: E402


# ---------- preprocessing on fixed examples ----------

def test_paper_example_sentence():
    # Section 3.2 of the paper. Paper output: "Print dialog large screen access feature use
    # size". The differences (accessibility, resizable) come from the stdlib lemmatizer.
    text = ("Print dialog too large for screen when accessibility features being used; "
            "needs to be resizable")
    assert preprocess.preprocess(text) == \
        "print dialog large screen accessibility feature use resizable"


def test_numbers_special_characters_and_case():
    text = "Crash #1234 in v2.3.1!!! The MENU-buttons (API 33) crashed :-("
    assert preprocess.preprocess(text) == "crash menu button api crash"


def test_a11y_does_not_survive_number_removal():
    # Removing digits splits "a11y" into single letters, which are dropped.
    assert preprocess.preprocess("a11y a11y") == ""


@pytest.mark.parametrize("word, lemma", [
    ("features", "feature"), ("used", "use"), ("crashes", "crash"), ("buttons", "button"),
    ("libraries", "library"), ("classes", "class"), ("status", "status"), ("focus", "focus"),
    ("running", "run"), ("stopped", "stop"), ("created", "create"), ("disabled", "disable"),
    ("making", "make"), ("loading", "load"), ("opening", "open"), ("called", "call"),
    ("need", "need"), ("speed", "speed"), ("fixed", "fix"), ("thing", "thing"),
])
def test_lemmatizer(word, lemma):
    assert preprocess.lemmatize(word) == lemma


def test_stop_words_include_the_papers_extra_terms():
    for word in ("too", "for", "need", "the", "and"):
        assert word in preprocess.STOP_WORDS
    assert preprocess.preprocess("The need for too much") == ""


def test_empty_and_none_descriptions():
    assert preprocess.preprocess("") == ""
    assert preprocess.preprocess(None) == ""


# ---------- keyword masking ----------

def test_mask_matches_the_repository_classifier():
    sys.path.insert(0, str(SRC.parent.parent / "analysis"))
    import classify
    assert preprocess.MASK_RE.pattern == classify.MASK_RE.pattern
    assert preprocess.MASK_RE.flags == classify.MASK_RE.flags


def test_masking_removes_every_selection_word_before_preprocessing():
    text = ("TalkBack and Talk back fail; screen-reader, Screen Readers, screenreader, a11y, "
            "Accessibility, AccessibilityNodeInfo, inaccessible button")
    out = preprocess.preprocess(preprocess.mask(text))
    for word in ("talk", "back", "screen", "reader", "accessib"):
        assert word not in out
    assert pipeline.keyword_rule([preprocess.mask(text)]).tolist() == [0]
    assert "button" in out and "fail" in out


def test_keyword_rule():
    texts = ["Button not read by TalkBack", "Crash on start", "needs a11y review"]
    assert pipeline.keyword_rule(texts).tolist() == [1, 0, 1]


# ---------- duplicates and folds ----------

def _labels(n=500, positives=240):
    y = np.zeros(n, dtype=int)
    y[:positives] = 1
    return np.random.default_rng(1).permutation(y)


def test_duplicate_groups_join_exact_and_near_copies_only():
    base = " ".join(f"tok{i}" for i in range(40))
    docs = [base, base, base + " extra", "crash start screen", "other unrelated text here"]
    g = pipeline.duplicate_groups(docs)
    assert g[0] == g[1] == g[2]                  # exact copy and a one-word variant
    assert len({g[0], g[3], g[4]}) == 3          # unrelated documents stay apart


def test_stratified_folds_are_stratified_grouped_disjoint_and_cover_everything():
    y = _labels()
    ids = np.arange(1000, 1000 + len(y))
    groups = np.arange(len(y)) // 3              # groups of three issues
    folds = pipeline.stratified_folds(y, groups)
    assert len(folds) == 10
    pipeline.check_folds(folds, ids, y, max_rate_gap=0.05, groups=groups)
    for train, test in folds:
        assert not set(ids[train]) & set(ids[test])
        assert not set(groups[train]) & set(groups[test])
        assert abs(y[test].mean() - y.mean()) <= 0.05
    again = pipeline.stratified_folds(y, groups)
    assert all((a[1] == b[1]).all() for a, b in zip(folds, again))     # seeded


def test_check_folds_rejects_overlap_duplicates_groups_and_unstratified_folds():
    y = _labels()
    ids = np.arange(len(y))
    groups = np.arange(len(y))
    good = pipeline.stratified_folds(y, groups)
    leaky = [(np.arange(len(y)), test) for _, test in good]
    with pytest.raises(ValueError, match="both train and test"):
        pipeline.check_folds(leaky, ids)
    with pytest.raises(ValueError, match="duplicate issue ids"):
        pipeline.check_folds(good, np.r_[ids[:-1], ids[0]])
    # A plain stratified split ignores groups; check_folds must notice a split group.
    pairs = np.arange(len(y)) // 2
    with pytest.raises(ValueError, match="duplicate group"):
        pipeline.check_folds(good, ids, groups=pairs)
    order = np.argsort(y)                     # all negatives first: unstratified chunks
    unstratified = [(np.setdiff1d(ids, part), part) for part in np.array_split(order, 10)]
    with pytest.raises(ValueError, match="not stratified"):
        pipeline.check_folds(unstratified, ids, y, max_rate_gap=0.01)


def test_leave_one_app_out_isolates_the_app_and_its_duplicates():
    repos = np.array(["a"] * 5 + ["b"] * 3 + ["c"] * 4)
    groups = np.arange(len(repos))
    groups[8] = groups[0]                     # an issue in app c duplicates one in app a
    folds = pipeline.group_folds(repos, groups)
    assert len(folds) == 3
    for (train, test), app in zip(folds, ["a", "b", "c"]):
        assert set(repos[test]) == {app}
        assert app not in set(repos[train])
    assert 8 not in folds[0][0] and 0 not in folds[2][0]     # purged from training
    pipeline.check_folds(folds, np.arange(len(repos)), groups=groups, apps=repos)


# ---------- shuffled-label control ----------

def _synthetic(n=1500, seed=2):
    """Distinct random documents; class 1 documents contain the token 'zzsignal'."""
    rng = np.random.default_rng(seed)
    vocab = [f"w{i}" for i in range(3000)]
    y = _labels(n, n // 2)
    docs = [" ".join(rng.choice(vocab, 30)) + (" zzsignal" if label else "") for label in y]
    return pipeline.hash_features(docs), y


RF = {"Random Forest": pipeline.CLASSIFIERS["Random Forest"]}


def test_pipeline_learns_real_signal():
    X, y = _synthetic()
    per_fold, _, _ = pipeline.run_folds(X, y, pipeline.stratified_folds(y, np.arange(len(y))),
                                        pipeline.CLASSIFIERS["Decision Tree (single)"])
    assert np.mean([f["auc"] for f in per_fold]) > 0.95


def test_shuffled_control_is_near_chance_with_correct_folds():
    X, y = _synthetic()
    y_shuffled = control_shuffled.shuffle_labels(y)
    folds = pipeline.stratified_folds(y_shuffled, np.arange(len(y)))
    result = control_shuffled.shuffled_control(X, y_shuffled, folds, RF)
    assert result["near_chance"].all(), result


def test_shuffled_control_fails_when_test_rows_leak_into_training():
    # The same pipeline, but every fold trains on all rows (test rows included). A deep
    # forest memorizes the shuffled labels and the control must flag it.
    X, y = _synthetic()
    y_shuffled = control_shuffled.shuffle_labels(y)
    folds = pipeline.stratified_folds(y_shuffled, np.arange(len(y)))
    leaky = [(np.arange(len(y)), test) for _, test in folds]
    result = control_shuffled.shuffled_control(X, y_shuffled, leaky, RF)
    assert not result["near_chance"].any(), result


def test_hashing_is_stateless_and_fixed_width():
    a = pipeline.hash_features(["print dialog large", "crash start"])
    b = pipeline.hash_features(["crash start"])
    assert a.shape == (2, pipeline.N_FEATURES)
    assert np.array_equal(a[1], b[0])


def test_no_pickles_or_network_modules_in_src():
    for path in SRC.glob("*.py"):
        text = path.read_text()
        assert not re.search(r"^\s*import (pickle|joblib|urllib|requests|socket)", text, re.M), path
        assert not re.search(r"^\s*from (urllib|requests|socket|joblib)", text, re.M), path


def test_recorded_raw_pages_hash_matches_committed_pages():
    """results/data_hashes.csv must describe the raw pages actually in the repository (no build/ needed)."""
    import csv
    import hashlib
    root = pathlib.Path(__file__).resolve().parents[2]
    raw = hashlib.sha256()
    pages = sorted((root / "data" / "raw").rglob("*.json.gz"))
    for path in pages:
        raw.update(path.relative_to(root).as_posix().encode() + b"\0")
        raw.update(path.read_bytes())
    rows = {r["input"]: r for r in csv.DictReader(open(root / "reproduction/results/data_hashes.csv"))}
    rec = rows["data/raw/ (all pages)"]
    assert int(rec["files_or_lines"]) == len(pages)
    assert rec["sha256"] == raw.hexdigest(), "raw pages changed: rerun reproduction/src/make_report.py"
    assert raw.hexdigest() in (root / "reproduction/results/results.md").read_text()
    readme = (root / "reproduction/README.md").read_text()
    assert f"`{raw.hexdigest()[:8]}…{raw.hexdigest()[-9:]}`" in readme
