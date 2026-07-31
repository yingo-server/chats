#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yingo 测试控制台 — 进度条 / 仅输出失败 / 日志按时间戳保存"""

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
    out(f"  进度: {current}/{total} ({pct}%)")

requested = [a for a in sys.argv[1:] if not a.startswith("-")]
all_suites = delib.SUITES
if requested:
    selected = [(n, t) for n, t in all_suites if n in requested]
    if not selected:
        avail = ", ".join(n for n, _ in all_suites)
        out(f"\n错误: 未找到套件「{requested[0]}」")
        out(f"可用: {avail}")
        delib.close_log()
        sys.exit(1)
else:
    selected = all_suites

total_iters = sum(t for _, tests in selected for _, t in tests)
out(f"\n共 {len(selected)} 个套件, {total_iters} 项测试")
out(f"日志: {LOG_PATH}")
import time as _time
_start = _time.time()
out("")

out("=== 等待服务就绪 ===")
import time as _time
for svc, base in [("User Service", delib.USER_BASE), ("Chat Service", delib.CHAT_BASE)]:
    out(f"  等待 {svc} ...")
    try:
        delib.wait_service(base, svc)
        out(f"  {svc} 就绪 ✓")
    except Exception as e:
        out(f"致命错误: {e}")
        delib.close_log()
        sys.exit(1)

out("\n=== 重置数据库 ===")
delib.reset_db()

out("\n=== 初始化用户 ===")
delib.init_users()
try:
    delib.test_注册()
    delib.test_登录()
    for u in delib.USERS.values():
        if u.get("id"):
            delib.track_user(u["id"])
    out("  用户已创建并登录")
except Exception as e:
    out(f"致命错误: 初始化失败: {e}")
    delib.close_log()
    sys.exit(1)

done = 0
for suite_name, tests in selected:
    out(f"\n--- 套件: {suite_name} ({sum(t for _,t in tests)}项) ---")
    for fn, times in tests:
        delib.R(fn.__name__, fn, times=times)
        done += 1
    out(f"  套件完成: {suite_name} ({done}/{len(tests)})")

out(f"\n{'='*50}")
total = delib.PASS + delib.FAIL + delib.EXPECTED_FAIL
out(f"  总计: {total} 项测试")
out(f"  通过: {delib.PASS}")
out(f"  预期失败: {delib.EXPECTED_FAIL}")
out(f"  失败: {delib.FAIL}")
out(f"  追踪: 用户={len(delib.TESTED_IDS['users'])}, 房间={len(delib.TESTED_IDS['rooms'])}, Token={len(delib.TESTED_IDS['tokens'])}")
if delib.ERRORS:
    out(f"\n  失败详情（前10条）:")
    for e in delib.ERRORS[:10]:
        out(f"    {e}")
out(f"{'='*50}")

out(f"\n日志已保存到: {LOG_PATH}")

delib.cleanup_all()
delib.close_log()
sys.exit(0 if delib.FAIL == 0 else 1)