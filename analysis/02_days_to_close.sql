-- Median and 90th-percentile days from open to close, accessibility versus other issues,
-- per repository and pooled. Closed issues only. Percentiles use the nearest-rank method:
-- the value at row ceil(p * n) of the sorted group, written with integer arithmetic.
WITH closed AS (
    SELECT r.full_name AS repo,
           CASE WHEN c.is_a11y THEN 'accessibility' ELSE 'other' END AS grp,
           julianday(i.closed_at) - julianday(i.created_at) AS days
    FROM issues i
    JOIN issue_class c ON c.issue_id = i.id
    JOIN repos r ON r.id = i.repo_id
    WHERE i.closed_at IS NOT NULL
),
pooled AS (
    SELECT repo, grp, days FROM closed
    UNION ALL
    SELECT '(all repositories)', grp, days FROM closed
),
ranked AS (
    SELECT repo, grp, days,
           ROW_NUMBER() OVER (PARTITION BY repo, grp ORDER BY days) AS rn,
           COUNT(*) OVER (PARTITION BY repo, grp) AS n
    FROM pooled
)
SELECT repo, grp AS issue_group, n AS closed_issues,
       ROUND(MAX(CASE WHEN rn = (n + 1) / 2 THEN days END), 1) AS median_days,
       ROUND(MAX(CASE WHEN rn = (n * 9 + 9) / 10 THEN days END), 1) AS p90_days
FROM ranked
GROUP BY repo, grp
ORDER BY repo, grp;
