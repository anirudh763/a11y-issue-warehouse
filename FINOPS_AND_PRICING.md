# FinOps and pricing assumptions

## Current public demo

The current site is a static public GitHub Pages project demo with no API, database service, checkout, paid feature, email capture or enterprise account. Its direct hosting bill to this repository owner is currently $0 under the public GitHub Pages setup. This is not an operating-cost guarantee: availability and use remain subject to GitHub's current [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) and [additional product terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features). GitHub says Pages is not for a site primarily facilitating commercial transactions or providing commercial SaaS. This demo does neither; a future paid product should not be placed on Pages without a policy review and suitable hosting.

The explorer reads one static public snapshot. DuckDB-Wasm is optional and loads local same-origin assets only when the workbench is used. That first browser load can be substantially larger than the JSON snapshot. Each DuckDB database is capped at 256 MB and one thread. SQL is capped at 4,096 UTF-8 bytes, 256 AST nodes and depth 20; query results at 500 rows and 1 MB; split exports at 10,000 rows; all exports at 8 MB. Warm queries/splits have a 12-second deadline, exports a 60-second deadline and first initialization a 60-second startup deadline. These limits constrain client work but do not guarantee latency or device compatibility. No user dataset upload is accepted.

## Proposed price hypothesis, unavailable

The Methods-page concept shows a proposed range of **$99–$299 per scoped curation service or benchmark pack**. This is a planning hypothesis, not a validated price, quote, revenue forecast or offer. No curation service or pack is currently available. There is no checkout or payment collection.

Any eventual pack would need a documented sampling method, provenance, schema and rights review. Human labels would require a real review protocol and quality controls; the existing weak labels cannot be renamed or sold as verified ground truth.

## Cloud cost boundary

An S3 + Glue + Lake Formation + Athena deployment is only a possible future mapping. None of those resources is deployed here. There are no measured AWS bills or workload traces, so this repository makes no exact AWS cost-of-goods, revenue, margin, request-to-order or RPO guarantee. Any future estimate must state region, stored bytes, retention, request volume, scanned data, query profile, governance and support assumptions.
