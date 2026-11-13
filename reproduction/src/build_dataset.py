"""Step 1: build the dataset from the repository's committed raw pages.

Loads data/raw/ into a fresh SQLite file under reproduction/build/ with the repository's
own loader (warehouse.load), then selects every classified issue from the issue_class
view. Label 1 = accessibility issue (accessibility label, or a confirmed keyword hit);
label 0 = date-matched comparison issue. See the repository README and DATA.md for how
these were selected.

Only the description (the GitHub issue body) is kept as text, as in the paper, which used
the bug report description only. Issues whose description has no token left after
preprocessing are dropped (the paper removed "non-meaningful" reports); the count is
reported in results/dataset_summary.csv.

No network: everything comes from data/raw/.
"""
import sqlite3
import sys

import pandas as pd

from paths import BUILD, RAW, RESULTS, ROOT
from pipeline import KEYWORD_RE
from preprocess import preprocess

QUERY = """
SELECT i.id AS issue_id, r.full_name AS repo, i.number, i.created_at,
       COALESCE(i.body, '') AS body, c.is_a11y AS y, c.by_label, c.by_keyword
FROM issues i JOIN issue_class c ON c.issue_id = i.id JOIN repos r ON r.id = i.repo_id
ORDER BY i.id
"""


def load_issues(db_path):
    sys.path.insert(0, str(ROOT))
    from warehouse.load import load

    if db_path.exists():
        db_path.unlink()
    load(db_path, RAW)
    with sqlite3.connect(db_path) as conn:
        return pd.read_sql_query(QUERY, conn)


def summarize(all_issues, kept):
    rows = []
    for repo in sorted(all_issues["repo"].unique()) + ["ALL"]:
        a = all_issues if repo == "ALL" else all_issues[all_issues["repo"] == repo]
        k = kept if repo == "ALL" else kept[kept["repo"] == repo]
        rows.append({
            "repo": repo,
            "classified_issues": len(a),
            "empty_description_dropped": len(a) - len(k),
            "kept": len(k),
            "kept_accessibility": int(k["y"].sum()),
            "kept_comparison": int((k["y"] == 0).sum()),
            "kept_accessibility_by_label": int(k["by_label"].sum()),
            "kept_accessibility_by_keyword": int(k["by_keyword"].sum()),
        })
    return pd.DataFrame(rows)


def properties(kept, processed):
    """A few measured facts about the kept descriptions that matter for reading results."""
    y = kept["y"]
    has_kw = kept["body"].map(lambda t: bool(KEYWORD_RE.search(t)))
    dup = processed.duplicated(keep=False)
    groups = pd.DataFrame({"p": processed, "y": y})[dup].groupby("p")["y"].nunique()
    n_tokens = processed.str.split().map(len)
    facts = [
        ("issues", len(kept)),
        ("accessibility (label 1)", int(y.sum())),
        ("comparison (label 0)", int((y == 0).sum())),
        ("accessibility descriptions containing a search word", int((has_kw & (y == 1)).sum())),
        ("comparison descriptions containing a search word", int((has_kw & (y == 0)).sum())),
        ("issues whose processed description equals another issue's", int(dup.sum())),
        ("groups of identical processed descriptions", len(groups)),
        ("of those, groups containing both labels", int((groups > 1).sum())),
        ("median tokens per processed description", int(n_tokens.median())),
    ]
    return pd.DataFrame(facts, columns=["property", "value"])


def main():
    BUILD.mkdir(exist_ok=True)
    RESULTS.mkdir(exist_ok=True)
    issues = load_issues(BUILD / "warehouse.db")
    if not issues["issue_id"].is_unique:
        raise ValueError("an issue appears twice")
    processed = issues["body"].map(preprocess)
    meaningful = processed != ""
    kept = issues[meaningful].reset_index(drop=True)
    kept.to_csv(BUILD / "dataset.csv", index=False)
    summary = summarize(issues, kept)
    summary.to_csv(RESULTS / "dataset_summary.csv", index=False)
    properties(kept, processed[meaningful].reset_index(drop=True)).to_csv(
        RESULTS / "dataset_properties.csv", index=False)
    print(summary.tail(1).to_string(index=False))


if __name__ == "__main__":
    main()
