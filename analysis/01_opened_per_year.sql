-- Accessibility issues opened per repository per year, with a running total per repository.
WITH per_year AS (
    SELECT r.full_name AS repo, CAST(substr(i.created_at, 1, 4) AS INTEGER) AS year,
           COUNT(*) AS opened
    FROM issues i
    JOIN issue_class c ON c.issue_id = i.id AND c.is_a11y
    JOIN repos r ON r.id = i.repo_id
    GROUP BY r.full_name, year
)
SELECT repo, year, opened,
       SUM(opened) OVER (PARTITION BY repo ORDER BY year) AS running_total
FROM per_year
ORDER BY repo, year;
