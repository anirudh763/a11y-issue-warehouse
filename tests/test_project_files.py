"""Install-and-run behaviour a stranger relies on: `--version` and `make serve`."""
import json
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def top_changelog_version():
    for line in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (\d+\.\d+\.\d+) [-–] (\d{4}-\d{2}-\d{2})\s*$", line)
        if m:
            return m.group(1)
        if line.strip() == "## Unreleased":
            continue
        assert not line.startswith("## "), f"first release heading is not 'x.y.z - date': {line!r}"
    raise AssertionError("CHANGELOG.md has no release heading")


@pytest.mark.parametrize("module", ["warehouse.load", "warehouse.export_site"])
def test_cli_version_matches_top_changelog_release(module):
    out = subprocess.run([sys.executable, "-m", module, "--version"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout.strip()
    assert out == f"a11y-issue-warehouse {top_changelog_version()}"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs make")
def test_make_serve_builds_from_raw_pages_and_serves_page_and_data(tmp_path):
    """`make serve` on a fresh database: the page and the full data file answer 200."""
    port = free_port()
    db = tmp_path / "fresh.db"
    proc = subprocess.Popen(["make", "serve", f"PORT={port}", f"DB={db}", f"PY={sys.executable}"],
                            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        deadline = time.time() + 120
        while True:
            assert proc.poll() is None, proc.stdout.read()
            try:
                page = urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2)
                break
            except OSError:
                assert time.time() < deadline, "make serve did not answer within 120 s"
                time.sleep(0.5)
        assert page.status == 200
        assert b'<script src="explorer.js"' in page.read()
        data = urllib.request.urlopen(f"http://127.0.0.1:{port}/data/issues.json", timeout=5)
        assert data.status == 200
        assert len(json.load(data)["issues"]) == 2643
        assert db.exists(), "make serve built the warehouse it was given"
        # localhost only: the server is not bound to every interface
        with pytest.raises(OSError):
            host = socket.gethostbyname(socket.gethostname())
            if host.startswith("127."):
                raise OSError("no non-loopback address to try")
            socket.create_connection((host, port), timeout=1).close()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
