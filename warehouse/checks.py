"""Run the checks in checks.sql against a warehouse database."""
import argparse
import pathlib
import re
import sqlite3

CHECKS = pathlib.Path(__file__).with_name("checks.sql")


def parse_checks(text):
    """Return [(name, sql, known_note or None)] from '-- check: name' blocks."""
    checks = []
    for block in re.split(r"^-- check: ", text, flags=re.M)[1:]:
        name, _, rest = block.partition("\n")
        known = re.search(r"^-- known: (.*)$", rest, flags=re.M)
        checks.append((name.strip(), rest.strip(), known.group(1) if known else None))
    return checks


def run_checks(conn, text=None):
    """Return [(name, violations, known_note)] for every check."""
    text = text if text is not None else CHECKS.read_text()
    return [(name, conn.execute(sql).fetchone()[0], known) for name, sql, known in parse_checks(text)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default="data/warehouse.db")
    args = ap.parse_args()
    results = run_checks(sqlite3.connect(args.db))
    for name, bad, known in results:
        status = "PASS" if bad == 0 else ("KNOWN" if known else "FAIL")
        print(f"{status:5} {bad:6}  {name}" + (f"  ({known})" if bad and known else ""))
    failed = [r for r in results if r[1] and not r[2]]
    known = [r for r in results if r[1] and r[2]]
    print(f"{len(results)} checks run, {len(results) - len(failed) - len(known)} passed, "
          f"{len(known)} failed with a documented finding, {len(failed)} failed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
