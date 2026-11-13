"""Export the warehouse to compact JSON for the static explorer in docs/.

Exported per issue: repository, number, title, state, close reason, dates, comment count,
labels, which queries returned it, which search words its title or body contains, and its
sample (accessibility, comparison, or excluded keyword hit). Not exported: issue bodies,
author names, avatars or author association. Email addresses in titles and labels are
replaced with "[email removed]" (one fenix issue has an address as its whole title). The site builds the GitHub link from the
repository name and the issue number.

    python3 -m warehouse.export_site --db data/warehouse.db --out docs/data           # write
    python3 -m warehouse.export_site --db data/warehouse.db --out docs/data --check   # verify
"""
import argparse
import csv
import json
import pathlib
import re
import sqlite3
import sys

from warehouse import __version__

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILENAME = "issues.json"

SAMPLES = ["a11y", "comparison", "excluded"]
SOURCES = ["label", "keyword", "comparison"]          # bit 0, 1, 2
WORDS = ["talkback", "screen reader", "accessibility", "a11y"]   # bit 0..3, as in issue_class
FIELDS = ["repo", "number", "title", "state", "state_reason", "created_at", "closed_at",
          "comments", "sample", "sources", "words", "labels"]
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
EMAIL_REMOVED = "[email removed]"


def redact(text):
    """Replace anything shaped like an email address."""
    return EMAIL_RE.sub(EMAIL_REMOVED, text)

# The search-word test is the same LIKE expression as the issue_class view in schema.sql.
# Bits: sources label=1 keyword=2 comparison=4; words talkback=1 "screen reader"=2
# accessibility=4 a11y=8. Sample: 0 accessibility, 1 comparison, 2 excluded keyword hit.
ISSUES = """
WITH t AS (SELECT id, LOWER(title || ' ' || COALESCE(body, '')) AS text FROM issues)
SELECT r.full_name, i.number, i.title, i.state, i.state_reason, i.created_at, i.closed_at,
       i.comments,
       CASE WHEN c.issue_id IS NULL THEN 2 WHEN c.is_a11y THEN 0 ELSE 1 END AS sample,
       EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'label')
       + 2 * EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'keyword')
       + 4 * EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'comparison')
         AS sources,
       (t.text LIKE '%talkback%') + 2 * (t.text LIKE '%screen reader%')
       + 4 * (t.text LIKE '%accessibility%') + 8 * (t.text LIKE '%a11y%') AS words,
       i.id
FROM issues i
JOIN t ON t.id = i.id
JOIN repos r ON r.id = i.repo_id
LEFT JOIN issue_class c ON c.issue_id = i.id
ORDER BY r.full_name, i.number
"""
LABELS = """
SELECT il.issue_id, l.name FROM issue_labels il JOIN labels l ON l.id = il.label_id
"""


def read_leakage(results_dir):
    """The four rows of results/classifier_overall.csv, numbers as measured."""
    path = pathlib.Path(results_dir) / "classifier_overall.csv"
    rows = []
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            rows.append({"system": row["system"], "issues": int(row["issues"]),
                         "positives": int(row["positives"]),
                         **{k: float(row[k]) for k in ("precision", "recall", "f1",
                                                       "f1_ci95_low", "f1_ci95_high",
                                                       "recall_on_label_only")},
                         "label_only_positives": int(row["label_only_positives"])})
    return rows


def build(db_path, results_dir=ROOT / "results"):
    """Return the export as a dict."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    labels_of = {}
    for issue_id, name in conn.execute(LABELS):
        labels_of.setdefault(issue_id, set()).add(name)
    labels_of = {k: {redact(n) for n in names} for k, names in labels_of.items()}
    label_names = sorted({n for names in labels_of.values() for n in names})
    label_index = {n: i for i, n in enumerate(label_names)}
    repos = conn.execute("SELECT full_name, a11y_label FROM repos ORDER BY full_name").fetchall()
    for name, _ in repos:
        if not REPO_RE.match(name):
            raise ValueError(f"unexpected repository name {name!r}")
    repo_index = {name: i for i, (name, _) in enumerate(repos)}
    issues = []
    for (repo, number, title, state, reason, created, closed, comments, sample, sources,
         words, issue_id) in conn.execute(ISSUES):
        if not isinstance(number, int) or number <= 0:
            raise ValueError(f"unexpected issue number {number!r} in {repo}")
        issues.append([repo_index[repo], number, redact(title), state, reason, created, closed, comments,
                       sample, sources, words,
                       sorted(label_index[n] for n in labels_of.get(issue_id, ()))])
    collected_at = conn.execute("SELECT MAX(collected_at) FROM load_runs").fetchone()[0]
    conn.close()
    return {
        "about": {"collected_at": collected_at, "issues": len(issues),
                  "generated_by": "python3 -m warehouse.export_site"},
        "samples": SAMPLES, "sources": SOURCES, "words": WORDS, "fields": FIELDS,
        "repos": [{"name": n, "a11y_label": a} for n, a in repos],
        "labels": label_names,
        "leakage": read_leakage(results_dir),
        "issues": issues,
    }


def render(data):
    """Deterministic JSON text, one issue per line so diffs stay readable."""
    head = {k: v for k, v in data.items() if k != "issues"}
    dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    lines = ["{" + dump(head)[1:-1] + ',"issues":[']
    lines.append(",\n".join(dump(row) for row in data["issues"]))
    lines.append("]}")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--version", action="version", version=f"a11y-issue-warehouse {__version__}")
    ap.add_argument("--db", default="data/warehouse.db")
    ap.add_argument("--out", default="docs/data")
    ap.add_argument("--results", default=str(ROOT / "results"))
    ap.add_argument("--check", action="store_true",
                    help="fail if the file in --out differs from a fresh export")
    args = ap.parse_args(argv)
    if not pathlib.Path(args.db).exists():
        sys.exit(f"{args.db} not found; run `make load` first")
    text = render(build(args.db, args.results))
    target = pathlib.Path(args.out) / FILENAME
    if args.check:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != text:
            print(f"{target} is out of date; run `make site`", file=sys.stderr)
            return 1
        print(f"{target} is up to date ({len(text.encode())} bytes)")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"wrote {target} ({len(text.encode())} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
