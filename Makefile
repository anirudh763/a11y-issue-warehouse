PY ?= python3
DB ?= data/warehouse.db
PORT ?= 8000

.PHONY: data load check analyze test site serve site-check e2e clean

data:            ## fetch every query in config.json from GitHub into data/raw/ (network, slow)
	$(PY) -m warehouse.extract --config config.json --raw data/raw --log data/queries_run.json

load:            ## build the SQLite warehouse from data/raw/ (offline, idempotent)
	$(PY) -m warehouse.load --db $(DB) --raw data/raw

check:           ## run the data-quality and schema-contract checks
	$(PY) -m warehouse.checks --db $(DB)

analyze:         ## run the analysis SQL, the index benchmark and the classifier
	$(PY) analysis/run_analysis.py --db $(DB) --out results
	$(PY) analysis/bench_index.py --db $(DB) --out results/index_benchmark.md
	$(PY) analysis/classify.py --db $(DB) --out results

test:            ## unit tests (no network)
	$(PY) -m pytest -q tests

site:            ## export the warehouse to docs/data/issues.json for the explorer site
	$(PY) -m warehouse.export_site --db $(DB) --out docs/data

serve: load site  ## build the warehouse and the explorer data, then serve docs/ on http://localhost:$(PORT)/
	@echo "Explorer: http://localhost:$(PORT)/  (Ctrl+C to stop)"
	$(PY) -m http.server $(PORT) --bind 127.0.0.1 -d docs

site-check:      ## fail if docs/data/issues.json is not a fresh export of $(DB)
	$(PY) -m warehouse.export_site --db $(DB) --out docs/data --check

e2e:             ## browser test of the explorer (needs `npm ci` in tests/web and $(DB))
	WAREHOUSE_DB=$(abspath $(DB)) node --test tests/web/explorer.test.mjs tests/web/gate.test.mjs tests/web/manifest.test.mjs

clean:
	rm -f $(DB)
