# Contributing

Thanks for helping. This is a small, reproducible data project, so the most useful
contributions keep every number re-runnable from the saved pages in `data/raw/`.

## Ways to help

- **Report a wrong or loosely related issue in a sample.** Use the "Wrong label or removal
  request" template. The labels are weak by design; reports help describe the noise.
- **Check a number.** Every number in the README names the command that produced it. If a
  rerun gives something else, open a "Problem" issue with the command and its output.
- **Suggest another app.** Open an issue first, so the selection rule (open-source Android
  app with issues on GitHub) and the label name can be agreed before data is added.

## Setting up

You need Python 3 and `make`. The pipeline is stdlib only; the tests and analysis need the
packages in `requirements.txt`.

```bash
pip install -r requirements.txt
make serve        # builds data/warehouse.db and the explorer data, then serves http://localhost:8000/
make test         # unit tests, no network
make check        # data-quality checks
```

The browser test needs Node 20+, Playwright and axe-core:

```bash
cd tests/web && npm ci && npx playwright install chromium && cd ../..
make e2e
```

## Before you open a pull request

- `make test` passes, and `make load && make site-check` passes. If you changed the
  warehouse, the export or the data, run `make site` and commit `docs/data/issues.json`;
  CI fails if it is stale.
- If you changed `docs/`, run `make e2e`. It includes axe-core in light and dark themes and
  at 375 px; keep it at 0 violations.
- Changing `config.json`, the `issue_class` view or the analysis changes the results. Say so
  in the pull request and update the README numbers from a fresh run.
- Do not add author names, avatars or issue bodies to the explorer export.
- Add an entry to `CHANGELOG.md` under "Unreleased".
- Use plain language in the explorer and the docs.

## Reporting a problem

Open an issue. Say what you did, what you expected and what happened. Security problems:
see [SECURITY.md](SECURITY.md).
