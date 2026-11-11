"""Modest classifier: is an issue an accessibility issue, judged from title and body?

TF-IDF + logistic regression, evaluated leave-one-repository-out: each repository is
scored by a model trained only on the other repositories. Two text variants:
  raw    - title and body as written
  masked - the search words that defined most of the positive class are removed
A keyword rule (the four search terms) is the baseline. Labels are never part of the text.
"""
import argparse
import pathlib
import re
import sqlite3

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support
from sklearn.pipeline import make_pipeline

SEED = 0
KEYWORD_RE = re.compile(r"talkback|screen reader|accessibility|a11y", re.I)
MASK_RE = re.compile(r"accessib\w*|a11y|talk\s?back|screen[\s-]?readers?", re.I)

QUERY = """
SELECT i.id, r.full_name AS repo, i.title || char(10) || COALESCE(i.body, '') AS text,
       c.is_a11y AS y
FROM issues i JOIN issue_class c ON c.issue_id = i.id JOIN repos r ON r.id = i.repo_id
ORDER BY i.id
"""


def mask(text):
    return MASK_RE.sub(" ", text)


def keyword_rule(texts):
    return np.array([1 if KEYWORD_RE.search(t) else 0 for t in texts])


def leave_one_repo_out(texts, y, repos):
    """Predict every issue with a model that never saw its repository."""
    texts, y, repos = np.asarray(texts, dtype=object), np.asarray(y), np.asarray(repos)
    pred = np.zeros(len(y), dtype=int)
    for repo in sorted(set(repos)):
        held = repos == repo
        model = make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
            LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED))
        model.fit(texts[~held], y[~held])
        pred[held] = model.predict(texts[held])
    return pred


def prf(y, pred):
    p, r, f, _ = precision_recall_fscore_support(y, pred, average="binary", zero_division=0)
    return round(p, 3), round(r, 3), round(f, 3)


def bootstrap_f1(y, pred, n=2000, seed=SEED):
    """95% percentile interval for F1, resampling issues with replacement."""
    rng = np.random.default_rng(seed)
    y, pred = np.asarray(y), np.asarray(pred)
    scores = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        scores.append(prf(y[idx], pred[idx])[2])
    return round(float(np.percentile(scores, 2.5)), 3), round(float(np.percentile(scores, 97.5)), 3)


def evaluate(df):
    """Return (per-repository rows, overall rows) for the four systems."""
    y, repos = df["y"].to_numpy(), df["repo"].to_numpy()
    raw, masked = df["text"].tolist(), [mask(t) for t in df["text"]]
    systems = {
        "keyword rule, raw text": keyword_rule(raw),
        "keyword rule, masked text": keyword_rule(masked),
        "tfidf+logreg, raw text": leave_one_repo_out(raw, y, repos),
        "tfidf+logreg, masked text": leave_one_repo_out(masked, y, repos),
    }
    no_keyword = (y == 1) & (keyword_rule(raw) == 0)   # positives found only through a label
    per_repo, overall = [], []
    for name, pred in systems.items():
        for repo in sorted(set(repos)):
            m = repos == repo
            per_repo.append((name, repo, int(m.sum()), int(y[m].sum()), *prf(y[m], pred[m])))
        lo, hi = bootstrap_f1(y, pred)
        overall.append((name, len(y), int(y.sum()), *prf(y, pred), lo, hi,
                        int(no_keyword.sum()), round(float(pred[no_keyword].mean()), 3)))
    return (pd.DataFrame(per_repo, columns=["system", "held_out_repo", "issues", "positives",
                                             "precision", "recall", "f1"]),
            pd.DataFrame(overall, columns=["system", "issues", "positives", "precision", "recall",
                                           "f1", "f1_ci95_low", "f1_ci95_high",
                                           "label_only_positives", "recall_on_label_only"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default="data/warehouse.db")
    ap.add_argument("--out", default="results")
    args = ap.parse_args()
    df = pd.read_sql_query(QUERY, sqlite3.connect(args.db))
    per_repo, overall = evaluate(df)
    out = pathlib.Path(args.out)
    per_repo.to_csv(out / "classifier_per_repo.csv", index=False)
    overall.to_csv(out / "classifier_overall.csv", index=False)
    print(overall.to_string(index=False))


if __name__ == "__main__":
    main()
