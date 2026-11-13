"""Data minimisation: saved pages carry no people objects, and every record stays traceable."""
import gzip
import json
import pathlib

from warehouse.extract import minimise, read_page, write_page

ROOT = pathlib.Path(__file__).resolve().parent.parent
PERSON = {"login": "someone", "id": 7, "avatar_url": "https://avatars.example.invalid/7",
          "html_url": "https://github.example.invalid/someone"}


def item():
    return {"id": 1, "number": 5, "title": "TalkBack skips the button",
            "body": "Steps: open settings", "html_url": "https://github.com/o/r/issues/5",
            "labels": [{"id": 3, "name": "a11y"}], "user": PERSON, "assignee": PERSON,
            "assignees": [PERSON], "milestone": {"title": "1.0", "creator": PERSON},
            "author_association": "NONE", "updated_at": "2026-11-01T00:00:00Z"}


def test_write_page_drops_people_and_keeps_everything_else(tmp_path):
    path = tmp_path / "o__r" / "label-x-p01.json.gz"
    write_page(path, {"repo": "o/r", "response": {"total_count": 1, "items": [item()]}})
    saved = read_page(path)["response"]["items"][0]
    assert "login" not in json.dumps(saved)
    assert not {"user", "assignee", "assignees"} & set(saved)
    assert saved["milestone"] == {"title": "1.0"}
    expected = {k: v for k, v in item().items() if k not in ("user", "assignee", "assignees", "milestone")}
    assert {k: v for k, v in saved.items() if k != "milestone"} == expected


def test_minimise_rewrites_old_pages_once(tmp_path):
    path = tmp_path / "o__r" / "label-x-p01.json.gz"
    path.parent.mkdir(parents=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:  # an old page, people included
        json.dump({"repo": "o/r", "response": {"items": [item()]}}, fh)
    assert minimise(tmp_path) == 1
    assert "login" not in json.dumps(read_page(path))
    assert minimise(tmp_path) == 0


def test_committed_raw_pages_have_no_people_and_every_issue_has_its_url():
    pages = sorted((ROOT / "data" / "raw").rglob("*.json.gz"))
    assert len(pages) == 496
    for path in pages:
        env = read_page(path)
        for it in env["response"]["items"]:
            assert not {"user", "assignee", "assignees"} & set(it), path
            assert "creator" not in (it.get("milestone") or {}), path
            assert it["html_url"] == f"https://github.com/{env['repo']}/issues/{it['number']}", path
