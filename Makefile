PY ?= python3
DB ?= data/warehouse.db

.PHONY: data load check analyze test clean

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

clean:
	rm -f $(DB)
