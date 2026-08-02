#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yingo test console — progress bar / failures-only output / timestamped log files"""

import sys, os, datetime, time

OUT = sys.__stdout__

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_PATH = os.path.join(LOG_DIR, f"{ts}.log")

import delib
delib.QUIET = True
delib.set_log_path(LOG_PATH)

def out(msg):
    print(msg, file=OUT, flush=True)

def progress_line(current, total):
    if total <= 0: return
    pct = current * 100 // total
    out(f"   progress: {current}/{total} ({pct}%)")

requested = [a for a in sys.argv[1:] if not a.startswith("-")]
all_suites = delib.SUITES
if requested:
    selected = [(n, t) for n, t in all_suites if n in requested]
    if not selected:
        avail = ", ".join(n for n, _ in all_suites)
        out(f"\nERROR: suite \"{requested[0]}\" not found")
        out(f"Available: {avail}")
        delib.close_log()
        sys.exit(1)
else:
    selected = all_suites

total_iters = sum(t for _, tests in selected for _, t in tests)
out(f"\n{len(selected)} suites, {total_iters} tests total")
out(f"Target: USER_BASE={delib.USER_BASE}  CHAT_BASE={delib.CHAT_BASE}  CLOUD_MODE={delib.CLOUD_MODE}")
out(f"Log: {LOG_PATH}")
import time as _time
_start = _time.time()
out("")

out("=== Waiting for services ===")
import time as _time
for svc, base in [("User Service", delib.USER_BASE), ("Chat Service", delib.CHAT_BASE)]:
    out(f"  waiting for {svc} ...")
    try:
        delib.wait_service(base, svc)
        out(f"  {svc} ready ✓")
    except Exception as e:
        out(f"FATAL: {e}")
        delib.close_log()
        sys.exit(1)

out("\n=== Reset database ===")
delib.reset_db()

out("\n=== Initialize users ===")
delib.init_users()
try:
    delib.test_register()
    delib.test_login()
    for u in delib.USERS.values():
        if u.get("id"):
            delib.track_user(u["id"])
    out("  users created and logged in")
except Exception as e:
    out(f"FATAL: initialization failed: {e}")
    delib.close_log()
    sys.exit(1)

out("\n=== Promote alice to admin ===")
delib.promote_alice()

done = 0
for suite_name, tests in selected:
    out(f"\n--- Suite: {suite_name} ({sum(t for _,t in tests)} items) ---")
    for fn, times in tests:
        delib.R(fn.__name__, fn, times=times)
        done += 1
    out(f"  suite complete: {suite_name} ({done}/{len(tests)})")

out(f"\n{'='*50}")
total = delib.PASS + delib.FAIL + delib.EXPECTED_FAIL
out(f"  Total: {total} tests")
out(f"  Passed: {delib.PASS}")
out(f"  Expected failures: {delib.EXPECTED_FAIL}")
out(f"  Failed: {delib.FAIL}")
out(f"  Tracked: users={len(delib.TESTED_IDS['users'])}, rooms={len(delib.TESTED_IDS['rooms'])}, tokens={len(delib.TESTED_IDS['tokens'])}")
if delib.ERRORS:
    out(f"\n  Failure details (first 10):")
    for e in delib.ERRORS[:10]:
        out(f"    {e}")
out(f"{'='*50}")

out(f"\nLog saved to: {LOG_PATH}")

delib.cleanup_all()
delib.close_log()
sys.exit(0 if delib.FAIL == 0 else 1)
