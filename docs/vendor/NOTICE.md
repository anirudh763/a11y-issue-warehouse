# Local SQL engine assets

- DuckDB-Wasm 1.32.0 (MIT), npm integrity: sha512-IewXTNYEjsZCPE9weUWgtjGxUlMRo7qhX0GF6tq/KjK8bnY+RAl4cyUdYUfcdzbyb4b9ZxPC+FOsCcxgaKFWMg==.
- DuckDB engine 1.4.3 signed JSON and Parquet WebAssembly extensions are hosted from the official DuckDB extension distribution; exact SHA-256 values are in SHA256SUMS.
- Apache Arrow JS 17.0.0 (Apache-2.0), npm integrity: sha512-X0p7auzdnGuhYMVKYINdQssS4EcKec9TCXyez/qtJt32DrIMGbzqiaMiQ0X6fQlQpw8Fl0Qygcv4dfRAr5Gu9Q==; bundled into duckdb-browser.mjs.
- esbuild 0.25.12 (MIT) is a build-only bundler; its code is not shipped.
- Official source: https://github.com/duckdb/duckdb-wasm/tree/v1.32.0 and https://www.npmjs.com/package/@duckdb/duckdb-wasm/v/1.32.0.
- The EH browser worker and WebAssembly binary are vendored for modern browsers with WebAssembly exception handling. Runtime network access is not required by these assets.
- SHA-256 digests for the shipped JavaScript and WebAssembly files are in SHA256SUMS.

Run scripts/vendor_duckdb_wasm.sh to reproduce the vendored files.
