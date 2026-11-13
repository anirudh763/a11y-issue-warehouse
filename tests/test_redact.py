"""Email redaction: only real contact addresses go, everything else and traceability stay."""
import gzip
import json
import pathlib

import pytest

from warehouse import extract
from warehouse.redact import REDACTED, classify, redact, redact_item

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Synthetic text only; none of these addresses comes from the data.
CASES = [
    # (text, expected categories in order, expected text after redaction)
    ("Mail me at jane.roe42@gmail.com please", ["contact"],
     f"Mail me at {REDACTED} please"),
    ("Reporter: Pat Doe <pat.doe@corp-mail.co.uk>", ["contact"],
     f"Reporter: Pat Doe <{REDACTED}>"),
    ("[write to us](mailto:sam@fixture-project.dev)", ["contact", "contact"][:1],
     f"[write to us](mailto:{REDACTED})"),
    ("Sign in as user@example.com, or test@example.org", ["placeholder", "placeholder"],
     "Sign in as user@example.com, or test@example.org"),
    ("Use you@domain.com or anyone@host.invalid", ["placeholder", "placeholder"],
     "Use you@domain.com or anyone@host.invalid"),
    ("Config: `owner = dana.k@gmail.com`", ["code"], "Config: `owner = dana.k@gmail.com`"),
    ("Log:\n```\nW/Sync: account lee.v@outlook.com failed\n```\nthanks", ["code"],
     "Log:\n```\nW/Sync: account lee.v@outlook.com failed\n```\nthanks"),
    ("Co-authored-by: 12345+kit@users.noreply.github.com", ["role"],
     "Co-authored-by: 12345+kit@users.noreply.github.com"),
    ("Contact support@fixture-app.org or security@fixture-app.org", ["role", "role"],
     "Contact support@fixture-app.org or security@fixture-app.org"),
    ("signed URL ?GoogleAccessId=builder@proj-1.iam.gserviceaccount.com&Expires=1", ["role"],
     "signed URL ?GoogleAccessId=builder@proj-1.iam.gserviceaccount.com&Expires=1"),
    ("Installed extensions:\n  \"id\": \"helper@fixture-addons.org\"", ["identifier"],
     "Installed extensions:\n  \"id\": \"helper@fixture-addons.org\""),
    # An add-on ID on a free-mail domain is a person's address: it is redacted.
    ("Installed extensions:\n  \"id\": \"rob.dev@gmail.com\"", ["contact"],
     f"Installed extensions:\n  \"id\": \"{REDACTED}\""),
    # A line about mail inside an extension list is still a contact address.
    ("Add-ons below. Email the author: kim@fixture-addons.org", ["contact"],
     f"Add-ons below. Email the author: {REDACTED}"),
    ("Assets: icon@2x.png and banner@3x.webp", ["not_address", "not_address"],
     "Assets: icon@2x.png and banner@3x.webp"),
    ("TalkBack reads @mention and react@18.2.0 is fine", [],
     "TalkBack reads @mention and react@18.2.0 is fine"),
]


@pytest.mark.parametrize("text, cats, expected", CASES)
def test_each_category_is_classified_and_only_contacts_are_redacted(text, cats, expected):
    assert [c for _, _, c in classify(text)] == cats
    assert redact(text) == expected
    assert redact(expected) == expected  # idempotent


def test_mixed_text_keeps_offsets_right():
    text = "a@b-fixture.com, `c@d-fixture.com`, e@example.com, f@g-fixture.com"
    assert redact(text) == f"{REDACTED}, `c@d-fixture.com`, e@example.com, {REDACTED}"


def test_unclosed_fence_counts_as_code_to_the_end():
    assert [c for _, _, c in classify("```\nx.y@gmail.com")] == ["code"]


def test_long_input_is_linear():
    # Bounded quantifiers: a pathological string finishes quickly and finds nothing.
    assert classify("a" * 200_000 + "@" + "b." * 50_000) == []


def page_item():
    return {"id": 1, "number": 9, "title": "Crash, write to ann.lee@gmail.com",
            "body": "Steps\n\nCC: bo.chen@fixture-corp.com, support@fixture-corp.com",
            "html_url": "https://github.com/o/r/issues/9", "labels": [],
            "user": {"login": "someone"}}


def test_write_page_redacts_title_and_body_and_keeps_traceability(tmp_path):
    path = tmp_path / "o__r" / "label-x-p01.json.gz"
    extract.write_page(path, {"repo": "o/r", "response": {"total_count": 1, "items": [page_item()]}})
    saved = extract.read_page(path)["response"]["items"][0]
    assert saved["title"] == f"Crash, write to {REDACTED}"
    assert saved["body"] == f"Steps\n\nCC: {REDACTED}, support@fixture-corp.com"
    assert (saved["number"], saved["html_url"]) == (9, "https://github.com/o/r/issues/9")
    assert "user" not in saved


def test_redact_pages_rewrites_old_pages_once_and_counts_without_values(tmp_path):
    path = tmp_path / "o__r" / "label-x-p01.json.gz"
    path.parent.mkdir(parents=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:  # an old page, saved before redaction
        json.dump({"repo": "o/r", "response": {"items": [page_item()]}}, fh)
    changed, (matches, issues) = extract.redact_pages(tmp_path)
    assert changed == 1
    assert matches["contact"] == 2 and matches["role"] == 1 and issues["contact"] == 1
    assert "ann.lee" not in json.dumps(matches) + json.dumps(issues)
    assert extract.redact_pages(tmp_path)[0] == 0  # second run changes nothing
    assert extract.email_counts(tmp_path)[0]["contact"] == 0


def test_redact_item_leaves_other_fields_alone():
    item = {**page_item(), "labels": [{"name": "owner:x@fixture.com"}]}
    out = redact_item(item)
    assert out["labels"] == item["labels"] and out["html_url"] == item["html_url"]


def test_committed_raw_pages_have_no_unredacted_contact_addresses():
    """Fails on a checkout whose data/raw/ was saved before redaction."""
    pages = sorted((ROOT / "data" / "raw").rglob("*.json.gz"))
    assert len(pages) == 496
    found = 0
    for path in pages:
        env = extract.read_page(path)
        for it in env["response"]["items"]:
            assert it["html_url"] == f"https://github.com/{env['repo']}/issues/{it['number']}", path
            for key in ("title", "body"):
                found += sum(c == "contact" for _, _, c in classify(it.get(key) or ""))
    assert found == 0, f"{found} contact addresses left in data/raw (run --redact data/raw)"
