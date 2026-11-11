"""Time analysis/05 with and without idx_issues_repo_created on a copy of the warehouse.

Prints (and writes to results/index_benchmark.md) the EXPLAIN QUERY PLAN lines that
mention the inner `issues` lookup and the median wall time of repeated runs.
"""
import argparse
import pathlib
import shutil
import sqlite3
import statistics
import tempfile
import time

QUERY = (pathlib.Path(__file__).parent / "05_comparison_date_match.sql").read_text()
INDEX = "CREATE INDEX idx_issues_repo_created ON issues (repo_id, created_at)"


def measure(conn, runs):
    plan = sorted({row[3] for row in conn.execute("EXPLAIN QUERY PLAN " + QUERY)
                   if " o " in row[3]})   # the inner lookup is aliased `o` in the query
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        conn.execute(QUERY).fetchall()
        times.append((time.perf_counter() - start) * 1000)
    return plan, statistics.median(times)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default="data/warehouse.db")
    ap.add_argument("--out", default="results/index_benchmark.md")
    ap.add_argument("--runs", type=int, default=21)
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        copy = pathlib.Path(tmp) / "bench.db"
        shutil.copy(args.db, copy)
        conn = sqlite3.connect(copy)
        conn.execute("DROP INDEX IF EXISTS idx_issues_repo_created")
        plan_before, ms_before = measure(conn, args.runs)
        conn.execute(INDEX)
        plan_after, ms_after = measure(conn, args.runs)
        rows = conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0]
    text = (f"# Index benchmark: analysis/05_comparison_date_match.sql\n\n"
            f"{rows} rows in `issues`, median of {args.runs} runs, SQLite {sqlite3.sqlite_version}.\n\n"
            f"Without the index: {ms_before:.1f} ms\n\n```\n" + "\n".join(plan_before) + "\n```\n\n"
            f"With `{INDEX}`: {ms_after:.1f} ms ({ms_before / ms_after:.1f}x faster)\n\n"
            "```\n" + "\n".join(plan_after) + "\n```\n")
    pathlib.Path(args.out).write_text(text)
    print(text)


if __name__ == "__main__":
    main()
