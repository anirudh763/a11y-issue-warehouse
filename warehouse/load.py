"""Load: raw pages in data/raw/ -> SQLite warehouse.

Each raw page is applied in one transaction. Issues are upserted by GitHub id and a row
is only written when the incoming copy has a newer updated_at, so the newest copy wins
whatever order the pages are read in, and loading the same pages again changes nothing.
"""
import argparse
import datetime as dt
import pathlib
import sqlite3

from warehouse.extract import read_page

SCHEMA = pathlib.Path(__file__).with_name("schema.sql")

UPSERT_ISSUE = """
INSERT INTO issues (id, repo_id, number, title, body, state, state_reason, created_at,
                    closed_at, updated_at, comments, author_association)
VALUES (:id, :repo_id, :number, :title, :body, :state, :state_reason, :created_at,
        :closed_at, :updated_at, :comments, :author_association)
ON CONFLICT (id) DO UPDATE SET
    number = excluded.number, title = excluded.title, body = excluded.body,
    state = excluded.state, state_reason = excluded.state_reason,
    closed_at = excluded.closed_at, updated_at = excluded.updated_at,
    comments = excluded.comments, author_association = excluded.author_association
WHERE excluded.updated_at > issues.updated_at
"""


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA.read_text())
    return conn


def upsert_repo(conn, full_name, a11y_label):
    conn.execute(
        "INSERT INTO repos (full_name, html_url, a11y_label) VALUES (?, ?, ?) "
        "ON CONFLICT (full_name) DO UPDATE SET a11y_label = excluded.a11y_label "
        "WHERE a11y_label IS NOT excluded.a11y_label",
        (full_name, "https://github.com/" + full_name, a11y_label))
    return conn.execute("SELECT id FROM repos WHERE full_name = ?", (full_name,)).fetchone()[0]


def apply_issue(conn, repo_id, item, source):
    """Upsert one search result. Labels are replaced only when the issue row was written."""
    written = conn.execute(UPSERT_ISSUE, {**item, "repo_id": repo_id}).rowcount
    if written:
        conn.execute("DELETE FROM issue_labels WHERE issue_id = ?", (item["id"],))
        for label in item["labels"]:
            conn.execute(
                "INSERT INTO labels (id, repo_id, name) VALUES (?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET name = excluded.name WHERE name <> excluded.name",
                (label["id"], repo_id, label["name"]))
            conn.execute("INSERT OR IGNORE INTO issue_labels VALUES (?, ?)", (item["id"], label["id"]))
    conn.execute("INSERT OR IGNORE INTO issue_sources VALUES (?, ?)", (item["id"], source))


def load(db_path, raw_dir, incremental=False):
    """Load every page under raw_dir. Returns the load_runs row as a dict.

    incremental=True skips any item whose updated_at is not later than the newest
    updated_at already stored for its repository (the watermark). That is only safe for
    pages fetched with `extract --since`, where everything returned is new or changed.
    """
    conn = connect(db_path)
    started = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    watermarks = dict(conn.execute(
        "SELECT r.full_name, MAX(i.updated_at) FROM issues i JOIN repos r ON r.id = i.repo_id "
        "GROUP BY r.full_name")) if incremental else {}
    before = conn.total_changes
    pages = raw_items = skipped = 0
    seen, collected_at = set(), None
    for path in sorted(pathlib.Path(raw_dir).rglob("*.json.gz")):
        page = read_page(path)
        pages += 1
        collected_at = max(collected_at or "", page["fetched_at"])
        with conn:  # one transaction per page
            repo_id = upsert_repo(conn, page["repo"], page["a11y_label"])
            for item in page["response"]["items"]:
                if "pull_request" in item:
                    continue
                raw_items += 1
                seen.add(item["id"])
                if item["updated_at"] <= watermarks.get(page["repo"], ""):
                    skipped += 1
                    continue
                apply_issue(conn, repo_id, item, page["kind"])
    run = {
        "started_at": started, "mode": "incremental" if incremental else "full",
        "pages_read": pages, "raw_items": raw_items, "raw_distinct_issues": len(seen),
        "items_skipped": skipped, "rows_changed": conn.total_changes - before,
        "issues_total": conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0],
        "watermark": conn.execute("SELECT MAX(updated_at) FROM issues").fetchone()[0],
        "collected_at": collected_at}
    with conn:
        conn.execute(
            "INSERT INTO load_runs (started_at, mode, pages_read, raw_items, raw_distinct_issues,"
            " items_skipped, rows_changed, issues_total, watermark, collected_at) VALUES "
            "(:started_at, :mode, :pages_read, :raw_items, :raw_distinct_issues, :items_skipped,"
            " :rows_changed, :issues_total, :watermark, :collected_at)", run)
    conn.close()
    return run


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default="data/warehouse.db")
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--incremental", action="store_true")
    args = ap.parse_args()
    for key, value in load(args.db, args.raw, args.incremental).items():
        print(f"{key:20} {value}")


if __name__ == "__main__":
    main()
