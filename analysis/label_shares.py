"""Shares behind the README's statements about the accessibility-issue sample.

    python3 analysis/label_shares.py --db data/warehouse.db

Prints the README sentences that contain these numbers; tests/test_label_shares.py
checks that README.md says exactly this.
"""
import argparse
import sqlite3

TEXT = "LOWER(i.title || ' ' || COALESCE(i.body, ''))"
NO_WORD = (f"NOT ({TEXT} LIKE '%talkback%' OR {TEXT} LIKE '%screen reader%' "
           f"OR {TEXT} LIKE '%accessibility%' OR {TEXT} LIKE '%a11y%')")
FENIX = "mozilla-mobile/fenix"
LABEL_SRC = "EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'label')"

# Every count, in words. "Search word" means talkback, screen reader, accessibility or a11y
# (case-insensitive substring), as in the issue_class view.
DEFINITIONS = {
    "loaded": "all issues in the warehouse",
    "classified": "issues in the issue_class view (accessibility sample plus comparison sample)",
    "positives": "issues in the accessibility-issue sample (issue_class.is_a11y = 1)",
    "label_only_no_word": "labelled accessibility but no search word in title or body",
    "label_not_keyword_confirmed": "labelled accessibility but not a confirmed keyword hit "
                                   "(by_label and not by_keyword in issue_class: either no search "
                                   "word, or the keyword query did not return it)",
    "fenix_loaded": "mozilla-mobile/fenix issues among all loaded issues",
    "fenix_classified": "mozilla-mobile/fenix issues among classified issues",
    "fenix_positives": "mozilla-mobile/fenix issues in the accessibility-issue sample",
    "with_feature_label": "accessibility-sample issues with a label containing 'feature' or 'enhancement'",
}


def compute(conn):
    one = lambda sql, *a: conn.execute(sql, a).fetchone()[0]  # noqa: E731
    base = ("FROM issues i JOIN repos r ON r.id = i.repo_id "
            "LEFT JOIN issue_class c ON c.issue_id = i.id ")
    s = {
        "loaded": one("SELECT COUNT(*) " + base),
        "classified": one("SELECT COUNT(*) " + base + "WHERE c.issue_id IS NOT NULL"),
        "positives": one("SELECT COUNT(*) " + base + "WHERE c.is_a11y = 1"),
        "label_only_no_word": one("SELECT COUNT(*) " + base + "WHERE c.is_a11y = 1 AND "
                                  + LABEL_SRC + " AND " + NO_WORD),
        "label_not_keyword_confirmed": one("SELECT COUNT(*) " + base
                                           + "WHERE c.by_label = 1 AND c.by_keyword = 0"),
        "fenix_loaded": one("SELECT COUNT(*) " + base + "WHERE r.full_name = ?", FENIX),
        "fenix_classified": one("SELECT COUNT(*) " + base + "WHERE r.full_name = ? AND c.issue_id IS NOT NULL", FENIX),
        "fenix_positives": one("SELECT COUNT(*) " + base + "WHERE r.full_name = ? AND c.is_a11y = 1", FENIX),
        "with_feature_label": one(
            "SELECT COUNT(DISTINCT i.id) " + base + "JOIN issue_labels il ON il.issue_id = i.id "
            "JOIN labels l ON l.id = il.label_id WHERE c.is_a11y = 1 AND "
            "(LOWER(l.name) LIKE '%feature%' OR LOWER(l.name) LIKE '%enhancement%')"),
    }
    pct = lambda a, b: f"{100 * a / b:.1f}%"  # noqa: E731
    s["fenix_positive_pct"] = pct(s["fenix_positives"], s["positives"])
    s["fenix_classified_pct"] = pct(s["fenix_classified"], s["classified"])
    s["fenix_loaded_pct"] = pct(s["fenix_loaded"], s["loaded"])
    return s


def sentences(s):
    """The exact README sentences these numbers appear in."""
    n = "{:,}".format
    return [
        f"{n(s['label_only_no_word'])} of the {n(s['positives'])} accessibility-sample issues are "
        "labelled accessibility but have no search word in title or body;",
        f"{n(s['label_not_keyword_confirmed'])} are labelled accessibility but are not a confirmed "
        "keyword hit",
        f"mozilla-mobile/fenix contributes {n(s['fenix_positives'])} of the {n(s['positives'])} "
        f"accessibility-sample issues ({s['fenix_positive_pct']}), {n(s['fenix_classified'])} of the "
        f"{n(s['classified'])} classified issues ({s['fenix_classified_pct']}) and "
        f"{n(s['fenix_loaded'])} of the {n(s['loaded'])} loaded issues ({s['fenix_loaded_pct']}).",
        f"{n(s['with_feature_label'])} of the {n(s['positives'])} accessibility-sample issues carry a "
        "feature-request or enhancement label",
    ]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default="data/warehouse.db")
    args = ap.parse_args()
    s = compute(sqlite3.connect(f"file:{args.db}?mode=ro", uri=True))
    for k, v in s.items():
        print(f"{k:28} {v:>6}  {DEFINITIONS.get(k, 'percentage of the counts above')}")
    print()
    print("\n".join(sentences(s)))


if __name__ == "__main__":
    main()
