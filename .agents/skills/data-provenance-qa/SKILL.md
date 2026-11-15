---
name: data-provenance-qa
description: Verify Browser SQL/splits and accessibility-dataset provenance with reproducible real-engine edge cases and browser evidence.
---

# Domain acceptance

Use the exact repository engine, published fixtures and existing tests. Add reproducible cases for the following; record pass/fail/untested, versions and evidence for each.

1. Seeded train/validation/test split: stable IDs/order and identical content SHA-256 across repeated runs; disjoint sets and full expected coverage.
2. Upstream schema drift: validate required fields/types, quarantine bad records with reasons and preserve raw provenance; no silent coercion or loss.
3. Read-only SQL: real declared SQL engine/grammar, reject multiple statements/DDL/mutation, external file/network/extension access and resource abuse. Do not rely on a naive keyword blacklist.
4. Empty queries/results: correct zero rows, clear schema/empty state, no stale prior rows.
5. Snapshot/manifest SHA-256: verify actual downloaded bytes, report a mismatch as failed provenance and block trusted exports where appropriate.
6. Deterministic Parquet/CSV/JSONL export: stable rows/splits/schema, proper quoting/formula-injection protection and content hashes; label formats not implemented rather than inventing a download. Verify export by re-reading it.

Run the relevant native/Python/Node/browser checks and inspect 320/768/1440 UI states. Zero errors/leaks means none observed in the named finite run, not a universal guarantee. Preserve meaningful assertion strength; diagnose platform/toolchain differences rather than skipping failing cases. No secrets or user payloads in reports.
