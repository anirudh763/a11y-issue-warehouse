"""Count issues for an explorer URL query straight from the warehouse, without the export.

    python3 tests/web/expected_count.py --db data/warehouse.db "app=signalapp/Signal-Android&state=open"
    python3 tests/web/expected_count.py --db data/warehouse.db --ids "state=open"   # ids instead

The explorer test compares the count the page shows with this number. The rules are the
ones the page documents: sample defaults to accessibility; values of one filter are OR-ed,
different filters are AND-ed; q matches every word of the title (or #number).
"""
import argparse
import sqlite3
import urllib.parse

SAMPLE = {
    "a11y": "c.is_a11y = 1",
    "comparison": "c.is_a11y = 0",
    "excluded": "c.issue_id IS NULL",
    "all": "1 = 1",
}
TEXT = "LOWER(i.title || ' ' || COALESCE(i.body, ''))"
CATEGORY = {
    "label": "EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'label')",
    "talkback": f"{TEXT} LIKE '%talkback%'",
    "screen-reader": f"{TEXT} LIKE '%screen reader%'",
    "accessibility": f"{TEXT} LIKE '%accessibility%'",
    "a11y": f"{TEXT} LIKE '%a11y%'",
}


def like_escape(term):
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def where_clause(query):
    p = urllib.parse.parse_qs(query, keep_blank_values=False)
    where, args = [SAMPLE[p.get("sample", ["a11y"])[0]]], []
    if p.get("app"):
        where.append("(" + " OR ".join("r.full_name = ?" for _ in p["app"]) + ")")
        args += p["app"]
    if p.get("state"):
        where.append("(" + " OR ".join("i.state = ?" for _ in p["state"]) + ")")
        args += p["state"]
    if p.get("year"):
        where.append("(" + " OR ".join("substr(i.created_at, 1, 4) = ?" for _ in p["year"]) + ")")
        args += p["year"]
    if p.get("category"):
        where.append("(" + " OR ".join(CATEGORY[c] for c in p["category"]) + ")")
    if p.get("label"):
        where.append("(" + " OR ".join(
            "EXISTS (SELECT 1 FROM issue_labels il JOIN labels l ON l.id = il.label_id "
            "WHERE il.issue_id = i.id AND l.name = ?)" for _ in p["label"]) + ")")
        args += p["label"]
    q = p.get("q", [""])[0].strip()
    if q.lstrip("#").isdigit():
        where.append("(i.number = ? OR i.title LIKE ? ESCAPE '\\')")
        args += [int(q.lstrip("#")), f"%{like_escape(q)}%"]
    else:
        for term in q.split():
            where.append("i.title LIKE ? ESCAPE '\\'")
            args.append(f"%{like_escape(term)}%")
    return " AND ".join(where), args


FROM = ("FROM issues i JOIN repos r ON r.id = i.repo_id "
        "LEFT JOIN issue_class c ON c.issue_id = i.id WHERE ")


def count(conn, query):
    where, args = where_clause(query)
    return conn.execute("SELECT COUNT(*) " + FROM + where, args).fetchone()[0]


def ids(conn, query):
    """Sorted "owner/repo#number" ids, the id format of the sample manifest."""
    where, args = where_clause(query)
    rows = conn.execute("SELECT r.full_name || '#' || i.number " + FROM + where, args).fetchall()
    return sorted(r[0] for r in rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default="data/warehouse.db")
    ap.add_argument("--ids", action="store_true", help="print the matching ids, one per line")
    ap.add_argument("query")
    args = ap.parse_args()
    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    if args.ids:
        print("\n".join(ids(conn, args.query)))
    else:
        print(count(conn, args.query))


if __name__ == "__main__":
    main()
