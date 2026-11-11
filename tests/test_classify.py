import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "analysis"))
import classify  # noqa: E402


def test_mask_removes_the_search_words_and_their_variants():
    text = "TalkBack and Talk back fail; screen-reader, Screen Readers, a11y, Accessibility, inaccessible"
    masked = classify.mask(text).lower()
    for word in ["talk", "screen", "reader", "a11y", "accessib"]:
        assert word not in masked
    assert "fail" in masked


def test_keyword_rule_matches_raw_text_and_nothing_after_masking():
    texts = ["Button not read by TalkBack", "Crash on start", "Needs a11y review"]
    assert classify.keyword_rule(texts).tolist() == [1, 0, 1]
    assert classify.keyword_rule([classify.mask(t) for t in texts]).tolist() == [0, 0, 0]


def test_held_out_repository_is_never_trained_on():
    # The two repositories use the words in opposite senses. A model that had seen the
    # held-out repository would get some right; a model trained only on the other one
    # gets every issue wrong.
    texts = ["alpha alpha", "beta beta"] * 4 + ["beta beta", "alpha alpha"] * 4
    y = [1, 0] * 8
    repos = ["a"] * 8 + ["b"] * 8
    pred = classify.leave_one_repo_out(texts, y, repos)
    assert (pred != np.array(y)).all()


def test_prf_and_bootstrap_are_deterministic():
    y = np.array([1, 1, 1, 0, 0, 0, 1, 0])
    pred = np.array([1, 1, 0, 0, 0, 1, 1, 0])
    assert classify.prf(y, pred) == (0.75, 0.75, 0.75)
    first = classify.bootstrap_f1(y, pred, n=200)
    assert first == classify.bootstrap_f1(y, pred, n=200)
    assert 0 <= first[0] <= 0.75 <= first[1] <= 1
