"""Shared fixtures. Nothing in the test suite touches the network.

tests/fixtures/raw/ holds 13 recorded response pages (one small repository, 24 issues)
as warehouse.extract wrote them on 2026-11-11, except that assignee(s) and
milestone.creator were dropped and each real author was replaced by a placeholder
(fixture-user-N, example.invalid URLs). The placeholder authors stay so that the export
privacy test has author data to look for.
"""
import pathlib
import re
import sqlite3
import sys
import urllib.parse

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from warehouse.extract import read_page  # noqa: E402
from warehouse.load import load  # noqa: E402

RAW = ROOT / "tests" / "fixtures" / "raw"


@pytest.fixture(scope="session")
def recorded_issues():
    """The distinct recorded issues, oldest first."""
    items = {}
    for path in sorted(RAW.rglob("*.json.gz")):
        for item in read_page(path)["response"]["items"]:
            items[item["id"]] = item
    return sorted(items.values(), key=lambda i: i["created_at"])


@pytest.fixture
def db(tmp_path):
    """A warehouse loaded from the recorded pages; yields (path, connection)."""
    path = tmp_path / "w.db"
    load(path, RAW)
    conn = sqlite3.connect(path)
    yield path, conn
    conn.close()


class FakeSearch:
    """Answers search paths from a list of recorded issues, like the real endpoint does:
    filters on the created: range, sorts oldest first, pages, and refuses to go past the cap."""

    def __init__(self, issues, cap=1000, match=lambda query, issue: True):
        self.issues, self.cap, self.match, self.paths = issues, cap, match, []

    def __call__(self, path):
        self.paths.append(path)
        params = urllib.parse.parse_qs(urllib.parse.urlparse(path).query)
        query, page, per_page = params["q"][0], int(params["page"][0]), int(params["per_page"][0])
        lo, hi = re.search(r"created:(\S+)\.\.(\S+)", query).groups()
        hits = [i for i in self.issues
                if lo <= i["created_at"][:10] <= hi and self.match(query, i)]
        assert (page - 1) * per_page < self.cap, "asked for results beyond the search cap"
        window = hits[: self.cap][(page - 1) * per_page: page * per_page]
        return {"total_count": len(hits), "incomplete_results": False, "items": window}
