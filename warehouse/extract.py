"""Extract: GitHub issue search -> raw response pages in data/raw/.

For every repository in config.json this runs
  (a) the accessibility queries (label query if the repo has a label, keyword query), and
  (b) a comparison query per calendar month that had accessibility issues, asking for
      the same number of issues created in that month.
Every response page is written (inside a small envelope) as gzip JSON, unchanged except that
the people objects nothing here uses are dropped (see strip_people) and real contact email
addresses in titles and bodies are replaced (see warehouse/redact.py), and every query that
was run is recorded in data/queries_run.json.
"""
import argparse
import calendar
import collections
import datetime as dt
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

from warehouse import redact as email_redact

API = "https://api.github.com/"
SEARCH_CAP = 1000   # GitHub returns at most 1,000 results per search query
PER_PAGE = 100
PAUSE = 2.1         # seconds between calls: the search limit is 30 requests a minute


# ---------- transport ----------

def http_get(path):
    """GET an API path. Returns (status, headers with lower-case names, body text)."""
    if shutil.which("gh"):
        out = subprocess.run(["gh", "api", "-i", path], capture_output=True, text=True).stdout
        head, _, body = re.split(r"(\r?\n\r?\n)", out, maxsplit=1) if out else ("", "", "")
        lines = head.splitlines()
        status = int(lines[0].split()[1]) if lines else 0
        headers = dict((k.strip().lower(), v.strip())
                       for k, v in (line.split(":", 1) for line in lines[1:] if ":" in line))
        return status, headers, body
    req = urllib.request.Request(API + path, headers={
        "Accept": "application/vnd.github+json", "User-Agent": "a11y-issue-warehouse"})
    if os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", "Bearer " + os.environ["GITHUB_TOKEN"])
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read().decode()
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read().decode()


def wait_seconds(headers, now):
    """How long to sleep after a 403/429: Retry-After, else the reset header, else 60 s."""
    if headers.get("retry-after", "").isdigit():
        return int(headers["retry-after"]) + 1
    if headers.get("x-ratelimit-remaining") == "0" and headers.get("x-ratelimit-reset", "").isdigit():
        return max(1, int(headers["x-ratelimit-reset"]) - int(now) + 1)
    return 60


def fetch_json(path, get=http_get, sleep=time.sleep, now=time.time, max_tries=6):
    """GET with rate-limit handling: on 403/429 sleep and retry, otherwise fail loudly."""
    for _ in range(max_tries):
        status, headers, body = get(path)
        if status == 200:
            sleep(PAUSE)
            return json.loads(body)
        if status not in (403, 429):
            raise RuntimeError(f"GET {path} -> HTTP {status}: {body[:200]}")
        sleep(wait_seconds(headers, now()))
    raise RuntimeError(f"GET {path}: still rate limited after {max_tries} tries")


def search_path(query, page, per_page=PER_PAGE):
    return ("search/issues?q=" + urllib.parse.quote_plus(query)
            + f"&sort=created&order=asc&per_page={per_page}&page={page}")


# ---------- pagination and date splitting ----------

def search_all(query, lo, hi, fetch_page, limit=None):
    """Yield (full_query, page_number, per_page, response) for issues created in [lo, hi].

    fetch_page(full_query, page, per_page) returns one decoded response.
    With limit=None every result is wanted, so a range with more than 1,000 results is
    split in half by date and each half is searched separately. With a limit (<= 1,000)
    only the first `limit` results (oldest first) are fetched.
    """
    full = f"{query} created:{lo.isoformat()}..{hi.isoformat()}"
    per_page = min(PER_PAGE, limit or PER_PAGE)
    first = fetch_page(full, 1, per_page)
    wanted = first["total_count"] if limit is None else min(limit, first["total_count"])
    if limit is None and wanted > SEARCH_CAP:
        if lo == hi:
            raise RuntimeError(f"more than {SEARCH_CAP} results on one day: {full}")
        mid = lo + (hi - lo) // 2
        yield from search_all(query, lo, mid, fetch_page)
        yield from search_all(query, mid + dt.timedelta(days=1), hi, fetch_page)
        return
    page, got, resp = 1, 0, first
    while True:
        yield full, page, per_page, resp
        got += len(resp["items"])
        if got >= wanted or not resp["items"]:
            return
        page += 1
        resp = fetch_page(full, page, per_page)


# ---------- raw page storage ----------

def page_file(raw_dir, repo, kind, query, page):
    # SHA-1 only names the file after its query; it protects nothing.
    digest = hashlib.sha1(query.encode(), usedforsecurity=False).hexdigest()[:12]
    return pathlib.Path(raw_dir) / repo.replace("/", "__") / f"{kind}-{digest}-p{page:02d}.json.gz"


# Objects that describe people (login, avatar and profile URLs). Nothing in the pipeline,
# the analysis or reproduction/ reads them, so they are not stored (data minimisation).
# Each issue keeps its html_url, so every record stays traceable to GitHub.
PEOPLE_KEYS = ("user", "assignee", "assignees")


def strip_people(item):
    """Return a copy of one search result without user, assignee(s) and milestone.creator."""
    out = {k: v for k, v in item.items() if k not in PEOPLE_KEYS}
    if isinstance(out.get("milestone"), dict):
        out["milestone"] = {k: v for k, v in out["milestone"].items() if k != "creator"}
    return out


def write_page(path, envelope):
    resp = envelope.get("response")
    if isinstance(resp, dict) and isinstance(resp.get("items"), list):
        envelope = {**envelope, "response": {**resp, "items": [
            email_redact.redact_item(strip_people(i)) for i in resp["items"]]}}
    save_page(path, envelope)


def save_page(path, envelope):
    """Write an envelope as gzip JSON exactly as given (deterministic bytes)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
        gz.write(json.dumps(envelope, ensure_ascii=False).encode())


def read_page(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def minimise(raw_dir):
    """Rewrite saved pages as write_page saves them today (no people objects, contact
    addresses redacted). Idempotent; returns the number of pages rewritten."""
    changed = 0
    for path in sorted(pathlib.Path(raw_dir).rglob("*.json.gz")):
        before = path.read_bytes()
        write_page(path, read_page(path))
        changed += path.read_bytes() != before
    return changed


def email_counts(raw_dir):
    """Email-shaped matches in titles and bodies of the saved pages, by category.

    Counts only, never values. Returns (matches per category over all page items,
    distinct issues (html_url) with a match per category)."""
    matches = collections.Counter({c: 0 for c in email_redact.CATEGORIES})
    issues = collections.defaultdict(set)
    for path in sorted(pathlib.Path(raw_dir).rglob("*.json.gz")):
        for item in read_page(path)["response"]["items"]:
            for key in ("title", "body"):
                for _, _, cat in email_redact.classify(item.get(key) or ""):
                    matches[cat] += 1
                    issues[cat].add(item.get("html_url"))
    return matches, {c: len(issues[c]) for c in email_redact.CATEGORIES}


def redact_pages(raw_dir):
    """--redact: replace contact addresses in the titles and bodies of saved pages and change
    nothing else. Idempotent. Returns (pages rewritten, counts before as email_counts)."""
    before = email_counts(raw_dir)
    changed = 0
    for path in sorted(pathlib.Path(raw_dir).rglob("*.json.gz")):
        env = read_page(path)
        items = env["response"]["items"]
        new = [email_redact.redact_item(i) for i in items]
        if new != items:
            save_page(path, {**env, "response": {**env["response"], "items": new}})
            changed += 1
    return changed, before


# ---------- the run ----------

def month_bounds(month):
    year, mon = int(month[:4]), int(month[5:7])
    return dt.date(year, mon, 1), dt.date(year, mon, calendar.monthrange(year, mon)[1])


def run(config, raw_dir, log_path, since=None, resume=False, fetch=fetch_json, today=None):
    """Run all queries for all repositories. Returns the list of query log entries."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    lo = dt.date.fromisoformat(config["created_from"])
    log = []

    def collect(spec, kind, query, start, end, limit=None):
        """Run one query, save its pages, log it, return its items."""
        repo, items, pages, total = spec["repo"], [], 0, 0

        def fetch_page(full, page, per_page):
            path = page_file(raw_dir, repo, kind, full, page)
            if resume and path.exists():
                return read_page(path)["response"]
            return fetch(search_path(full, page, per_page))

        for full, page, per_page, resp in search_all(query, start, end, fetch_page, limit):
            path = page_file(raw_dir, repo, kind, full, page)
            if not (resume and path.exists()):
                write_page(path, {
                    "repo": repo, "a11y_label": spec.get("a11y_label"), "kind": kind,
                    "query": full, "page": page, "per_page": per_page,
                    "fetched_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "response": resp})
            if page == 1:
                total += resp["total_count"]
            pages += 1
            items += resp["items"][: (limit - len(items)) if limit else None]
        log.append({"repo": repo, "kind": kind, "query": query, "created": f"{start}..{end}",
                    "limit": limit, "total_count": total, "pages": pages, "items": len(items)})
        return items

    for spec in config["repos"]:
        repo, extra = spec["repo"], (f" updated:>={since}" if since else "")
        a11y = {}
        if spec.get("a11y_label"):
            query = f'repo:{repo} is:issue label:"{spec["a11y_label"]}"{extra}'
            a11y.update((i["id"], i) for i in collect(spec, "label", query, lo, today))
        query = f'repo:{repo} is:issue {config["keyword_query"]}{extra}'
        a11y.update((i["id"], i) for i in collect(spec, "keyword", query, lo, today))
        if since:
            continue  # incremental runs refresh the accessibility issues only
        per_month = collections.Counter(i["created_at"][:7] for i in a11y.values())
        for month, count in sorted(per_month.items()):
            collect(spec, "comparison", f"repo:{repo} is:issue", *month_bounds(month), limit=count)
        print(f"{repo}: {len(a11y)} accessibility issues, {len(per_month)} months sampled", flush=True)

    log_path = pathlib.Path(log_path)
    old = json.loads(log_path.read_text())["queries"] if log_path.exists() and since else []
    log_path.write_text(json.dumps({
        "collected_on": today.isoformat(), "since": since,
        "endpoint": "GET https://api.github.com/search/issues?q=<query>+created:<range>"
                    "&sort=created&order=asc&per_page=<n>&page=<p>",
        "queries": old + log}, indent=1) + "\n")
    return log


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--log", default="data/queries_run.json")
    ap.add_argument("--since", help="YYYY-MM-DD: only accessibility issues updated on/after this day")
    ap.add_argument("--resume", action="store_true", help="reuse pages already in --raw")
    ap.add_argument("--minimise", metavar="DIR", help="only rewrite saved pages in DIR without people objects")
    ap.add_argument("--redact", metavar="DIR",
                    help="only rewrite saved pages in DIR with contact email addresses redacted "
                         "(prints counts by category, never values)")
    args = ap.parse_args()
    if args.redact:
        changed, (matches, issues) = redact_pages(args.redact)
        for cat in email_redact.CATEGORIES:
            print(f"{cat:12} {matches[cat]:5} matches in page items, {issues[cat]:4} distinct issues")
        print(f"{changed} pages rewritten with contact addresses redacted")
        return
    if args.minimise:
        print(f"{minimise(args.minimise)} pages rewritten without people objects")
        return
    config = json.loads(pathlib.Path(args.config).read_text())
    log = run(config, args.raw, args.log, since=args.since, resume=args.resume)
    print(f"{len(log)} queries, {sum(q['pages'] for q in log)} pages -> {args.raw}")


if __name__ == "__main__":
    main()
