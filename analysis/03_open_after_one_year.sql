-- Share of issues still open one year after they were opened, accessibility versus other.
-- Only issues created at least 365 days before the collection date are counted, so every
-- counted issue has had a full year in which it could have been closed.
WITH asof AS (
    SELECT julianday(collected_at) AS jd FROM load_runs ORDER BY id DESC LIMIT 1
),
eligible AS (
    SELECT r.full_name AS repo,
           CASE WHEN c.is_a11y THEN 'accessibility' ELSE 'other' END AS grp,
           (i.closed_at IS NULL
            OR julianday(i.closed_at) - julianday(i.created_at) > 365) AS open_after_year
    FROM issues i
    JOIN issue_class c ON c.issue_id = i.id
    JOIN repos r ON r.id = i.repo_id
    CROSS JOIN asof
    WHERE asof.jd - julianday(i.created_at) >= 365
),
pooled AS (
    SELECT repo, grp, open_after_year FROM eligible
    UNION ALL
    SELECT '(all repositories)', grp, open_after_year FROM eligible
)
SELECT repo, grp AS issue_group, COUNT(*) AS issues_at_least_one_year_old,
       SUM(open_after_year) AS open_after_one_year,
       ROUND(100.0 * SUM(open_after_year) / COUNT(*), 1) AS pct_open_after_one_year
FROM pooled
GROUP BY repo, grp
ORDER BY repo, grp;
