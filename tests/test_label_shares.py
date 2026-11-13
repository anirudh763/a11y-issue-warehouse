"""README numbers about label-only issues and the fenix share match analysis/label_shares.py."""
import re
import sqlite3
import sys

import pytest
from conftest import ROOT

from warehouse.load import load

sys.path.insert(0, str(ROOT / "analysis"))
from label_shares import compute, sentences  # noqa: E402

README = ROOT / "README.md"
COUNT_RE = re.compile(r"([\d,]+) of the ([\d,]+) (accessibility-sample issues|classified issues|loaded issues)")


@pytest.fixture(scope="module")
def shares(tmp_path_factory):
    raw = ROOT / "data" / "raw"
    if not any(raw.rglob("*.json.gz")):
        pytest.skip("data/raw is not present")
    path = tmp_path_factory.mktemp("shares") / "warehouse.db"
    load(path, raw)
    return compute(sqlite3.connect(path))


def flat(text):
    return re.sub(r"\s+", " ", text)


def allowed(s):
    n = "{:,}".format
    return {
        (n(s["label_only_no_word"]), n(s["positives"]), "accessibility-sample issues"),
        (n(s["fenix_positives"]), n(s["positives"]), "accessibility-sample issues"),
        (n(s["with_feature_label"]), n(s["positives"]), "accessibility-sample issues"),
        (n(s["fenix_classified"]), n(s["classified"]), "classified issues"),
        (n(s["fenix_loaded"]), n(s["loaded"]), "loaded issues"),
    }


def check(text, s):
    """Return the problems; an empty list means README and the computed numbers agree."""
    text = flat(text)
    problems = [f"missing: {line}" for line in sentences(s) if flat(line) not in text]
    ok = allowed(s)
    problems += [f"unexpected: {' of the '.join(m[:2])} {m[2]}" for m in COUNT_RE.findall(text) if m not in ok]
    return problems


def test_values_have_the_expected_definitions(shares):
    # label-only by text and label-only by view are different counts, both reported
    assert shares["label_only_no_word"] <= shares["label_not_keyword_confirmed"]
    assert shares["fenix_positives"] <= shares["fenix_classified"] <= shares["fenix_loaded"]


def test_readme_numbers_match_the_computed_ones(shares):
    assert check(README.read_text(), shares) == []


@pytest.mark.parametrize("old,new", [("583 of the 1,187", "584 of the 1,187"), ("(49.1%)", "(49%)"),
                                     ("114 of the 1,187", "113 of the 1,187"),
                                     ("119 are labelled", "118 are labelled"),
                                     ("1,149 of the 2,477", "1,149 of the 2,452")])
def test_an_edited_number_is_caught(shares, old, new):
    text = README.read_text()
    assert old in text
    assert check(text.replace(old, new), shares) != []
