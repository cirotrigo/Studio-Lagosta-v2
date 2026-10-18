"""One synthetic validation and one real suite; cores never leave ephemeral runner.

Only parsed frame symbols/module basenames are printed. Raw GDB output is captured
in memory and discarded. No debuginfod or automatic GDB scripts are permitted.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
CORES = Path(os.environ["RUNNER_TEMP"]) / "diag-cores"
DEADLINE = datetime.datetime.fromisoformat("2026-10-18T13:00:44+00:00").timestamp()

def require_time(seconds=120):
    if time.time() + seconds >= DEADLINE:
        raise RuntimeError("budget-time-exhausted")

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def extract(executable, core):
    require_time(100)
    result = subprocess.run([
        "gdb", "-nx", "-batch", "-iex", "set auto-load off",
        "-iex", "set debuginfod enabled off", "-iex", "set pagination off",
        "-iex", "set print frame-arguments none",
        "-se", str(executable), "-c", str(core), "-x", str(ROOT / "native-frames.py"),
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=90)
    payloads = [line[len("DIAG_NATIVE_JSON="):] for line in result.stdout.splitlines()
                if line.startswith("DIAG_NATIVE_JSON=")]
    if result.returncode != 0 or len(payloads) != 1:
        return {"error": "gdb-no-unique-result"}
    return json.loads(payloads[0])

def prove():
    require_time(180)
    marker = CORES / "proof-started"
    with marker.open("x") as f:
        f.write(datetime.datetime.now(datetime.timezone.utc).isoformat())
    print("EXECUTION 1/2: native capture proof", flush=True)
    executable = CORES / "diag-native-probe"
    subprocess.run(["gcc", "-g", "-O0", "-fno-omit-frame-pointer", "-o", str(executable),
                    str(ROOT / "native-probe.c")], check=True, capture_output=True)
    child = subprocess.Popen([str(executable)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    code = child.wait(timeout=20)
    core = CORES / ("core." + str(child.pid))
    if code != -11 or not core.is_file():
        raise RuntimeError("proof-no-sigsegv-core")
    result = extract(executable, core)
    fault_frames = [f for t in result.get("threads", []) if t["fault_thread"] for f in t["frames"]]
    if not any(f.get("symbol") == "diag_native_capture_probe" for f in fault_frames):
        raise RuntimeError("proof-missing-known-symbol")
    print(json.dumps({"proof": "PASS", "signal": "SIGSEGV", "frames": fault_frames}))
    core.unlink()  # Synthetic disposable core only; never an artifact.
    (CORES / "proof-passed").write_text("PASS\n")

def begin_suite():
    require_time(240)
    if not (CORES / "proof-passed").is_file():
        raise RuntimeError("proof-required")
    with (CORES / "suite-started").open("x") as f:
        f.write(datetime.datetime.now(datetime.timezone.utc).isoformat())
    # Only the timeout value goes to shell; the execution count is printed there.
    print(min(900, int(DEADLINE - time.time() - 120)))

def summarize():
    print("## Native stack diagnostic (sanitized)")
    cores = sorted(CORES.glob("core.*"))
    print(json.dumps({"cores": len(cores), "proof_passed": (CORES / "proof-passed").is_file(),
                      "suite_started": (CORES / "suite-started").is_file()}))
    executable = shutil.which("node")
    if not executable:
        raise RuntimeError("node-unavailable")
    # Cross-reference the signal against the parent exit event, not GDB prose.
    exits = {}
    log = Path(os.environ.get("DIAG_LOG", str(CORES / "absent.jsonl")))
    if log.is_file():
        for line in log.read_text().splitlines():
            try:
                event = json.loads(line)
                if event.get("ev") == "exit":
                    exits[event.get("filho")] = event
            except ValueError:
                continue
    for core in cores[:6]:
        if not core.name[5:].isdigit() or core.is_symlink():
            continue
        pid = int(core.name[5:])
        event = exits.get(pid, {})
        if event.get("papel") != "worker-forks":
            print(json.dumps({"pid": pid, "error": "core-not-confirmed-worker"}))
            continue
        info = {"pid": pid, "signal": event.get("signal"), "bytes": core.stat().st_size,
                "core_sha256": digest(core), "stack": extract(executable, core)}
        print(json.dumps(info, ensure_ascii=True))
    print("No core/memory/arguments/environment/source paths uploaded. Missing frames remain inconclusive.")

try:
    {"prove": prove, "begin-suite": begin_suite, "summarize": summarize}[sys.argv[1]]()
except Exception:
    print("native-diagnostic: operation failed; raw exception suppressed", file=sys.stderr)
    sys.exit(1)
