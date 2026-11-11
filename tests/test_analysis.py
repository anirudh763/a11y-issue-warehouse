"""The analysis SQL gives hand-computed answers on a ten-issue database."""
import pathlib
import sqlite3
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "analysis"))
from run_analysis import run_sql_file  # noqa: E402

from warehouse.load import connect  # noqa: E402

Z = "T00:00:00Z"
#        id repo created      closed        sources
ISSUES = [(1, 1, "2020-01-01", "2020-01-11", ["label"]),              # 10 days
          (2, 1, "2020-06-01", "2020-06-21", ["keyword"]),            # 20 days
          (3, 1, "2021-03-01", "2022-06-04", ["label", "keyword"]),   # 460 days
          (4, 1, "2021-05-01", None, ["label"]),
          (5, 1, "2024-06-01", None, ["keyword"]),                    # under a year old
          (6, 1, "2020-01-15", "2020-01-20", ["comparison"]),         # 5 days
          (7, 1, "2021-03-10", "2021-03-13", ["comparison"]),         # 3 days
          (8, 1, "2023-01-01", None, ["comparison"]),
          (9, 2, "2022-02-01", "2022-02-03", ["keyword"]),            # 2 days
          (10, 2, "2022-02-10", "2022-02-11", ["comparison"]),        # 1 day
          # returned by the keyword search without containing a search word: in no analysis
          (11, 1, "2020-01-02", "2020-01-03", ["keyword"])]
UNCONFIRMED = {11}
LABELS = {10: "a11y", 11: "bug", 12: "ui"}
ISSUE_LABELS = [(1, 10), (1, 11), (3, 10), (3, 11), (3, 12), (4, 10), (6, 11)]


@pytest.fixture
def conn(tmp_path):
    conn = connect(tmp_path / "tiny.db")
    conn.execute("INSERT INTO repos VALUES (1, 'o/a', 'u', 'A11Y'), (2, 'o/b', 'u', NULL)")
    for id_, repo, created, closed, sources in ISSUES:
        conn.execute("INSERT INTO issues VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                     (id_, repo, id_, "Crash" if id_ in UNCONFIRMED else "TalkBack skips button", "", "closed" if closed else "open", None,
                      created + Z, closed + Z if closed else None, (closed or created) + Z, 0, "NONE"))
        conn.executemany("INSERT INTO issue_sources VALUES (?, ?)", [(id_, s) for s in sources])
    conn.executemany("INSERT INTO labels VALUES (?, 1, ?)", LABELS.items())
    conn.executemany("INSERT INTO issue_labels VALUES (?, ?)", ISSUE_LABELS)
    conn.execute("INSERT INTO load_runs VALUES (1, 'x', 'full', 0, 0, 11, 0, 0, 11, 'x', '2025-01-01T00:00:00Z')")
    conn.commit()
    return conn


def rows(conn, name):
    return run_sql_file(conn, ROOT / "analysis" / name)[1]


def test_opened_per_year_with_running_total(conn):
    assert rows(conn, "01_opened_per_year.sql") == [
        ("o/a", 2020, 2, 2), ("o/a", 2021, 2, 4), ("o/a", 2024, 1, 5), ("o/b", 2022, 1, 1)]


def test_median_and_p90_days_to_close(conn):
    assert rows(conn, "02_days_to_close.sql") == [
        ("(all repositories)", "accessibility", 4, 10.0, 460.0),
        ("(all repositories)", "other", 3, 3.0, 5.0),
        ("o/a", "accessibility", 3, 20.0, 460.0),
        ("o/a", "other", 2, 3.0, 5.0),
        ("o/b", "accessibility", 1, 2.0, 2.0),
        ("o/b", "other", 1, 1.0, 1.0)]


def test_share_open_after_one_year(conn):
    assert rows(conn, "03_open_after_one_year.sql") == [
        ("(all repositories)", "accessibility", 5, 2, 40.0),
        ("(all repositories)", "other", 4, 1, 25.0),
        ("o/a", "accessibility", 4, 2, 50.0),      # issue 5 is too recent to count
        ("o/a", "other", 3, 1, 33.3),
        ("o/b", "accessibility", 1, 0, 0.0),
        ("o/b", "other", 1, 0, 0.0)]


def test_label_cooccurrence(conn):
    assert rows(conn, "04_label_cooccurrence.sql") == [
        ("o/a", 1, "bug", 2, 3, 66.7, 33.3), ("o/a", 2, "ui", 1, 3, 33.3, 0.0)]


def test_comparison_date_match_is_the_same_with_and_without_the_index(conn):
    expected = [("o/a", 5, 2, 40.0, 0.4), ("o/b", 1, 1, 100.0, 1.0)]
    assert rows(conn, "05_comparison_date_match.sql") == expected
    conn.execute("DROP INDEX idx_issues_repo_created")
    assert rows(conn, "05_comparison_date_match.sql") == expected


def test_unconfirmed_keyword_hit_is_left_out_of_the_classification(conn):
    assert conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0] == 11
    assert conn.execute("SELECT COUNT(*), SUM(is_a11y) FROM issue_class").fetchone() == (10, 6)
    assert conn.execute("SELECT COUNT(*) FROM issue_class WHERE issue_id = 11").fetchone()[0] == 0
