"""Step 4 (Extension): leave-one-app-out evaluation and keyword masking.

Two questions the paper's setup cannot answer on this dataset:
  1. Does the score hold for an app the model never saw? Leave-one-app-out: each of the
     15 apps is scored by a model trained on the other 14 (minus any issue that is a
     near-duplicate of an issue in the held-out app).
  2. How much of the score is the words used to select the accessibility sample? The
     masked variant removes accessib*, a11y, talkback / talk back and screen reader(s)
     from the description before preprocessing, in training and test data alike.

Runs the grid {10-fold stratified CV, leave-one-app-out} x {raw, masked}. The cell
(10-fold, raw) is Experiment 1 and is read from exp1_cv_folds.csv, not recomputed.
"""
import numpy as np
import pandas as pd

from exp1_cv import KEYWORD_RULE, cv_rows, summarize
from paths import RESULTS
from pipeline import (CLASSIFIERS, MAX_RATE_GAP, check_folds, group_folds, hash_features,
                      keyword_rule, load_descriptions, load_preprocessed, metrics, run_folds,
                      stratified_folds)
from preprocess import mask


def loao(X, y, repos, groups, label, rule_pred):
    """Pooled out-of-fold metrics and per-app metrics for leave-one-app-out."""
    folds = group_folds(repos, groups)
    apps = sorted(set(repos))
    pooled, per_app = [], []
    systems = {name: None for name in CLASSIFIERS} | {KEYWORD_RULE: None}
    for name in systems:
        if name == KEYWORD_RULE:
            pred = score = rule_pred
        else:
            _, score, pred = run_folds(X, y, folds, CLASSIFIERS[name])
        f1s, aucs = [], []
        for app, (_, test) in zip(apps, folds):
            m = metrics(y[test], pred[test], score[test])
            f1s.append(m["f1"])
            aucs.append(m["auc"])
            per_app.append({"text": label, "classifier": name, "held_out_app": app,
                            "issues": len(test), "positives": int(y[test].sum()), **m})
        pooled.append({"evaluation": "leave-one-app-out", "text": label, "classifier": name,
                       **{k: v for k, v in metrics(y, pred, score).items()},
                       "per_app_f1_min": min(f1s), "per_app_f1_median": float(np.median(f1s)),
                       "per_app_f1_max": max(f1s), "per_app_auc_median": float(np.median(aucs))})
        print(f"  loao {label:6} {name:24} pooled F1 {pooled[-1]['f1']:.3f}", flush=True)
    return pooled, per_app


def main():
    df, desc = load_preprocessed(), load_descriptions()
    if not (df["issue_id"].to_numpy() == desc["issue_id"].to_numpy()).all():
        raise ValueError("build/dataset.csv and build/preprocessed.csv are out of step")
    y, repos = df["y"].to_numpy(), df["repo"].to_numpy()
    rule = {"raw": keyword_rule(desc["body"]),
            "masked": keyword_rule([mask(t) for t in desc["body"]])}
    X = {"raw": hash_features(df["raw"]), "masked": hash_features(df["masked"])}

    groups = df["dup_group"].to_numpy()
    folds = stratified_folds(y, groups)
    check_folds(folds, df["issue_id"], y, max_rate_gap=MAX_RATE_GAP, groups=groups)
    check_folds(group_folds(repos, groups), df["issue_id"], groups=groups, apps=repos)

    cv = pd.concat([pd.read_csv(RESULTS / "exp1_cv_folds.csv"),
                    pd.DataFrame(cv_rows(X["masked"], y, folds, "masked", rule["masked"]))
                    .round(4)])
    cv.to_csv(RESULTS / "ext_cv_folds.csv", index=False)
    cv_summary = summarize(cv.to_dict("records"))
    cv_summary.insert(0, "evaluation", "10-fold stratified CV")

    pooled, per_app = [], []
    for label in ("raw", "masked"):
        p, a = loao(X[label], y, repos, groups, label, rule[label])
        pooled += p
        per_app += a
    pd.DataFrame(per_app).round(4).to_csv(RESULTS / "ext_loao_per_app.csv", index=False)
    pd.DataFrame(pooled).round(4).to_csv(RESULTS / "ext_loao_summary.csv", index=False)
    cv_summary.to_csv(RESULTS / "ext_cv_summary.csv", index=False)


if __name__ == "__main__":
    main()
