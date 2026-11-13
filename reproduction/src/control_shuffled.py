"""Step 5: shuffled-label control.

The labels are permuted once (seed 0) and the whole Experiment 1 pipeline is run again on
the same stratified folds. With no relation left between text and label, every
classifier's mean AUC must be near 0.5. If information about the test labels reached
training (a fold bug, features fitted on all rows, duplicated issues across folds), the
control would score well above chance; the script then exits with status 1, which stops
run_all.py. tests/test_reproduction.py shows that a leaky fold split makes it fail.
"""
import sys

import numpy as np
import pandas as pd

from paths import RESULTS, SEED
from pipeline import (CLASSIFIERS, MAX_RATE_GAP, check_folds, hash_features, load_preprocessed, mean_sd,
                      near_chance, run_folds, stratified_folds)


def shuffle_labels(y, seed=SEED):
    return np.random.default_rng(seed).permutation(np.asarray(y))


def shuffled_control(X, y_shuffled, folds, classifiers=None):
    """Run every classifier on the given folds with already shuffled labels."""
    rows = []
    for name, make_model in (classifiers or CLASSIFIERS).items():
        per_fold, _, _ = run_folds(X, y_shuffled, folds, make_model)
        summary = mean_sd(per_fold)
        rows.append({"classifier": name, **summary,
                     "near_chance": near_chance(summary["auc_mean"])})
    return pd.DataFrame(rows)


def main():
    df = load_preprocessed()
    X, y = hash_features(df["raw"]), df["y"].to_numpy()
    y_shuffled = shuffle_labels(y)
    groups = df["dup_group"].to_numpy()
    folds = stratified_folds(y_shuffled, groups)
    check_folds(folds, df["issue_id"], y_shuffled, max_rate_gap=MAX_RATE_GAP, groups=groups)
    result = shuffled_control(X, y_shuffled, folds)
    result.to_csv(RESULTS / "control_shuffled.csv", index=False)
    print(result[["classifier", "auc_mean", "f1_mean", "near_chance"]].to_string(index=False))
    if not result["near_chance"].all():
        print("FAIL: a classifier scores above chance on shuffled labels", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
