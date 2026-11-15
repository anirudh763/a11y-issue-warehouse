#!/bin/sh
set -eu
version=1.32.0
arrow=17.0.0
esbuild=0.25.12
engine=1.4.3
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p docs/vendor
npm install --prefix "$tmp/build" --no-save --ignore-scripts \
  "@duckdb/duckdb-wasm@$version" "apache-arrow@$arrow" "esbuild@$esbuild" >/dev/null
pkg="$tmp/build/node_modules/@duckdb/duckdb-wasm"
"$tmp/build/node_modules/.bin/esbuild" "$pkg/dist/duckdb-browser.mjs" \
  --bundle --packages=bundle --format=esm --platform=browser --minify \
  --outfile=docs/vendor/duckdb-browser.mjs >/dev/null
cp "$pkg/dist/duckdb-browser-eh.worker.js" docs/vendor/
cp "$pkg/dist/duckdb-eh.wasm" docs/vendor/
mkdir -p docs/vendor/extensions
extension_dir="docs/vendor/extensions/v$engine/wasm_eh"
mkdir -p "$extension_dir"
for extension in json parquet; do
  curl -fsSL "https://extensions.duckdb.org/v$engine/wasm_eh/$extension.duckdb_extension.wasm" \
    -o "$extension_dir/$extension.duckdb_extension.wasm"
done
curl -fsSL "https://raw.githubusercontent.com/duckdb/duckdb-wasm/v$version/LICENSE" \
  -o docs/vendor/DUCKDB-WASM-MIT.txt
curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt -o docs/vendor/ARROW-APACHE-2.0.txt
cat > docs/vendor/NOTICE.md <<EOF
# Local SQL engine assets

- DuckDB-Wasm $version (MIT), npm integrity: sha512-IewXTNYEjsZCPE9weUWgtjGxUlMRo7qhX0GF6tq/KjK8bnY+RAl4cyUdYUfcdzbyb4b9ZxPC+FOsCcxgaKFWMg==.
- DuckDB engine $engine signed JSON and Parquet WebAssembly extensions are hosted from the official DuckDB extension distribution; exact SHA-256 values are in SHA256SUMS.
- Apache Arrow JS $arrow (Apache-2.0), npm integrity: sha512-X0p7auzdnGuhYMVKYINdQssS4EcKec9TCXyez/qtJt32DrIMGbzqiaMiQ0X6fQlQpw8Fl0Qygcv4dfRAr5Gu9Q==; bundled into duckdb-browser.mjs.
- esbuild $esbuild (MIT) is a build-only bundler; its code is not shipped.
- Official source: https://github.com/duckdb/duckdb-wasm/tree/v$version and https://www.npmjs.com/package/@duckdb/duckdb-wasm/v/$version.
- The EH browser worker and WebAssembly binary are vendored for modern browsers with WebAssembly exception handling. Runtime network access is not required by these assets.
- SHA-256 digests for the shipped JavaScript and WebAssembly files are in SHA256SUMS.

Run scripts/vendor_duckdb_wasm.sh to reproduce the vendored files.
EOF
shasum -a 256 docs/vendor/duckdb-browser.mjs docs/vendor/duckdb-browser-eh.worker.js \
  docs/vendor/duckdb-eh.wasm "$extension_dir"/*.wasm > docs/vendor/SHA256SUMS
