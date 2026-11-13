**What does this change?**

**Does it change the data or a number in the README** (queries, labels, the `issue_class` view, analysis)? If yes, say which numbers moved and rerun the command that produced them.

- [ ] `make test` passes
- [ ] `make load && make site-check` passes (commit the regenerated `docs/data/issues.json` after `make site`)
- [ ] If `docs/` changed: `make e2e` passes (axe-core 0 violations in light and dark)
