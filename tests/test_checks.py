"""Every check passes on the recorded data and fires on a database broken for that check."""
import pathlib
import sqlite3

import pytest

from warehouse.checks import CHECKS, parse_checks, run_checks

SQL = {name: sql for name, sql, _ in parse_checks(CHECKS.read_text())}
ONE = "(SELECT MIN(id) FROM issues)"


def loosen(conn):
    """Rebuild `issues` with the same columns but no constraints, so duplicates can be inserted."""
    conn.executescript("""
        DROP VIEW issue_class;
        CREATE TABLE loose (id INTEGER, repo_id INTEGER, number INTEGER, title TEXT, body TEXT,
            state TEXT, state_reason TEXT, created_at TEXT, closed_at TEXT, updated_at TEXT,
            comments INTEGER, author_association TEXT);
        INSERT INTO loose SELECT * FROM issues;
        DROP TABLE issues;
        ALTER TABLE loose RENAME TO issues;""")


def dup_id(conn):
    loosen(conn)
    conn.execute(f"INSERT INTO issues SELECT * FROM issues WHERE id = {ONE}")


def dup_number(conn):
    loosen(conn)
    conn.execute("INSERT INTO issues SELECT id + 1000000000000, repo_id, number, title, body, state,"
                 " state_reason, created_at, closed_at, updated_at, comments, author_association"
                 f" FROM issues WHERE id = {ONE}")


BREAK = {
    "issues_id_unique": dup_id,
    "repo_number_unique": dup_number,
    "issues_repo_fk": f"UPDATE issues SET repo_id = 999 WHERE id = {ONE}",
    "issue_labels_issue_fk": "INSERT INTO issue_labels VALUES (999, (SELECT MIN(id) FROM labels))",
    "issue_labels_label_fk": f"INSERT INTO issue_labels VALUES ({ONE}, 999)",
    "no_orphan_labels": "INSERT INTO labels VALUES (999, 1, 'never used')",
    "label_belongs_to_issue_repo":
        "UPDATE labels SET repo_id = 2 WHERE id = (SELECT MIN(label_id) FROM issue_labels)",
    "closed_at_not_before_created_at":
        f"UPDATE issues SET state = 'closed', closed_at = '2000-01-01T00:00:00Z' WHERE id = {ONE}",
    "updated_at_not_before_created_at":
        f"UPDATE issues SET updated_at = '2000-01-01T00:00:00Z' WHERE id = {ONE}",
    "state_matches_closed_at":
        "UPDATE issues SET closed_at = NULL WHERE id = (SELECT MIN(id) FROM issues WHERE state = 'closed')",
    "state_values_valid": f"UPDATE issues SET state_reason = 'vanished' WHERE id = {ONE}",
    "title_not_empty": f"UPDATE issues SET title = '   ' WHERE id = {ONE}",
    "timestamps_are_utc_iso8601":
        f"UPDATE issues SET created_at = '2023-01-11 10:00:00+01:00' WHERE id = {ONE}",
    "comments_not_negative": f"UPDATE issues SET comments = -1 WHERE id = {ONE}",
    "expected_columns_and_types": "ALTER TABLE issues DROP COLUMN author_association",
    "issue_count_matches_raw_pages": f"DELETE FROM issues WHERE id = {ONE}",
    "every_issue_has_a_source": f"DELETE FROM issue_sources WHERE issue_id = {ONE}",
    "a11y_label_implies_label_source": "DELETE FROM issue_sources WHERE source = 'label'",
    "keyword_source_has_keyword_in_text":
        "UPDATE issues SET title = 'x', body = NULL WHERE id = "
        "(SELECT MIN(issue_id) FROM issue_sources WHERE source = 'keyword')",
}


def test_at_least_twelve_checks_and_each_has_a_breaking_case():
    assert len(SQL) >= 12
    assert set(SQL) == set(BREAK)


def test_all_checks_pass_on_the_recorded_data(db):
    _, conn = db
    results = run_checks(conn)
    assert len(results) == len(SQL)
    assert [(name, bad) for name, bad, _ in results if bad] == []


@pytest.mark.parametrize("name", sorted(BREAK))
def test_check_fires_on_broken_database(db, name):
    _, conn = db          # opened without PRAGMA foreign_keys, so bad references can be written
    assert conn.execute(SQL[name]).fetchone()[0] == 0
    if callable(BREAK[name]):
        BREAK[name](conn)
    else:
        conn.execute(BREAK[name])
    assert conn.execute(SQL[name]).fetchone()[0] >= 1


def test_known_note_is_parsed_and_reported():
    text = "-- check: a\n-- known: explained in README\nSELECT 3;\n\n-- check: b\nSELECT 0;\n"
    assert run_checks(sqlite3.connect(":memory:"), text) == [("a", 3, "explained in README"), ("b", 0, None)]


def test_checks_file_has_no_stray_sql_outside_checks():
    head = CHECKS.read_text().split("-- check: ")[0]
    assert all(line.startswith("--") or not line.strip() for line in head.splitlines())
    assert pathlib.Path(CHECKS).name == "checks.sql"
