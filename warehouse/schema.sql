-- Warehouse schema. Timestamps are ISO-8601 UTC text exactly as GitHub returns them
-- ('2024-05-01T12:34:56Z'), which sorts correctly as text.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS repos (
    id         INTEGER PRIMARY KEY,
    full_name  TEXT NOT NULL UNIQUE,          -- 'owner/name'
    html_url   TEXT NOT NULL,
    a11y_label TEXT                           -- the repository's accessibility label, if it has one
);

CREATE TABLE IF NOT EXISTS issues (
    id                 INTEGER PRIMARY KEY,   -- GitHub issue id
    repo_id            INTEGER NOT NULL REFERENCES repos(id),
    number             INTEGER NOT NULL,
    title              TEXT NOT NULL,
    body               TEXT,                  -- GitHub allows an empty body
    state              TEXT NOT NULL,
    state_reason       TEXT,
    created_at         TEXT NOT NULL,
    closed_at          TEXT,
    updated_at         TEXT NOT NULL,
    comments           INTEGER NOT NULL,
    author_association TEXT NOT NULL,
    UNIQUE (repo_id, number)
);

CREATE TABLE IF NOT EXISTS labels (
    id      INTEGER PRIMARY KEY,              -- GitHub label id
    repo_id INTEGER NOT NULL REFERENCES repos(id),
    name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    label_id INTEGER NOT NULL REFERENCES labels(id),
    PRIMARY KEY (issue_id, label_id)
);

-- Which kind of query returned an issue: 'label', 'keyword' or 'comparison'.
CREATE TABLE IF NOT EXISTS issue_sources (
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    source   TEXT NOT NULL,
    PRIMARY KEY (issue_id, source)
);

CREATE TABLE IF NOT EXISTS load_runs (
    id                  INTEGER PRIMARY KEY,
    started_at          TEXT NOT NULL,
    mode                TEXT NOT NULL,        -- 'full' or 'incremental'
    pages_read          INTEGER NOT NULL,
    raw_items           INTEGER NOT NULL,     -- items in all raw pages (with repeats)
    raw_distinct_issues INTEGER NOT NULL,     -- distinct issue ids in all raw pages
    items_skipped       INTEGER NOT NULL,     -- at or below the watermark (incremental mode)
    rows_changed        INTEGER NOT NULL,     -- rows inserted, updated or deleted by this run
    issues_total        INTEGER NOT NULL,
    watermark           TEXT,                 -- MAX(issues.updated_at) after the run
    collected_at        TEXT                  -- latest fetched_at among the raw pages
);

-- Supports per-repository date-range lookups (analysis/05; before/after timing in the README).
CREATE INDEX IF NOT EXISTS idx_issues_repo_created ON issues (repo_id, created_at);

-- Classification used by every analysis.
-- Accessibility issue: returned by the label query, or returned by the keyword query AND
-- one of the search words is really in its title or body. The second condition exists
-- because GitHub's search returns issues that do not contain the words (see the README and
-- the check keyword_source_has_keyword_in_text). Such unconfirmed keyword hits are left
-- out of this view unless the comparison query also sampled them, in which case they are
-- ordinary comparison issues.
CREATE VIEW IF NOT EXISTS issue_class AS
WITH flags AS (
    SELECT i.id AS issue_id,
           EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'label') AS by_label,
           EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'comparison') AS sampled,
           EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'keyword')
             AND (LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%talkback%'
               OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%screen reader%'
               OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%accessibility%'
               OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%a11y%') AS by_keyword
    FROM issues i
)
SELECT issue_id, (by_label OR by_keyword) AS is_a11y, by_label, by_keyword
FROM flags
WHERE by_label OR by_keyword OR sampled;
