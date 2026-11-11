-- The five labels that most often appear together with each repository's accessibility
-- label, with how common the same label is among that repository's other sampled issues.
WITH labelled AS (              -- issues that carry their repository's accessibility label
    SELECT i.id AS issue_id, i.repo_id, l.id AS a11y_label_id
    FROM issues i
    JOIN repos r ON r.id = i.repo_id
    JOIN issue_labels il ON il.issue_id = i.id
    JOIN labels l ON l.id = il.label_id AND LOWER(l.name) = LOWER(r.a11y_label)
),
others AS (                     -- comparison issues: not an accessibility issue by any query
    SELECT i.id AS issue_id, i.repo_id
    FROM issues i JOIN issue_class c ON c.issue_id = i.id AND NOT c.is_a11y
),
co AS (
    SELECT a.repo_id, l.id AS label_id, l.name AS label, COUNT(*) AS with_a11y
    FROM labelled a
    JOIN issue_labels il ON il.issue_id = a.issue_id AND il.label_id <> a.a11y_label_id
    JOIN labels l ON l.id = il.label_id
    GROUP BY a.repo_id, l.id
),
ranked AS (
    SELECT co.*,
           ROW_NUMBER() OVER (PARTITION BY repo_id ORDER BY with_a11y DESC, label) AS rnk,
           (SELECT COUNT(*) FROM labelled a WHERE a.repo_id = co.repo_id) AS a11y_issues,
           (SELECT COUNT(*) FROM others o WHERE o.repo_id = co.repo_id) AS other_issues,
           (SELECT COUNT(*) FROM others o JOIN issue_labels il ON il.issue_id = o.issue_id
            WHERE il.label_id = co.label_id) AS with_other
    FROM co
)
SELECT r.full_name AS repo, rnk AS rank, label, with_a11y AS a11y_issues_with_label,
       a11y_issues AS a11y_labelled_issues,
       ROUND(100.0 * with_a11y / a11y_issues, 1) AS pct_of_a11y,
       ROUND(100.0 * with_other / other_issues, 1) AS pct_of_other
FROM ranked JOIN repos r ON r.id = ranked.repo_id
WHERE rnk <= 5
ORDER BY repo, rnk;
