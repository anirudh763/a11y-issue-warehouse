-- Data-quality and schema-contract checks.
-- Each check is one SELECT that returns the number of violating rows; 0 means pass.
-- A line '-- known: <text>' marks a check whose failures on the real data have been
-- investigated; the runner still reports the count and still fails if no known line exists.

-- check: issues_id_unique
SELECT COUNT(*) FROM (SELECT id FROM issues GROUP BY id HAVING COUNT(*) > 1);

-- check: repo_number_unique
SELECT COUNT(*) FROM (SELECT 1 FROM issues GROUP BY repo_id, number HAVING COUNT(*) > 1);

-- check: issues_repo_fk
SELECT COUNT(*) FROM issues WHERE repo_id NOT IN (SELECT id FROM repos);

-- check: issue_labels_issue_fk
SELECT COUNT(*) FROM issue_labels WHERE issue_id NOT IN (SELECT id FROM issues);

-- check: issue_labels_label_fk
SELECT COUNT(*) FROM issue_labels WHERE label_id NOT IN (SELECT id FROM labels);

-- check: no_orphan_labels
SELECT COUNT(*) FROM labels WHERE id NOT IN (SELECT label_id FROM issue_labels);

-- check: label_belongs_to_issue_repo
SELECT COUNT(*) FROM issue_labels il
JOIN issues i ON i.id = il.issue_id JOIN labels l ON l.id = il.label_id
WHERE i.repo_id <> l.repo_id;

-- check: closed_at_not_before_created_at
SELECT COUNT(*) FROM issues WHERE closed_at < created_at;

-- check: updated_at_not_before_created_at
SELECT COUNT(*) FROM issues WHERE updated_at < created_at;

-- check: state_matches_closed_at
SELECT COUNT(*) FROM issues
WHERE (state = 'closed' AND closed_at IS NULL) OR (state = 'open' AND closed_at IS NOT NULL);

-- check: state_values_valid
SELECT COUNT(*) FROM issues
WHERE state NOT IN ('open', 'closed')
   OR state_reason NOT IN ('completed', 'not_planned', 'reopened', 'duplicate');

-- check: title_not_empty
SELECT COUNT(*) FROM issues WHERE title IS NULL OR TRIM(title) = '';

-- check: timestamps_are_utc_iso8601
SELECT COUNT(*) FROM (
    SELECT created_at AS ts FROM issues UNION ALL SELECT updated_at FROM issues
    UNION ALL SELECT closed_at FROM issues WHERE closed_at IS NOT NULL)
WHERE ts IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ', ts) IS NOT ts;

-- check: comments_not_negative
SELECT COUNT(*) FROM issues WHERE comments < 0 OR typeof(comments) <> 'integer';

-- check: expected_columns_and_types
WITH expected(tbl, col, typ) AS (VALUES
    ('repos', 'id', 'INTEGER'), ('repos', 'full_name', 'TEXT'), ('repos', 'a11y_label', 'TEXT'),
    ('issues', 'id', 'INTEGER'), ('issues', 'repo_id', 'INTEGER'), ('issues', 'number', 'INTEGER'),
    ('issues', 'title', 'TEXT'), ('issues', 'body', 'TEXT'), ('issues', 'state', 'TEXT'),
    ('issues', 'state_reason', 'TEXT'), ('issues', 'created_at', 'TEXT'),
    ('issues', 'closed_at', 'TEXT'), ('issues', 'updated_at', 'TEXT'),
    ('issues', 'comments', 'INTEGER'), ('issues', 'author_association', 'TEXT'),
    ('labels', 'id', 'INTEGER'), ('labels', 'repo_id', 'INTEGER'), ('labels', 'name', 'TEXT'),
    ('issue_labels', 'issue_id', 'INTEGER'), ('issue_labels', 'label_id', 'INTEGER'),
    ('issue_sources', 'issue_id', 'INTEGER'), ('issue_sources', 'source', 'TEXT'),
    ('load_runs', 'mode', 'TEXT'), ('load_runs', 'rows_changed', 'INTEGER'),
    ('load_runs', 'raw_distinct_issues', 'INTEGER'), ('load_runs', 'watermark', 'TEXT'))
SELECT COUNT(*) FROM expected e
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info(e.tbl) p WHERE p.name = e.col AND p.type = e.typ);

-- check: issue_count_matches_raw_pages
SELECT ABS((SELECT COUNT(*) FROM issues)
         - (SELECT raw_distinct_issues FROM load_runs ORDER BY id DESC LIMIT 1));

-- check: every_issue_has_a_source
SELECT COUNT(*) FROM issues WHERE id NOT IN (SELECT issue_id FROM issue_sources)
UNION ALL SELECT COUNT(*) FROM issue_sources WHERE source NOT IN ('label', 'keyword', 'comparison')
ORDER BY 1 DESC LIMIT 1;

-- check: a11y_label_implies_label_source
SELECT COUNT(*) FROM issues i
JOIN repos r ON r.id = i.repo_id
JOIN issue_labels il ON il.issue_id = i.id
JOIN labels l ON l.id = il.label_id AND LOWER(l.name) = LOWER(r.a11y_label)
WHERE NOT EXISTS (SELECT 1 FROM issue_sources s WHERE s.issue_id = i.id AND s.source = 'label');

-- check: keyword_source_has_keyword_in_text
-- known: GitHub matched "screen reader" as two separate words; these issues are excluded by the issue_class view (README, Data-quality finding)
SELECT COUNT(*) FROM issues i
JOIN issue_sources s ON s.issue_id = i.id AND s.source = 'keyword'
WHERE NOT (LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%talkback%'
        OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%screen reader%'
        OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%accessibility%'
        OR LOWER(i.title || ' ' || COALESCE(i.body, '')) LIKE '%a11y%');
