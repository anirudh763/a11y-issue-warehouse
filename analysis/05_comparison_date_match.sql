-- Checks the comparison sample: for each accessibility issue, how many non-accessibility
-- issues from the same repository were created within 45 days of it. The inner lookup is
-- a range scan on (repo_id, created_at); this is the query timed with and without
-- idx_issues_repo_created in the README.
WITH cls AS MATERIALIZED (
    SELECT issue_id, is_a11y FROM issue_class
),
a11y AS (
    SELECT i.id, i.repo_id, i.created_at
    FROM issues i JOIN cls c ON c.issue_id = i.id AND c.is_a11y
),
matched AS (
    SELECT a.id, a.repo_id,
           (SELECT COUNT(*) FROM issues o
            WHERE o.repo_id = a.repo_id
              AND o.created_at BETWEEN strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at, '-45 days')
                                   AND strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at, '+45 days')
              AND o.id IN (SELECT issue_id FROM cls WHERE NOT is_a11y)) AS neighbours
    FROM a11y a
)
SELECT r.full_name AS repo, COUNT(*) AS a11y_issues,
       SUM(neighbours > 0) AS with_comparison_within_45_days,
       ROUND(100.0 * SUM(neighbours > 0) / COUNT(*), 1) AS pct_matched,
       ROUND(AVG(neighbours), 1) AS mean_comparison_neighbours
FROM matched m JOIN repos r ON r.id = m.repo_id
GROUP BY r.full_name
ORDER BY r.full_name;
