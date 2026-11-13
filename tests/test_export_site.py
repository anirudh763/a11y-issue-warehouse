"""The explorer export (warehouse/export_site.py) matches the database and leaks nothing private."""
import collections
import json
import re
import sqlite3

import pytest
from conftest import RAW, ROOT

from warehouse import export_site
from warehouse.extract import read_page
from warehouse.load import load

DOCS = ROOT / "docs"
SAMPLE_SQL = {
    "a11y": "SELECT COUNT(*) FROM issue_class WHERE is_a11y = 1",
    "comparison": "SELECT COUNT(*) FROM issue_class WHERE is_a11y = 0",
    "excluded": "SELECT COUNT(*) FROM issues WHERE id NOT IN (SELECT issue_id FROM issue_class)",
}


def counts_from_export(data):
    per_app = collections.Counter(data["repos"][row[0]]["name"] for row in data["issues"])
    per_sample = collections.Counter(data["samples"][row[8]] for row in data["issues"])
    per_app_sample = collections.Counter(
        (data["repos"][row[0]]["name"], data["samples"][row[8]]) for row in data["issues"])
    return per_app, per_sample, per_app_sample


def counts_from_db(conn):
    per_app = collections.Counter(dict(conn.execute(
        "SELECT r.full_name, COUNT(*) FROM issues i JOIN repos r ON r.id = i.repo_id GROUP BY 1")))
    per_sample = collections.Counter({k: conn.execute(sql).fetchone()[0] for k, sql in SAMPLE_SQL.items()})
    per_app_sample = collections.Counter({
        (repo, {1: "a11y", 0: "comparison", None: "excluded"}[cls]): n
        for repo, cls, n in conn.execute(
            "SELECT r.full_name, c.is_a11y, COUNT(*) FROM issues i JOIN repos r ON r.id = i.repo_id "
            "LEFT JOIN issue_class c ON c.issue_id = i.id GROUP BY 1, 2")})
    return per_app, per_sample, per_app_sample


def test_export_counts_match_the_database(db):
    path, conn = db
    data = export_site.build(path)
    assert counts_from_export(data) == counts_from_db(conn)
    assert len(data["issues"]) == conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0] == 24


def test_export_fields_match_issue_rows(db):
    path, conn = db
    data = export_site.build(path)
    f = {name: i for i, name in enumerate(data["fields"])}
    for row in data["issues"]:
        repo = data["repos"][row[f["repo"]]]["name"]
        title, state, created, closed = conn.execute(
            "SELECT i.title, i.state, i.created_at, i.closed_at FROM issues i JOIN repos r "
            "ON r.id = i.repo_id WHERE r.full_name = ? AND i.number = ?", (repo, row[f["number"]])).fetchone()
        assert (row[f["title"]], row[f["state"]], row[f["created_at"]], row[f["closed_at"]]) == \
            (title, state, created, closed)
        labels = sorted(n for (n,) in conn.execute(
            "SELECT l.name FROM issue_labels il JOIN labels l ON l.id = il.label_id JOIN issues i "
            "ON i.id = il.issue_id WHERE i.number = ?", (row[f["number"]],)))
        assert sorted(data["labels"][i] for i in row[f["labels"]]) == labels


def test_search_word_flags_agree_with_the_issue_class_view(db):
    """An issue is a keyword-confirmed accessibility issue exactly when it came from the
    keyword query and has a search-word flag; the view and the export must agree."""
    path, conn = db
    data = export_site.build(path)
    by_keyword_export = sum(1 for r in data["issues"] if r[9] & 2 and r[10])
    by_keyword_view = conn.execute("SELECT COUNT(*) FROM issue_class WHERE by_keyword").fetchone()[0]
    assert by_keyword_export == by_keyword_view


def test_no_bodies_authors_or_avatars_in_the_export(db, recorded_issues):
    path, _ = db
    text = export_site.render(export_site.build(path))
    titles = " ".join(i["title"] for i in recorded_issues)
    assert not re.search(r'"(body|user|login|avatar_url|author_association)"', text)
    for issue in recorded_issues:
        login = issue["user"]["login"]
        assert login not in text or login in titles, login
        assert issue["user"]["avatar_url"] not in text
        for chunk in re.findall(r"[^\n]{40}", issue.get("body") or "")[:5]:
            assert chunk not in text or chunk in titles


def test_check_mode_detects_a_stale_file(db, tmp_path, capsys):
    path, _ = db
    out = tmp_path / "site"
    assert export_site.main(["--db", str(path), "--out", str(out)]) == 0
    assert export_site.main(["--db", str(path), "--out", str(out), "--check"]) == 0
    stale = out / export_site.FILENAME
    stale.write_text(stale.read_text().replace('"open"', '"closed"', 1))
    assert export_site.main(["--db", str(path), "--out", str(out), "--check"]) == 1
    assert "out of date" in capsys.readouterr().err


def test_unexpected_repository_name_is_refused(db):
    path, conn = db
    conn.execute("UPDATE repos SET full_name = 'evil/x\"><script>'")
    conn.commit()
    with pytest.raises(ValueError, match="repository name"):
        export_site.build(path)


def test_render_is_deterministic(db):
    path, _ = db
    assert export_site.render(export_site.build(path)) == export_site.render(export_site.build(path))
    json.loads(export_site.render(export_site.build(path)))


def test_leakage_numbers_are_the_measured_ones():
    rows = export_site.read_leakage(ROOT / "results")
    csv_text = (ROOT / "results" / "classifier_overall.csv").read_text()
    assert [r["system"] for r in rows] == re.findall(r'^"([^"]+)"', csv_text, flags=re.M)
    masked = next(r for r in rows if r["system"] == "tfidf+logreg, masked text")
    assert (masked["f1"], masked["f1_ci95_low"], masked["f1_ci95_high"]) == tuple(
        float(v) for v in re.search(r'"tfidf\+logreg, masked text",(?:[^,]*,){4}([^,]+),([^,]+),([^,]+)',
                                    csv_text).groups())


@pytest.fixture(scope="module")
def real_db(tmp_path_factory):
    raw = ROOT / "data" / "raw"
    if not any(raw.rglob("*.json.gz")):
        pytest.skip("data/raw is not present")
    path = tmp_path_factory.mktemp("real") / "warehouse.db"
    load(path, raw)
    return path


def test_committed_site_data_is_up_to_date(real_db):
    """docs/data/issues.json equals a fresh export of the committed raw pages."""
    committed = (DOCS / "data" / export_site.FILENAME).read_text(encoding="utf-8")
    assert committed == export_site.render(export_site.build(real_db)), "run `make load site`"


def test_committed_site_data_counts_per_app_and_sample(real_db):
    data = json.loads((DOCS / "data" / export_site.FILENAME).read_text(encoding="utf-8"))
    conn = sqlite3.connect(real_db)
    per_app, per_sample, per_app_sample = counts_from_export(data)
    assert (per_app, per_sample, per_app_sample) == counts_from_db(conn)
    # the README's headline numbers
    assert sum(per_app.values()) == 2643
    assert (per_sample["a11y"], per_sample["comparison"], per_sample["excluded"]) == (1187, 1290, 166)


def test_site_scripts_never_build_html_from_strings():
    """Titles and labels are untrusted: the site must not use HTML-parsing sinks."""
    for js in DOCS.glob("*.js"):
        src = js.read_text()
        for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write",
                     "eval(", "new Function", "setAttribute('on", "srcdoc"):
            assert sink not in src, f"{js.name} uses {sink}"
    html = (DOCS / "index.html").read_text()
    assert "Content-Security-Policy" in html and "script-src 'self'" in html
    assert "<script>" not in html and "style=" not in html


def test_fixture_titles_survive_unchanged(db, recorded_issues):
    path, _ = db
    exported = {row[2] for row in export_site.build(path)["issues"]}
    assert exported == {i["title"] for i in recorded_issues}


def test_recorded_pages_have_users(recorded_issues):
    """Guard for the privacy test above: the fixtures really contain author data."""
    assert all(i["user"]["login"] for i in recorded_issues)
    assert read_page(sorted(RAW.rglob("*.json.gz"))[0])["response"]["items"][0]["user"]["avatar_url"]


def test_email_addresses_never_reach_the_export(db):
    """Titles and labels are written by the public; an address in them must not be republished."""
    path, conn = db
    conn.execute("UPDATE issues SET title = 'mail me at jane.doe+bugs@example.co.uk please' "
                 "WHERE id = (SELECT MIN(id) FROM issues)")
    conn.execute("UPDATE labels SET name = 'owner:dev@example.org' WHERE id = (SELECT MIN(label_id) FROM issue_labels)")
    conn.commit()
    text = export_site.render(export_site.build(path))
    assert not export_site.EMAIL_RE.search(text)
    assert "mail me at [email removed] please" in text
    assert "owner:[email removed]" in text


def test_redact_keeps_ordinary_titles():
    assert export_site.redact("TalkBack reads @mention as 'at mention'") == "TalkBack reads @mention as 'at mention'"
    assert export_site.redact("1.dead.mavis@gmail.com") == "[email removed]"


def test_committed_site_data_has_no_email_addresses():
    text = (DOCS / "data" / export_site.FILENAME).read_text(encoding="utf-8")
    assert not re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text)
    data = json.loads(text)
    fenix = next(i for i, r in enumerate(data["repos"]) if r["name"] == "mozilla-mobile/fenix")
    assert next(r[2] for r in data["issues"] if r[0] == fenix and r[1] == 28360) == "[email removed]"
