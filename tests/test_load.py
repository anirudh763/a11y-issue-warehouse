import copy
import shutil
import sqlite3

from conftest import RAW
from warehouse.extract import read_page, write_page
from warehouse.load import load

TABLES = ["repos", "issues", "labels", "issue_labels", "issue_sources"]


def dump(path):
    conn = sqlite3.connect(path)
    out = {t: conn.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall() for t in TABLES}
    conn.close()
    return out


def test_first_load_matches_the_recorded_pages(tmp_path):
    run = load(tmp_path / "w.db", RAW)
    assert (run["pages_read"], run["raw_items"], run["raw_distinct_issues"]) == (13, 32, 24)
    assert run["issues_total"] == 24 and run["rows_changed"] > 0
    data = dump(tmp_path / "w.db")
    assert len(data["issues"]) == 24 and len(data["repos"]) == 1


def test_second_load_changes_zero_rows(tmp_path):
    db = tmp_path / "w.db"
    load(db, RAW)
    before = dump(db)
    again = load(db, RAW)
    assert again["rows_changed"] == 0
    assert dump(db) == before
    runs = sqlite3.connect(db).execute("SELECT mode, rows_changed FROM load_runs ORDER BY id").fetchall()
    assert len(runs) == 2 and runs[1] == ("full", 0)


def later_page(tmp_path, name, mutate):
    """Copy the recorded pages and add one page whose first item is changed by `mutate`."""
    raw = tmp_path / name
    shutil.copytree(RAW, raw)
    page = copy.deepcopy(read_page(sorted(RAW.rglob("label-*.json.gz"))[0]))
    page["response"]["items"] = page["response"]["items"][:1]
    mutate(page["response"]["items"][0])
    page["fetched_at"] = "2026-12-01T00:00:00Z"
    write_page(raw / "Automattic__pocket-casts-android" / "aaa-first-in-sort-order.json.gz", page)
    return raw, page["response"]["items"][0]


def test_newest_copy_wins_whatever_the_page_order(tmp_path):
    def close_it(item):
        item.update(state="closed", closed_at="2026-11-30T00:00:00Z",
                    updated_at="2026-11-30T00:00:00Z", labels=item["labels"][:1])

    # the changed page sorts first, so the older recorded copies are applied after it
    raw, item = later_page(tmp_path, "raw", close_it)
    db = tmp_path / "w.db"
    load(db, raw)
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT state, updated_at FROM issues WHERE id = ?", (item["id"],)).fetchone() \
        == ("closed", "2026-11-30T00:00:00Z")
    assert conn.execute("SELECT COUNT(*) FROM issue_labels WHERE issue_id = ?", (item["id"],)).fetchone()[0] == 1
    assert load(db, raw)["rows_changed"] == 0


def test_incremental_load_applies_only_items_past_the_watermark(tmp_path):
    db = tmp_path / "w.db"
    first = load(db, RAW)

    def touch(item):
        item.update(title="Edited title", updated_at="2026-11-30T00:00:00Z")

    raw, item = later_page(tmp_path, "raw", touch)
    run = load(db, raw, incremental=True)
    assert run["mode"] == "incremental"
    assert run["items_skipped"] == first["raw_items"]        # every old item skipped unread
    assert run["rows_changed"] == 1 + 2 * len(item["labels"])  # issue row + its labels replaced
    assert run["watermark"] == "2026-11-30T00:00:00Z" > first["watermark"]
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT title FROM issues WHERE id = ?", (item["id"],)).fetchone()[0] == "Edited title"
    assert load(db, raw, incremental=True)["rows_changed"] == 0


def test_incremental_load_ignores_an_item_older_than_the_watermark(tmp_path):
    db = tmp_path / "w.db"
    load(db, RAW)

    def stale(item):
        item.update(title="Stale copy", updated_at="2001-01-01T00:00:00Z")

    raw, item = later_page(tmp_path, "raw", stale)
    assert load(db, raw, incremental=True)["rows_changed"] == 0
    assert load(db, raw)["rows_changed"] == 0                 # full mode refuses it too: not newer


def test_pull_requests_are_not_loaded(tmp_path):
    def make_pr(item):
        item.update(id=999999, number=999999, pull_request={"url": "x"})

    raw, _ = later_page(tmp_path, "raw", make_pr)
    run = load(tmp_path / "w.db", raw)
    assert run["issues_total"] == 24
