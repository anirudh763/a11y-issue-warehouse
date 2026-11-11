# Index benchmark: analysis/05_comparison_date_match.sql

2643 rows in `issues`, median of 21 runs, SQLite 3.53.1.

Without the index: 3207.8 ms

```
SEARCH o USING INDEX sqlite_autoindex_issues_1 (repo_id=?)
```

With `CREATE INDEX idx_issues_repo_created ON issues (repo_id, created_at)`: 61.3 ms (52.3x faster)

```
SEARCH o USING COVERING INDEX idx_issues_repo_created (repo_id=? AND created_at>? AND created_at<?)
```
