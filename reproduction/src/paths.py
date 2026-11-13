"""Paths and the one seed used by every step."""
import pathlib

SEED = 0
HERE = pathlib.Path(__file__).resolve().parent
REPRO = HERE.parent                      # reproduction/
ROOT = REPRO.parent                      # repository root
RAW = ROOT / "data" / "raw"              # committed GitHub response pages
BUILD = REPRO / "build"                  # rebuilt on every run, not committed (issue text)
RESULTS = REPRO / "results"              # committed; regenerated exactly by run_all.py
