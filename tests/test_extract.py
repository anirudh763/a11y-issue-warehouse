import datetime as dt
import json

import pytest

from conftest import FakeSearch
from warehouse import extract


# ---------- rate limit ----------

def test_wait_seconds_prefers_retry_after_then_reset_then_fixed_backoff():
    assert extract.wait_seconds({"retry-after": "7"}, now=100) == 8
    assert extract.wait_seconds({"x-ratelimit-remaining": "0", "x-ratelimit-reset": "130"}, now=100) == 31
    assert extract.wait_seconds({"x-ratelimit-remaining": "0", "x-ratelimit-reset": "50"}, now=100) == 1
    assert extract.wait_seconds({}, now=100) == 60


def test_fetch_json_sleeps_until_reset_and_retries():
    replies = [(403, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1030"}, "{}"),
               (429, {"retry-after": "5"}, "{}"),
               (200, {}, '{"total_count": 0, "items": []}')]
    sleeps = []
    out = extract.fetch_json("search/issues?q=x", get=lambda path: replies.pop(0),
                             sleep=sleeps.append, now=lambda: 1000)
    assert out == {"total_count": 0, "items": []}
    assert sleeps == [31, 6, extract.PAUSE]


def test_fetch_json_gives_up_after_max_tries():
    calls = []

    def always_limited(path):
        calls.append(path)
        return 403, {}, "{}"

    with pytest.raises(RuntimeError, match="still rate limited"):
        extract.fetch_json("p", get=always_limited, sleep=lambda s: None, max_tries=3)
    assert len(calls) == 3


def test_fetch_json_does_not_retry_other_errors():
    with pytest.raises(RuntimeError, match="HTTP 422"):
        extract.fetch_json("p", get=lambda path: (422, {}, "bad query"), sleep=lambda s: None)


def test_http_get_parses_gh_output(monkeypatch):
    class Done:
        stdout = "HTTP/2.0 403 Forbidden\r\nX-Ratelimit-Remaining: 0\r\nRetry-After: 9\r\n\r\n{\"a\":\n\n1}"

    monkeypatch.setattr(extract.shutil, "which", lambda name: "/usr/bin/gh")
    monkeypatch.setattr(extract.subprocess, "run", lambda *a, **k: Done)
    status, headers, body = extract.http_get("search/issues?q=x")
    assert (status, headers["retry-after"], headers["x-ratelimit-remaining"]) == (403, "9", "0")
    assert json.loads(body) == {"a": 1}


# ---------- pagination and date splitting ----------

LO, HI = dt.date(2008, 1, 1), dt.date(2026, 11, 11)


def pager(fake):
    return lambda query, page, per_page: fake(extract.search_path(query, page, per_page))


def test_pagination_returns_every_issue_once(recorded_issues, monkeypatch):
    monkeypatch.setattr(extract, "PER_PAGE", 5)
    fake = FakeSearch(recorded_issues)
    pages = list(extract.search_all("repo:x is:issue", LO, HI, pager(fake)))
    numbers = [i["number"] for _, _, _, resp in pages for i in resp["items"]]
    assert len(pages) == 5 and [p[1] for p in pages] == [1, 2, 3, 4, 5]   # 24 issues, 5 a page
    assert sorted(numbers) == sorted(i["number"] for i in recorded_issues)
    assert len(fake.paths) == 5                                            # no wasted request


def test_date_range_is_split_when_over_the_cap(recorded_issues, monkeypatch):
    monkeypatch.setattr(extract, "SEARCH_CAP", 6)
    monkeypatch.setattr(extract, "PER_PAGE", 4)
    fake = FakeSearch(recorded_issues, cap=6)        # the fake asserts we never page past 6
    pages = list(extract.search_all("repo:x is:issue", LO, HI, pager(fake)))
    numbers = [i["number"] for _, _, _, resp in pages for i in resp["items"]]
    assert sorted(numbers) == sorted(i["number"] for i in recorded_issues)  # all, no repeats
    ranges = sorted({q.split("created:")[1] for q, _, _, _ in pages})
    assert len(ranges) > 1
    spans = [tuple(map(dt.date.fromisoformat, r.split(".."))) for r in ranges]
    assert spans[0][0] == LO and spans[-1][1] == HI
    for (_, end), (start, _) in zip(spans, spans[1:]):                       # adjacent, no overlap
        assert start == end + dt.timedelta(days=1)


def test_split_stops_at_a_single_day(recorded_issues, monkeypatch):
    monkeypatch.setattr(extract, "SEARCH_CAP", 1)
    same_day = [dict(i, created_at="2024-01-01T00:00:00Z") for i in recorded_issues[:3]]
    with pytest.raises(RuntimeError, match="on one day"):
        list(extract.search_all("q", LO, HI, pager(FakeSearch(same_day, cap=1))))


def test_limit_fetches_only_the_oldest_n(recorded_issues):
    fake = FakeSearch(recorded_issues)
    pages = list(extract.search_all("repo:x is:issue", LO, HI, pager(fake), limit=3))
    assert [i["number"] for _, _, _, r in pages for i in r["items"]] == \
        [i["number"] for i in recorded_issues[:3]]
    assert len(fake.paths) == 1 and "per_page=3" in fake.paths[0]


# ---------- the whole run ----------

def test_run_saves_pages_logs_queries_and_samples_matching_months(recorded_issues, tmp_path):
    def match(query, issue):
        labels = [label["name"] for label in issue["labels"]]
        if "label:" in query:
            return "[Area] Accessibility" in labels
        if "talkback" in query:
            return "accessibility" in (issue["title"] + (issue["body"] or "")).lower()
        return True

    fake = FakeSearch(recorded_issues, match=match)
    config = {"created_from": "2008-01-01", "keyword_query": "talkback OR accessibility in:title,body",
              "repos": [{"repo": "o/r", "a11y_label": "[Area] Accessibility"}]}
    log = extract.run(config, tmp_path / "raw", tmp_path / "log.json",
                      fetch=fake, today=dt.date(2026, 11, 11))
    files = sorted((tmp_path / "raw" / "o__r").glob("*.json.gz"))
    assert len(files) == sum(q["pages"] for q in log) == len(fake.paths)
    page = extract.read_page(files[-1])
    assert page["repo"] == "o/r" and page["kind"] == "label" and page["response"]["items"]
    a11y = {i["id"]: i for i in recorded_issues if match("label:", i) or match("talkback", i)}
    months = sorted({i["created_at"][:7] for i in a11y.values()})
    comparison = [q for q in log if q["kind"] == "comparison"]
    assert [q["created"][:7] for q in comparison] == months
    for q in comparison:    # asks for as many issues as that month had accessibility issues
        assert q["limit"] == sum(i["created_at"][:7] == q["created"][:7] for i in a11y.values())
    assert json.loads((tmp_path / "log.json").read_text())["queries"] == log
    # resume: a second run reads the saved pages and makes no requests
    before = len(fake.paths)
    extract.run(config, tmp_path / "raw", tmp_path / "log.json", resume=True,
                fetch=fake, today=dt.date(2026, 11, 11))
    assert len(fake.paths) == before


def test_page_file_names_are_unchanged_for_the_recorded_pages():
    """page_file must keep producing the names already on disk (the hash is a file name,
    not a security measure; usedforsecurity=False must not change it)."""
    from conftest import RAW
    from warehouse.extract import page_file, read_page
    for path in sorted(RAW.rglob("*.json.gz")):
        env = read_page(path)
        assert page_file(RAW, env["repo"], env["kind"], env["query"], env["page"]) == path
