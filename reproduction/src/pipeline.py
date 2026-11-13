"""Features, classifiers, folds and metrics shared by the experiment scripts.

Feature hashing: scikit-learn HashingVectorizer on the preprocessed description. The
paper does not report the hash size or the n-gram range. Used here: 2**10 = 1,024
features (the documented default bit size of Azure Machine Learning's Feature Hashing
component), unigrams and bigrams, non-negative counts, L2-normalized. HashingVectorizer
is stateless, so nothing is fitted on test data when the features are built.

Classifiers: the paper's Table 4 lists hyperparameters per algorithm; the mapping to
scikit-learn is in CLASSIFIERS below and in reproduction/README.md. Decision Jungle has no
scikit-learn implementation and is omitted.
"""
import re
import warnings

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.tree import DecisionTreeClassifier

from paths import SEED

N_FEATURES = 2 ** 10
NGRAM_RANGE = (1, 2)
N_FOLDS = 10
DUPLICATE_COSINE = 0.9
MAX_RATE_GAP = 0.01   # allowed gap between a test fold's positive rate and the overall rate

# The words the keyword query searched for (config.json). Used for the reference rule only.
KEYWORD_RE = re.compile(r"talkback|screen reader|accessibility|a11y", re.I)


def hash_features(docs):
    vec = HashingVectorizer(n_features=N_FEATURES, ngram_range=NGRAM_RANGE,
                            alternate_sign=False, norm="l2", lowercase=False,
                            token_pattern=r"\S+")
    return vec.transform(docs).toarray()


def _classifiers():
    return {
        # Table 4 gives this row max leaves 20, min samples per leaf 10, learning rate 0.2
        # and 100 trees: settings of a boosted ensemble. Run both readings.
        "Decision Tree (single)": lambda: DecisionTreeClassifier(
            max_leaf_nodes=20, min_samples_leaf=10, random_state=SEED),
        "Decision Tree (boosted)": lambda: GradientBoostingClassifier(
            n_estimators=100, learning_rate=0.2, max_leaf_nodes=20, min_samples_leaf=10,
            random_state=SEED),
        # Table 4: 8 trees, max depth 32, min samples 1 (random-split count not mappable).
        "Random Forest": lambda: RandomForestClassifier(
            n_estimators=8, max_depth=32, min_samples_leaf=1, n_jobs=1, random_state=SEED),
        # Table 4: 1 iteration, lambda 0.001. Linear SVM trained by SGD on the hinge loss;
        # scikit-learn's alpha is the same L2 weight as Pegasos' lambda.
        "SVM (linear)": lambda: SGDClassifier(
            loss="hinge", alpha=0.001, max_iter=1, tol=None, random_state=SEED),
        # Table 4: 100 hidden nodes, learning rate 0.1, 100 iterations, momentum 0.
        "Neural Network": lambda: MLPClassifier(
            hidden_layer_sizes=(100,), solver="sgd", learning_rate_init=0.1, momentum=0.0,
            max_iter=100, random_state=SEED),
    }


CLASSIFIERS = _classifiers()


def fit_predict(make_model, X_train, y_train, X_test):
    """Fit on the training rows only; return (class prediction, continuous score) for
    the test rows. The score is the positive-class probability, or the SVM margin."""
    model = make_model()
    with warnings.catch_warnings():
        # max_iter=1 (SVM) and 100 (MLP) are the paper's settings; scikit-learn warns that
        # they stop before convergence. That is expected, not an error.
        warnings.simplefilter("ignore", ConvergenceWarning)
        model.fit(X_train, y_train)
    pred = model.predict(X_test).astype(int)
    if hasattr(model, "predict_proba"):
        return pred, model.predict_proba(X_test)[:, 1]
    return pred, model.decision_function(X_test)


def duplicate_groups(docs, threshold=DUPLICATE_COSINE):
    """Group id per document: connected components of the graph that links two documents
    whose cosine similarity is >= threshold (exact and near duplicates). Uses no labels.

    Similarity is measured on a separate, larger hash space (2**18, 1- and 2-grams) so
    that hash collisions in the 1,024-feature model input do not create false matches.
    """
    from scipy.sparse.csgraph import connected_components

    vec = HashingVectorizer(n_features=2 ** 18, ngram_range=(1, 2), alternate_sign=False,
                            norm="l2", lowercase=False, token_pattern=r"\S+")
    X = vec.transform(list(docs))
    adjacency = (X @ X.T) >= threshold
    _, labels = connected_components(adjacency, directed=False)
    return labels


def stratified_folds(y, groups, seed=SEED, n_splits=N_FOLDS):
    """Stratified 10-fold split that keeps every duplicate group inside one fold."""
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    return list(sgkf.split(np.zeros(len(y)), y, groups))


def group_folds(apps, groups):
    """Leave one app out. Training rows that share a duplicate group with any row of the
    held-out app are removed from training, so no near-copy of a test issue is trained on.
    """
    apps, groups = np.asarray(apps), np.asarray(groups)
    idx = np.arange(len(apps))
    folds = []
    for app in sorted(set(apps)):
        test = idx[apps == app]
        train = idx[(apps != app) & ~np.isin(groups, groups[test])]
        folds.append((train, test))
    return folds


def check_folds(folds, ids, y=None, max_rate_gap=None, groups=None, apps=None):
    """Raise if a fold reuses an issue in train and test, misses an issue, lets a duplicate
    group or an app cross train and test, or is not stratified (each test fold's positive
    rate within max_rate_gap of the overall rate)."""
    ids = np.asarray(ids)
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate issue ids in the dataset")
    tested = []
    for train, test in folds:
        overlap = set(ids[train]) & set(ids[test])
        if overlap:
            raise ValueError(f"{len(overlap)} issues are in both train and test")
        for name, values in (("duplicate group", groups), ("app", apps)):
            if values is not None:
                values = np.asarray(values)
                if set(values[train]) & set(values[test]):
                    raise ValueError(f"a {name} is in both train and test")
        tested.extend(ids[test])
    if sorted(tested) != sorted(ids):
        raise ValueError("test folds do not cover every issue exactly once")
    if max_rate_gap is not None:
        y = np.asarray(y)
        for _, test in folds:
            if abs(y[test].mean() - y.mean()) > max_rate_gap:
                raise ValueError("a test fold is not stratified")


def metrics(y, pred, score):
    p, r, f, _ = precision_recall_fscore_support(y, pred, average="binary", zero_division=0)
    auc = roc_auc_score(y, score) if len(set(y)) == 2 else float("nan")
    return {"accuracy": accuracy_score(y, pred), "precision": p, "recall": r, "f1": f,
            "auc": auc}


def run_folds(X, y, folds, make_model):
    """Per-fold metrics plus the out-of-fold score and prediction for every issue."""
    y = np.asarray(y)
    score = np.full(len(y), np.nan)
    pred = np.zeros(len(y), dtype=int)
    per_fold = []
    for train, test in folds:
        pred[test], score[test] = fit_predict(make_model, X[train], y[train], X[test])
        per_fold.append(metrics(y[test], pred[test], score[test]))
    return per_fold, score, pred


def keyword_rule(texts):
    return np.array([1 if KEYWORD_RE.search(t) else 0 for t in texts])


def near_chance(mean_auc, tolerance=0.05):
    """The shuffled-label control passes only if AUC is within tolerance of 0.5."""
    return abs(mean_auc - 0.5) <= tolerance


METRICS = ("accuracy", "precision", "recall", "f1", "auc")


def mean_sd(per_fold):
    """Mean and sample SD of each metric over folds (the paper reports mean values)."""
    out = {}
    for m in METRICS:
        values = np.array([f[m] for f in per_fold], dtype=float)
        out[f"{m}_mean"] = round(float(values.mean()), 4)
        out[f"{m}_sd"] = round(float(values.std(ddof=1)), 4) if len(values) > 1 else 0.0
    return out


def load_preprocessed():
    import pandas as pd
    from paths import BUILD

    return pd.read_csv(BUILD / "preprocessed.csv", keep_default_na=False)


def load_descriptions():
    """Unprocessed descriptions, aligned with load_preprocessed() (same row order)."""
    import pandas as pd
    from paths import BUILD

    return pd.read_csv(BUILD / "dataset.csv", keep_default_na=False)
