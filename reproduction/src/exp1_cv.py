"""Step 3 (Experiment 1): the paper's pipeline, 10-fold stratified cross-validation.

Preprocessed description -> feature hashing -> each classifier, scored on 10 stratified
folds (shuffled, seed 0). Exact and near-duplicate descriptions (cosine >= 0.9, see
pipeline.duplicate_groups) are kept in the same fold, so no near-copy of a test issue is
ever trained on. Writes per-fold metrics and their mean and SD.

Also scores a reference rule on the same folds: "the description contains one of the
search words" (talkback, screen reader, accessibility, a11y). It is not in the paper; it
shows how much of the task the selection keywords alone explain on this dataset.
"""
import pandas as pd

from paths import RESULTS
from pipeline import (CLASSIFIERS, MAX_RATE_GAP, check_folds, hash_features, keyword_rule, load_descriptions,
                      load_preprocessed, mean_sd, metrics, run_folds, stratified_folds)

KEYWORD_RULE = "Keyword rule (reference, not trained)"


def cv_rows(X, y, folds, label, rule_pred=None):
    """Per-fold rows for every classifier (and the keyword rule if given)."""
    rows = []
    for name, make_model in CLASSIFIERS.items():
        per_fold, _, _ = run_folds(X, y, folds, make_model)
        rows += [{"text": label, "classifier": name, "fold": i + 1, **m}
                 for i, m in enumerate(per_fold)]
        print(f"  {label:6} {name:24} F1 {sum(m['f1'] for m in per_fold) / len(per_fold):.3f}",
              flush=True)
    if rule_pred is not None:
        rows += [{"text": label, "classifier": KEYWORD_RULE, "fold": i + 1,
                  **metrics(y[test], rule_pred[test], rule_pred[test])}
                 for i, (_, test) in enumerate(folds)]
    return rows


def summarize(rows):
    df = pd.DataFrame(rows)
    out = []
    for (text, name), g in df.groupby(["text", "classifier"], sort=False):
        out.append({"text": text, "classifier": name, "folds": len(g),
                    **mean_sd(g.to_dict("records"))})
    return pd.DataFrame(out)


def main():
    df, desc = load_preprocessed(), load_descriptions()
    if not (df["issue_id"].to_numpy() == desc["issue_id"].to_numpy()).all():
        raise ValueError("build/dataset.csv and build/preprocessed.csv are out of step")
    y = df["y"].to_numpy()
    groups = df["dup_group"].to_numpy()
    folds = stratified_folds(y, groups)
    check_folds(folds, df["issue_id"], y, max_rate_gap=MAX_RATE_GAP, groups=groups)
    rows = cv_rows(hash_features(df["raw"]), y, folds, "raw", keyword_rule(desc["body"]))
    per_fold = pd.DataFrame(rows).round(4)
    per_fold.to_csv(RESULTS / "exp1_cv_folds.csv", index=False)
    summarize(rows).to_csv(RESULTS / "exp1_cv_summary.csv", index=False)


if __name__ == "__main__":
    main()
