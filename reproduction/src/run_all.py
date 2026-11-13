"""Run every step in order: python3 reproduction/src/run_all.py

No network. Rebuilds reproduction/build/ (issue text, not committed) from data/raw/ and
regenerates reproduction/results/. Each step runs in its own process with one BLAS/OpenMP
thread so that floating-point results do not depend on thread scheduling. Run time and
hardware are printed (and written to build/run_log.txt), not written to results/.
"""
import os
import pathlib
import platform
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
STEPS = ["build_dataset.py", "preprocess.py", "exp1_cv.py", "ext_loao_masking.py",
         "control_shuffled.py", "make_report.py"]


def cpu_model():
    try:
        for line in pathlib.Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or "unknown"


def main():
    import numpy
    import pandas
    import sklearn

    env = dict(os.environ, OMP_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1",
               MKL_NUM_THREADS="1", PYTHONHASHSEED="0")
    log = [f"python {platform.python_version()}, scikit-learn {sklearn.__version__}, "
           f"numpy {numpy.__version__}, pandas {pandas.__version__}",
           f"{platform.system()} {platform.machine()}, {os.cpu_count()} CPUs, {cpu_model()}"]
    print("\n".join(log), flush=True)
    total = time.perf_counter()
    for step in STEPS:
        start = time.perf_counter()
        print(f"== {step}", flush=True)
        subprocess.run([sys.executable, str(HERE / step)], cwd=HERE, env=env, check=True)
        log.append(f"{step:22} {time.perf_counter() - start:7.1f} s")
        print(log[-1], flush=True)
    log.append(f"{'total':22} {time.perf_counter() - total:7.1f} s")
    print(log[-1])
    (HERE.parent / "build" / "run_log.txt").write_text("\n".join(log) + "\n")


if __name__ == "__main__":
    main()
