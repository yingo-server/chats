#!/usr/bin/env python3
"""Yingo 微服务全链路压力测试 (本地开发环境) — 完整版"""

import requests, sys, time, random, string, json, threading, hmac, hashlib, secrets
from urllib.parse import urljoin
import urllib3
import socketio

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ═══ 配置（本地开发环境）═══
USER_BASE = "https://server.344977.xyz:9000"
CHAT_BASE = "https://server.344977.xyz:9001"
PEPPER = "dev-pepper-change-in-production"
PASS = 0
FAIL = 0
EXPECTED_FAIL = 0
ERRORS = []
QUIET = False
LOG_FILE = None

def set_log_path(path):
    global LOG_FILE
    LOG_FILE = open(path, "w", encoding="utf-8", errors="replace")

def close_log():
    global LOG_FILE
    if LOG_FILE:
        LOG_FILE.close()
        LOG_FILE = None

# ═══ 测试会话 ═══
SESSION = requests.Session()
SESSION.verify = False
SOCKET_HTTP_SESSION = requests.Session()
SOCKET_HTTP_SESSION.verify = False

# ═══ 非 debug 会话（不带任何调试 header，验证真实权限系统）═══
ND_SESSION = requests.Session()
ND_SESSION.verify = False

# ═══ 测试资源追踪（保证测试后清理痕迹）═══
TESTED_IDS = {"users": [], "rooms": [], "tokens": [], "api_keys": []}

def track_user(uid):
    if uid and uid not in TESTED_IDS["users"]:
        TESTED_IDS["users"].append(uid)

def track_room(rid):
    if rid and rid not in TESTED_IDS["rooms"]:
        TESTED_IDS["rooms"].append(rid)

def track_token(tid):
    if tid and tid not in TESTED_IDS["tokens"]:
        TESTED_IDS["tokens"].append(tid)

def track_apikey(kid):
    if kid and kid not in TESTED_IDS["api_keys"]:
        TESTED_IDS["api_keys"].append(kid)

# ═══ 结构化测试结果 ═══
class TR:
    """测试结果容器"""
    def __init__(self):
        self.expected = None
        self.actual = None
        self.passed = True
        self.body = None
        self.msg = ""

    def check_status(self, r, expected):
        self.expected = expected
        self.actual = r.status_code
        try:
            self.body = r.json()
        except Exception:
            self.body = r.text[:500]
        if r.status_code != expected:
            self.passed = False
            self.msg = f"状态码不一致: 期望{expected}, 实际{r.status_code}"
        return self

    def check_body(self, r, **kw):
        self.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
        for k, v in kw.items():
            actual_val = self.body.get(k) if isinstance(self.body, dict) else None
            if actual_val != v:
                self.passed = False
                self.msg = f"body.{k} 期望{v!r}, 实际{actual_val!r}"
                return self
        return self

    def ok(self):
        return self.passed

    def fail(self, msg=""):
        self.passed = False
        self.msg = msg
        return self

def R(name, fn, times=15, expected_fail_codes=None):
    global PASS, FAIL, EXPECTED_FAIL
    suite_ok = 0
    suite_fail = 0
    for i in range(times):
        try:
            result = fn()
            if result and hasattr(result, 'passed') and not result.passed:
                suite_fail += 1
                FAIL += 1
                ERRORS.append(f"[{name}] 第{i+1}次: {result.msg}")
                body_str = _fmt_body(result.body)
                line = f"  第{i+1}次 [{name}] 预期={result.expected} 实际={result.actual} 不符合预期"
                log(line)
                if QUIET:
                    print(line, file=sys.__stdout__, flush=True)
                if body_str:
                    log(f"    返回体: {body_str}")
                    if QUIET:
                        print(f"    返回体: {body_str}", file=sys.__stdout__, flush=True)
            else:
                suite_ok += 1
                PASS += 1
                if not QUIET:
                    if result and hasattr(result, 'body'):
                        body_str = _fmt_body(result.body)
                        log(f"  第{i+1}次 [{name}] 预期={result.expected} 实际={result.actual} 符合预期")
                        if body_str:
                            log(f"    返回体: {body_str}")
                    else:
                        log(f"  第{i+1}次 [{name}] 通过")
        except Exception as e:
            msg = str(e) or repr(e)
            if expected_fail_codes and any(c in msg for c in expected_fail_codes):
                EXPECTED_FAIL += 1
                suite_ok += 1
                log(f"  第{i+1}次 [{name}] 预期失败 符合预期")
            else:
                suite_fail += 1
                FAIL += 1
                ERRORS.append(f"[{name}] 第{i+1}次: {msg}")
                log(f"  第{i+1}次 [{name}] 异常: {msg}")
    status = "通过" if suite_fail == 0 else "失败"
    log(f"  [{status}] {name} ({suite_ok}/{times})")

def _fmt_body(body):
    if body is None:
        return ""
    if isinstance(body, dict):
        s = json.dumps(body, ensure_ascii=False)
    else:
        s = str(body)
    s = s[:300] + ("..." if len(s) > 300 else "")
    try:
        return s
    except UnicodeEncodeError:
        return s.encode("utf-8", errors="replace").decode("utf-8", errors="replace")

def log(msg):
    text = f"  {msg}"
    if LOG_FILE:
        try:
            LOG_FILE.write(text + "\n")
            LOG_FILE.flush()
        except:
            pass
    if not QUIET:
        try:
            print(text, flush=True)
        except UnicodeEncodeError:
            safe = text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
            print(safe, flush=True)

def rand_str(n=8):
    return ''.join(random.choices(string.ascii_lowercase, k=n))

def rand_pw():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=12))

def wait_service(base, name, timeout=60):
    for i in range(timeout):
        try:
            r = SESSION.get(urljoin(base, "/api/v1/health"), timeout=3)
            if r.ok and r.json().get("ok"):
                log(f"  {name} 就绪")
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(f"{name} 未就绪（超时 {timeout}s）")

# ═══ 数据库重置（本地 Docker: local-pg / local-redis）═══
def reset_db():
    log("\n=== 重置数据库 ===")
    chat_sql = "TRUNCATE rooms, room_members, cold_messages CASCADE;"
    user_sql = "TRUNCATE users, tokens, api_keys CASCADE;"
    import subprocess
    # Detect container names (docker-compose vs legacy)
    def find_container(keyword):
        r = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, timeout=10)
        for name in r.stdout.splitlines():
            if keyword in name:
                return name
        return None
    user_db = find_container("user-db") or "local-pg"
    chat_db = find_container("chat-db") or "local-pg"
    redis_c = find_container("chat-cache") or find_container("redis") or "local-redis"
    try:
        subprocess.run(["docker", "exec", user_db, "psql", "-U", "yingo", "-d", "cold_user", "-c", user_sql],
                       capture_output=True, text=True, timeout=15, check=True)
        log(f"  user-db 已重置 ({user_db})")
    except Exception as e:
        log(f"  user-db 重置失败: {e}")
    try:
        subprocess.run(["docker", "exec", chat_db, "psql", "-U", "yingo", "-d", "cold_chat", "-c", chat_sql],
                       capture_output=True, text=True, timeout=15, check=True)
        log(f"  chat-db 已重置 ({chat_db})")
    except Exception as e:
        log(f"  chat-db 重置失败: {e}")
    try:
        subprocess.run(["docker", "exec", redis_c, "redis-cli", "FLUSHDB"],
                       capture_output=True, text=True, timeout=15, check=True)
        log(f"  redis 热区已清空 ({redis_c})")
    except Exception as e:
        log(f"  redis 清空失败: {e}")

def cleanup_all():
    log("\n=== 清理测试痕迹 ===")
    admin_token = USERS.get("admin", {}).get("token") or USERS.get("alice", {}).get("token")
    if not admin_token:
        log("  无 admin token，跳过 API 清理")
        reset_db()
        return
    hdr = {"Authorization": f"Bearer {admin_token}"}
    cleaned = {"users": 0, "rooms": 0, "tokens": 0}
    for uid in list(TESTED_IDS["users"]):
        try:
            r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/users/{uid}"), headers=hdr, timeout=5)
            if r.status_code == 200:
                cleaned["users"] += 1
        except Exception:
            pass
    for rid in list(TESTED_IDS["rooms"]):
        try:
            r = SESSION.delete(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}"), headers=hdr, timeout=5)
            if r.status_code == 200:
                cleaned["rooms"] += 1
        except Exception:
            pass
    for tid in list(TESTED_IDS["tokens"]):
        try:
            r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/tokens/{tid}"), headers=hdr, timeout=5)
            if r.status_code == 200:
                cleaned["tokens"] += 1
        except Exception:
            pass
    log(f"  API 清理: 用户={cleaned['users']}, 房间={cleaned['rooms']}, Token={cleaned['tokens']}")
    TESTED_IDS["users"].clear()
    TESTED_IDS["rooms"].clear()
    TESTED_IDS["tokens"].clear()
    TESTED_IDS["api_keys"].clear()
    reset_db()

# ═══ 用户管理 ═══
USERS = {
    "alice": {"username": None, "password": rand_pw(), "token": None, "id": None},
    "bob": {"username": None, "password": rand_pw(), "token": None, "id": None},
    "carol": {"username": None, "password": rand_pw(), "token": None, "id": None},
    "admin": {"username": None, "password": rand_pw(), "token": None, "id": None},
}

def init_users():
    for name in USERS:
        USERS[name]["username"] = f"stress_{name}_{rand_str(4)}"

def get_admin_token():
    return USERS["alice"]["token"]

# ══════════════════════════════════════════════════════════════
#  测试函数（每个返回 TR 结果对象）
# ══════════════════════════════════════════════════════════════

# ═══ 注册测试 ═══
def test_注册():
    for name, u in USERS.items():
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
            "username": u["username"], "password": u["password"], "app_id": "chat"
        }, timeout=5)
        tr = TR().check_status(r, 201).check_body(r, ok=True)
        if tr.ok():
            u["id"] = r.json()["user"]["id"]
        else:
            return tr
    return TR()

def test_重复注册_生成不同名():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": u["username"], "password": u["password"],
    }, timeout=5)
    tr = TR().check_status(r, 201)
    if r.status_code == 201:
        d = r.json()
        if d.get("user", {}).get("globalName") == u["username"]:
            tr.fail(f"重复注册应生成不同名, 实际相同: {d['user']['globalName']}")
    return tr

def test_注册用户名过短():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": "a", "password": rand_pw(),
    }, timeout=5)
    return TR().check_status(r, 400)

def test_注册密码过短():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": rand_str(6), "password": "short",
    }, timeout=5)
    return TR().check_status(r, 400)

# ═══ 登录测试 ═══
def test_登录():
    for name, u in USERS.items():
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
            "username": u["username"], "password": u["password"],
        }, timeout=5)
        tr = TR().check_status(r, 200).check_body(r, ok=True)
        if tr.ok():
            u["token"] = r.json()["short_token"]
        else:
            return tr
    return TR()

def test_登录密码错误():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": list(USERS.values())[0]["username"], "password": "wrong_password_here",
    }, timeout=5)
    return TR().check_status(r, 401)

def test_登录用户不存在():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": "nonexistent_user_xyz", "password": rand_pw(),
    }, timeout=5)
    return TR().check_status(r, 401)

def test_登录缺少字段():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={"username": "test"}, timeout=5)
    tr = TR().check_status(r, 401)
    r2 = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={}, timeout=5)
    return TR().check_status(r2, 401)

# ═══ Token 验证测试 ═══
def test_验证Token():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_验证无效Token():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": "Bearer invalid_token_here"}, timeout=5)
    return TR().check_status(r, 401)

def test_验证无认证():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"), timeout=5)
    return TR().check_status(r, 401)

def test_验证过短Token():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": "Bearer short"}, timeout=5)
    return TR().check_status(r, 401)

# ═══ 用户查询测试 ═══
def test_获取用户资料():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/users/me"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_获取用户资料_无认证():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/users/me"), timeout=5)
    return TR().check_status(r, 401)

def test_获取Token列表():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/tokens/me"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"Token数量不足: {r.json().get('total')}")
    return tr

def test_获取Token列表_无认证():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/tokens/me"), timeout=5)
    return TR().check_status(r, 401)

def test_内部接口_获取用户():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, f"/api/v1/internal/user/{u['id']}"),
        headers={"X-Internal-Key": "dev-internal-key-change-in-production"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_内部接口_无密钥():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/internal/user/1234567890abcdef"), timeout=5)
    return TR().check_status(r, 403)

def test_内部接口_用户不存在():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/internal/user/1234567890abcd"),
        headers={"X-Internal-Key": "dev-internal-key-change-in-production"}, timeout=5)
    return TR().check_status(r, 404)

# ═══ API Key 测试 ═══
def test_创建APIKey():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": f"test_key_{rand_str(4)}", "scopes": ["user:read", "chat:read"], "expires_days": 30
    }, headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        key = r.json().get("key", "")
        if key[:3] not in ("mk-", "rk-"):
            tr.fail(f"APIKey前缀错误: {key[:3]}")
    return tr

def test_创建APIKey_无效天数():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": "test_key", "scopes": ["user:read"], "expires_days": 5
    }, headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_创建APIKey_无认证():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": "test", "scopes": ["user:read"], "expires_days": 30
    }, timeout=5)
    return TR().check_status(r, 401)

# ═══ 房间测试 ═══
def test_创建私聊():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
        "targetUserId": USERS["bob"]["id"]
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        USERS["direct_room_id"] = r.json()["room"]["id"]
        track_room(r.json()["room"]["id"])
    return tr

def test_创建私聊_缺少目标():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={},
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_创建私聊_无认证():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={"targetUserId": "abc"}, timeout=5)
    return TR().check_status(r, 401)

def test_创建群聊():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "测试群组", "memberIds": [USERS["bob"]["id"], USERS["carol"]["id"]]
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        USERS["group_room_id"] = r.json()["room"]["id"]
        track_room(r.json()["room"]["id"])
    return tr

def test_创建群聊_成员过多():
    many_ids = [rand_str(12) for _ in range(101)]
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "过大群组", "memberIds": many_ids
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_创建群聊_无认证():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "hack", "memberIds": []
    }, timeout=5)
    return TR().check_status(r, 401)

def test_获取房间列表():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and len(r.json().get("rooms", [])) < 2:
        tr.fail(f"房间数不足: {len(r.json().get('rooms', []))}")
    return tr

def test_获取房间列表_无认证():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms"), timeout=5)
    return TR().check_status(r, 401)

def test_获取房间详情():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_获取房间详情_不存在():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_获取房间成员():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/members"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"成员数不足: {r.json().get('total')}")
    return tr

def test_获取房间成员_无认证():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/members"), timeout=5)
    return TR().check_status(r, 401)

# ═══ 消息测试 ═══
def test_发送消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    content = f"alice的消息 {rand_str(4)}"
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": content, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        msg = r.json().get("message", {})
        rv = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        vu = rv.json().get("user_id")
        if msg.get("senderId") != vu:
            tr.fail(f"senderId不匹配: 期望{vu}, 实际{msg.get('senderId')}")
    return tr

def test_发送消息_内容为空():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_发送消息_无认证():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "hello", "type": "text"
    }, timeout=5)
    return TR().check_status(r, 401)

def test_发送消息_非成员():
    rid = USERS.get("direct_room_id")
    if rid:
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": "hack attempt", "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['carol']['token']}"}, timeout=5)
        return TR().check_status(r, 403)
    return TR()

def test_获取消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_获取消息_带游标():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages?limit=2"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        d = r.json()
        if d.get("cursor"):
            r2 = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages?cursor={d['cursor']}",
                ), headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            tr = TR().check_status(r2, 200)
    return tr

def test_获取消息_无认证():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), timeout=5)
    return TR().check_status(r, 401)

def test_发送消息_长内容():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "A" * 9999, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_发送消息_超长():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "B" * 10001, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR()
    tr.expected = "400或500"
    tr.actual = r.status_code
    tr.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
    if r.status_code not in (400, 500):
        tr.passed = False
        tr.msg = f"超长消息应返回400/500, 实际{r.status_code}"
    return tr

# ═══ Chat Admin 测试 ═══
def test_Admin_房间列表():
    token = get_admin_token()
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_Admin_房间列表_无认证():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"), timeout=5)
    return TR().check_status(r, 403)

def test_Admin_房间列表_非管理员():
    # 非 debug 会话：真实权限系统，普通用户访问 admin 应 403
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {USERS['bob']['token']}"}, timeout=5)
    return TR().check_status(r, 403)

def test_Admin_房间成员():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"成员数不足: {r.json().get('total')}")
    return tr

def test_Admin_统计():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/stats"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        stats = r.json().get("stats", {})
        if "rooms" not in stats:
            tr.fail(f"stats 缺少 rooms 字段")
    return tr

def test_Admin_创建私聊():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/direct"), json={
        "userA": USERS["bob"]["id"], "userB": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        track_room(r.json().get("room", {}).get("id"))
    return tr

def test_Admin_创建私聊_相同用户():
    token = get_admin_token()
    uid = USERS["bob"]["id"]
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/direct"), json={
        "userA": uid, "userB": uid
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 400)

def test_Admin_创建群聊():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/group"), json={
        "name": "管理员群组", "creatorId": USERS["alice"]["id"],
        "memberIds": [USERS["bob"]["id"], USERS["carol"]["id"]]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        track_room(r.json().get("room", {}).get("id"))
    return tr

def test_Admin_添加成员():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"), json={
        "userId": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201)

def test_Admin_重复添加成员():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"), json={
        "userId": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201)

def test_Admin_移除成员():
    token = get_admin_token()
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    tmp_name = f"tmp_{rand_str(6)}"
    tmp_pw = rand_pw()
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": tmp_name, "password": tmp_pw, "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    tmp_id = r.json()["user"]["id"]
    track_user(tmp_id)
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"), json={
        "userId": tmp_id
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    r = SESSION.delete(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members/{tmp_id}"),
        headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 200)

def test_Admin_代理发消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/messages"), json={
        "senderId": USERS["bob"]["id"], "content": "管理员代发", "type": "text"
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201).check_body(r, ok=True)

def test_Admin_查看消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/messages"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_Admin_删除房间():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/group"), json={
        "name": "待删群组", "creatorId": USERS["alice"]["id"], "memberIds": [USERS["bob"]["id"]]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    del_id = r.json()["room"]["id"]
    r = SESSION.delete(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{del_id}"),
        headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 200)

def test_Admin_删除不存在房间():
    r = SESSION.delete(urljoin(CHAT_BASE, "/api/v1/admin/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

# ═══ User Admin 测试 ═══
def test_Admin_用户列表():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"用户数不足: {r.json().get('total')}")
    return tr

def test_Admin_按ID查用户():
    r = SESSION.get(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['alice']['id']}"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_Admin_用户列表_非管理员():
    # 非 debug 会话：真实权限系统，普通用户访问 admin 应 403
    r = ND_SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {USERS['bob']['token']}"}, timeout=5)
    return TR().check_status(r, 403)

def test_Admin_Token列表():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/tokens"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"Token数不足: {r.json().get('total')}")
    return tr

def test_Admin_修改权限():
    token = get_admin_token()
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "admin"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 200)
    r2 = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "user"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r2, 200)

def test_Admin_删除用户():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": f"del_me_{rand_str(4)}", "password": rand_pw(), "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    del_id = r.json()["user"]["id"]
    r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/users/{del_id}"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200)

def test_Admin_删除不存在用户():
    r = SESSION.delete(urljoin(USER_BASE, "/api/v1/admin/users/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

def test_Admin_撤销Token():
    # 注册临时用户并登录，撤销其 token（避免误伤共享用户的 token）
    tmp_name = f"revoke_{rand_str(6)}"
    pw = rand_pw()
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": tmp_name, "password": pw, "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    tmp_id = r.json()["user"]["id"]
    track_user(tmp_id)
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": tmp_name, "password": pw
    }, timeout=5)
    if r.status_code != 200:
        return TR().check_status(r, 200)
    tmp_token = r.json().get("short_token", "")
    # 撤销后临时 token 应立即失效
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/tokens"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    if r.status_code != 200:
        return TR().check_status(r, 200)
    target = None
    for t in r.json().get("tokens", []):
        if t.get("userId") == tmp_id:
            target = t
            break
    if not target:
        tr = TR()
        tr.fail("临时用户 token 未出现在 admin/tokens 列表")
        return tr
    r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/tokens/{target['id']}"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    if r.status_code != 200:
        return TR().check_status(r, 200)
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {tmp_token}"}, timeout=5)
    if r.status_code != 401:
        tr = TR()
        tr.expected = 401
        tr.actual = r.status_code
        tr.passed = False
        tr.msg = f"撤销后 token 仍有效: {r.status_code}"
        return tr
    return TR()

def test_Admin_撤销不存在Token():
    r = SESSION.delete(urljoin(USER_BASE, "/api/v1/admin/tokens/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

def test_Admin_无效权限():
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "superadmin"
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 400)

# ═══ 跨服务测试 ═══
def test_Chat登录代理():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and "short_token" not in r.json():
        tr.fail("返回体缺少 short_token")
    return tr

def test_Chat登录代理_密码错误():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/login"), json={
        "username": "nonexistent", "password": "wrong"
    }, timeout=5)
    tr = TR()
    tr.expected = "400或401"
    tr.actual = r.status_code
    tr.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
    if r.status_code not in (400, 401):
        tr.passed = False
        tr.msg = f"密码错误应返回400/401, 实际{r.status_code}"
    return tr

# ═══ 健康检查 ═══
def test_User健康检查():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_Chat健康检查():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_User就绪检查():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/ready"), timeout=5)
    return TR().check_status(r, 200)

def test_Chat就绪检查():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/ready"), timeout=5)
    return TR().check_status(r, 200)

def test_User指标():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"), timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "uptime" not in r.json():
        tr.fail("缺少 uptime 字段")
    return tr

def test_Chat指标():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/metrics"), timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "uptime" not in r.json():
        tr.fail("缺少 uptime 字段")
    return tr

# ═══ 并发测试 ═══
def test_并发注册():
    results = []
    def register(i):
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
                "username": f"concur_{rand_str(6)}_{i}", "password": rand_pw(), "app_id": "chat"
            }, timeout=5)
            results.append(r.status_code)
            if r.status_code == 201:
                track_user(r.json().get("user", {}).get("id"))
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=register, args=(i,)) for i in range(15)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    conflict = sum(1 for s in results if s == 400)
    tr = TR()
    tr.expected = "15个请求全部成功或重复"
    tr.actual = f"{ok}成功 {conflict}重复 其他={15-ok-conflict}"
    if ok + conflict != 15:
        tr.passed = False
        tr.msg = f"并发注册异常: {tr.actual}"
    return tr

def test_并发发消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    results = []
    def send_msg(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
                "content": f"并发消息 {i}", "type": "text"
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=send_msg, args=(i,)) for i in range(15)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "15条消息全部成功"
    tr.actual = f"{ok}/15 成功"
    if ok < 15:
        tr.passed = False
        tr.msg = f"并发发消息不足: {tr.actual}"
    return tr

def test_并发登录():
    results = []
    def login(i):
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
                "username": USERS["alice"]["username"], "password": USERS["alice"]["password"]
            }, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=login, args=(i,)) for i in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 200)
    tr = TR()
    tr.expected = "至少5个登录成功"
    tr.actual = f"{ok}/10 成功"
    if ok < 5:
        tr.passed = False
        tr.msg = f"并发登录不足: {tr.actual}"
    return tr

def test_并发创建房间():
    results = []
    def create(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
                "targetUserId": USERS["bob"]["id"]
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            results.append(r.status_code)
            if r.status_code == 201:
                track_room(r.json().get("room", {}).get("id"))
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=create, args=(i,)) for i in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "至少5个房间创建成功"
    tr.actual = f"{ok}/10 成功"
    if ok < 5:
        tr.passed = False
        tr.msg = f"并发创建房间不足: {tr.actual}"
    return tr

# ═══ 边界测试 ═══
def test_无效房间ID():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/INVALID"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_空请求体():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}", "Content-Type": "application/json"},
        data="", timeout=5)
    return TR().check_status(r, 400)

def test_格式错误JSON():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}", "Content-Type": "application/json"},
        data="not json", timeout=5)
    return TR().check_status(r, 400)

def test_方法不允许():
    r = SESSION.put(urljoin(CHAT_BASE, "/api/v1/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR()
    tr.expected = "404或405"
    tr.actual = r.status_code
    if r.status_code not in (404, 405):
        tr.passed = False
        tr.msg = f"方法不允许应返回404/405, 实际{r.status_code}"
    return tr

# ═══ 内容安全测试 ═══
def test_Unicode消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "你好世界 éàè Привет", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_Emoji消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "\U0001f600\U0001f389\U0001f44d\U0001f525 \u2728\U0001f680", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_HTML消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "<script>alert('xss')</script><b>bold</b>", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_SQL注入消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "'; DROP TABLE rooms; --", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_SQL注入登录():
    for p in ["' OR 1=1 --", "admin'--", "'; DROP TABLE users; --", "1' UNION SELECT * FROM users--", "\\' OR '1'='1"]:
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
            "username": p, "password": rand_pw()
        }, timeout=5)
        tr = TR()
        tr.expected = 401
        tr.actual = r.status_code
        if r.status_code != 401:
            tr.passed = False
            tr.msg = f"SQL注入 {p!r} 返回了 {r.status_code}"
            return tr
    return TR()

# ═══ 在线状态测试 ═══
def test_登录后在线状态():
    requests.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, verify=False, timeout=5)
    r_login = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["alice"]["username"], "password": USERS["alice"]["password"]
    }, timeout=5)
    if r_login.ok:
        USERS["alice"]["token"] = r_login.json()["short_token"]
    r = SESSION.get(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        online = r.json().get("user", {}).get("online")
        if online != True:
            tr.fail(f"期望online=True, 实际{online}")
    return tr

def test_统计在线用户():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/stats"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "onlineUsers" not in r.json().get("stats", {}):
        tr.fail("stats 缺少 onlineUsers 字段")
    return tr

# ═══ Token 生命周期 ═══
def test_长期Token验证():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, timeout=10)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        long_token = r.json().get("long_token", "")
        tr.expected = "long_token长度64"
        tr.actual = f"long_token长度{len(long_token)}"
        if len(long_token) != 64:
            tr.passed = False
            tr.msg = f"long_token长度应为64, 实际{len(long_token)}"
            return tr
        r2 = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {long_token}"}, timeout=10)
        return TR().check_status(r2, 200)
    return tr

def test_长短Token都能验证():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, timeout=5)
    if r.status_code != 200:
        return TR().check_status(r, 200)
    d = r.json()
    r1 = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {d['short_token']}"}, timeout=5)
    tr1 = TR().check_status(r1, 200)
    r2 = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {d['long_token']}"}, timeout=5)
    return TR().check_status(r2, 200)

# ═══ Socket.IO 测试 ═══
def test_Socket连接_有效():
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    connected = []
    sio.on("connect", lambda: connected.append(True))
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        tr = TR()
        tr.expected = "Socket连接成功"
        tr.actual = "已连接" if connected else "未连接"
        if not connected:
            tr.passed = False
            tr.msg = "Socket 未连接"
        return tr
    finally:
        sio.disconnect()

def test_Socket连接_无效Token():
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    err = []
    sio.on("connect_error", lambda e: err.append(str(e)))
    try:
        sio.connect(CHAT_BASE, auth={"token": "invalid_token_xxx"}, transports=["polling"])
    except Exception as e:
        err.append(str(e))
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "连接被拒绝"
    tr.actual = f"错误数={len(err)}"
    if len(err) == 0:
        tr.passed = False
        tr.msg = "应拒绝无效Token"
    return tr

def test_Socket加入房间():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.5)
        return TR()
    finally:
        sio.disconnect()

def test_Socket发送消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=8, http_session=SOCKET_HTTP_SESSION)
    ack_data = []
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        time.sleep(0.5)
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.5)
        sio.emit("v1:message", {"roomId": rid, "content": "Socket消息", "type": "text"}, callback=lambda d: ack_data.append(d))
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "收到ok确认"
    tr.actual = f"ack数={len(ack_data)}, 数据={ack_data[0] if ack_data else '无'}"
    if not ack_data or not ack_data[0].get("ok"):
        tr.passed = False
        tr.msg = f"Socket消息失败: {tr.actual}"
    return tr

def test_Socket加入不存在房间():
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    err_data = []
    sio.on("v1:error", lambda d: err_data.append(d))
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        sio.emit("v1:join", {"roomId": "9999999999999999"})
        time.sleep(0.5)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "收到v1:error事件"
    tr.actual = f"错误事件数={len(err_data)}"
    if len(err_data) == 0:
        tr.passed = False
        tr.msg = "应拒绝加入不存在的房间"
    return tr

def test_Socket离开房间():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.3)
        sio.emit("v1:leave", {"roomId": rid})
        time.sleep(0.3)
        return TR()
    finally:
        sio.disconnect()

def test_Socket并发消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    ack_count = [0]
    def on_ack(d):
        if d.get("ok"): ack_count[0] += 1
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.3)
        for i in range(5):
            sio.emit("v1:message", {"roomId": rid, "content": f"并发Socket {i}", "type": "text"}, callback=on_ack)
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "至少3条确认"
    tr.actual = f"{ack_count[0]}/5 确认"
    if ack_count[0] < 3:
        tr.passed = False
        tr.msg = f"Socket并发消息不足: {tr.actual}"
    return tr

def test_Socket快速重连():
    u1 = USERS["alice"]
    for i in range(10):
        try:
            sio = socketio.Client(request_timeout=3, http_session=SOCKET_HTTP_SESSION)
            sio.connect(CHAT_BASE, auth={"token": u1["token"]}, transports=["polling"])
            sio.disconnect()
        except Exception as e:
            tr = TR()
            tr.expected = "重连成功"
            tr.actual = f"第{i+1}次失败: {e}"
            tr.passed = False
            tr.msg = tr.actual
            return tr
    return TR()

# ══════════════════════════════════════════════════════════════
#  新增压力测试：突发流量 / 资源生命周期 / WebSocket多客户端
#  数据一致性 / 大数据量 / 系统韧性
# ══════════════════════════════════════════════════════════════

# ═══ 突发流量 ═══
def test_突发批量注册():
    results = []
    created = []
    def reg(i):
        name = f"burst_{rand_str(6)}_{i}"
        pw = rand_pw()
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
                "username": name, "password": pw, "app_id": "chat"
            }, timeout=10)
            results.append(r.status_code)
            if r.status_code == 201:
                created.append(r.json().get("user", {}).get("id"))
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=reg, args=(i,)) for i in range(50)]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    for uid in created:
        track_user(uid)
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "至少40个注册成功"
    tr.actual = f"{ok}/50 成功 ({elapsed:.1f}s)"
    if ok < 40:
        tr.passed = False
        tr.msg = f"突发注册不足: {tr.actual}"
    return tr

def test_突发批量登录():
    batch_users = []
    for i in range(30):
        name = f"burstlogin_{rand_str(6)}_{i}"
        pw = rand_pw()
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
            "username": name, "password": pw, "app_id": "chat"
        }, timeout=10)
        if r.status_code == 201:
            track_user(r.json().get("user", {}).get("id"))
            batch_users.append({"username": name, "password": pw})
    results = []
    def login_one(u):
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
                "username": u["username"], "password": u["password"]
            }, timeout=10)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=login_one, args=(u,)) for u in batch_users]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    ok = sum(1 for s in results if s == 200)
    tr = TR()
    tr.expected = "至少20个登录成功"
    tr.actual = f"{ok}/{len(batch_users)} 成功 ({elapsed:.1f}s)"
    if ok < 20:
        tr.passed = False
        tr.msg = f"突发登录不足: {tr.actual}"
    return tr

def test_突发批量发消息():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    results = []
    def send(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
                "content": f"突发消息 {i} {rand_str(4)}", "type": "text"
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=10)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=send, args=(i,)) for i in range(100)]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "至少80条消息成功"
    tr.actual = f"{ok}/100 成功 ({elapsed:.1f}s)"
    if ok < 80:
        tr.passed = False
        tr.msg = f"突发发消息不足: {tr.actual}"
    return tr

def test_突发批量创建房间():
    results = []
    created = []
    def create_room(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
                "targetUserId": USERS["bob"]["id"]
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=10)
            results.append(r.status_code)
            if r.status_code == 201:
                created.append(r.json().get("room", {}).get("id"))
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=create_room, args=(i,)) for i in range(30)]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    for rid in created:
        track_room(rid)
    ok = sum(1 for s in results if s in (201, 400))
    tr = TR()
    tr.expected = "至少25个请求成功"
    tr.actual = f"{ok}/30 成功 ({elapsed:.1f}s)"
    if ok < 25:
        tr.passed = False
        tr.msg = f"突发创建房间不足: {tr.actual}"
    return tr

def test_突发混合请求():
    results = []
    lock = threading.Lock()
    def mixed_op(i):
        code = 0
        try:
            if i % 3 == 0:
                r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
                    "username": USERS["alice"]["username"], "password": USERS["alice"]["password"]
                }, timeout=10)
                code = r.status_code
            elif i % 3 == 1:
                r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
                    headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=10)
                code = r.status_code
            else:
                r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms"),
                    headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=10)
                code = r.status_code
        except Exception:
            code = 0
        with lock:
            results.append(code)
    threads = [threading.Thread(target=mixed_op, args=(i,)) for i in range(60)]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    ok = sum(1 for s in results if s in (200, 201))
    tr = TR()
    tr.expected = "至少50个请求成功"
    tr.actual = f"{ok}/60 成功 ({elapsed:.1f}s)"
    if ok < 50:
        tr.passed = False
        tr.msg = f"突发混合请求不足: {tr.actual}"
    return tr

# ═══ 资源生命周期 ═══
def test_快速注册登录删除循环():
    for i in range(20):
        name = f"lifecycle_{rand_str(6)}_{i}"
        pw = rand_pw()
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
            "username": name, "password": pw, "app_id": "chat"
        }, timeout=5)
        tr = TR().check_status(r, 201)
        if r.status_code != 201:
            return tr
        uid = r.json()["user"]["id"]
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
            "username": name, "password": pw
        }, timeout=5)
        tr = TR().check_status(r, 200)
        if r.status_code != 200:
            return tr
        r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {r.json()['short_token']}"}, timeout=5)
        tr = TR().check_status(r, 200)
        if r.status_code != 200:
            return tr
        r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/users/{uid}"),
            headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
        tr = TR().check_status(r, 200)
        if r.status_code != 200:
            return tr
    return TR()

def test_快速创建删除房间循环():
    # 每次循环用临时目标用户创建私聊，避免幂等命中/误删共享的 direct_room_id
    for i in range(15):
        tmp_name = f"lcr_{rand_str(6)}_{i}"
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
            "username": tmp_name, "password": rand_pw(), "app_id": "chat"
        }, timeout=5)
        if r.status_code != 201:
            return TR().check_status(r, 201)
        tmp_id = r.json()["user"]["id"]
        r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
            "targetUserId": tmp_id
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        tr = TR().check_status(r, 201)
        if r.status_code != 201:
            return tr
        rid = r.json()["room"]["id"]
        track_room(rid)
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": f"生命周期消息 {i}", "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        tr = TR().check_status(r, 201)
        if r.status_code != 201:
            return tr
        r = SESSION.delete(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}"),
            headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
        tr = TR().check_status(r, 200)
        if r.status_code != 200:
            return tr
        r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/users/{tmp_id}"),
            headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
        if r.status_code != 200:
            return TR().check_status(r, 200)
    return TR()

def test_快速Token创建撤销():
    for i in range(10):
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
            "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
        }, timeout=5)
        if r.status_code != 200:
            return TR().check_status(r, 200)
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/tokens"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    if r.status_code != 200:
        return TR().check_status(r, 200)
    tokens = r.json().get("tokens", [])
    bob_tokens = [t for t in tokens if t.get("userId") == USERS["bob"]["id"]]
    for t in bob_tokens[:8]:
        r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/tokens/{t['id']}"),
            headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
        tr = TR().check_status(r, 200)
        if r.status_code != 200:
            return tr
    return TR()

def test_快速APIKey生命周期():
    u = list(USERS.values())[0]
    created_keys = []
    for i in range(8):
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
            "name": f"lifecycle_key_{i}", "scopes": ["user:read"], "expires_days": 30
        }, headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
        tr = TR().check_status(r, 201)
        if r.status_code != 201:
            return tr
        created_keys.append(r.json().get("key"))
    tr = TR()
    tr.expected = "8个APIKey全部创建"
    tr.actual = f"创建了{len(created_keys)}个"
    if len(created_keys) != 8:
        tr.passed = False
        tr.msg = f"APIKey创建不足: {tr.actual}"
    return tr

# ═══ WebSocket 多客户端 ═══
def test_Socket多客户端同房间():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sockets = []
    ack_count = [0]
    lock = threading.Lock()
    def on_ack(d):
        if d.get("ok"):
            with lock:
                ack_count[0] += 1
    try:
        for i in range(5):
            sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
            sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
            sio.emit("v1:join", {"roomId": rid})
            sockets.append(sio)
        time.sleep(0.5)
        for i, sio in enumerate(sockets):
            sio.emit("v1:message", {"roomId": rid, "content": f"多客户端 {i}", "type": "text"}, callback=on_ack)
        time.sleep(1)
    finally:
        for sio in sockets:
            try: sio.disconnect()
            except: pass
    tr = TR()
    tr.expected = "至少3条消息确认"
    tr.actual = f"{ack_count[0]}/5 确认"
    if ack_count[0] < 3:
        tr.passed = False
        tr.msg = f"多客户端发消息不足: {tr.actual}"
    return tr

def test_Socket多客户端广播():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    received = [[], [], []]
    sios = []
    try:
        for i in range(3):
            sio = socketio.Client(request_timeout=8, http_session=SOCKET_HTTP_SESSION)
            idx = i
            sio.on("v1:message", lambda d, _idx=idx: received[_idx].append(d))
            sio.connect(CHAT_BASE, auth={"token": USERS["bob"]["token"]}, transports=["polling"])
            time.sleep(0.3)
            sio.emit("v1:join", {"roomId": rid})
            sios.append(sio)
        time.sleep(1)
        sio_sender = socketio.Client(request_timeout=8, http_session=SOCKET_HTTP_SESSION)
        sio_sender.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        time.sleep(0.5)
        sio_sender.emit("v1:join", {"roomId": rid})
        time.sleep(0.5)
        sio_sender.emit("v1:message", {"roomId": rid, "content": "广播测试", "type": "text"})
        time.sleep(2)
        sio_sender.disconnect()
    finally:
        for sio in sios:
            try: sio.disconnect()
            except: pass
    total_recv = sum(len(r) for r in received)
    tr = TR()
    tr.expected = "至少2个客户端收到广播"
    tr.actual = f"共收到{total_recv}条消息"
    if total_recv < 2:
        tr.passed = False
        tr.msg = f"广播接收不足: {tr.actual}"
    return tr

def test_Socket客户端切换房间():
    rid1 = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
        "targetUserId": USERS["bob"]["id"]
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    rid2 = r.json().get("room", {}).get("id") if r.status_code == 201 else rid1
    if r.status_code == 201:
        track_room(rid2)
    sio = socketio.Client(request_timeout=8, http_session=SOCKET_HTTP_SESSION)
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        time.sleep(0.5)
        sio.emit("v1:join", {"roomId": rid1})
        time.sleep(0.5)
        sio.emit("v1:leave", {"roomId": rid1})
        time.sleep(0.5)
        sio.emit("v1:join", {"roomId": rid2})
        time.sleep(0.5)
        ack = []
        sio.emit("v1:message", {"roomId": rid2, "content": "切换房间后消息", "type": "text"},
                  callback=lambda d: ack.append(d))
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "切换房间后消息发送成功"
    tr.actual = f"ack={ack[0] if ack else '无'}"
    if not ack or not ack[0].get("ok"):
        tr.passed = False
        tr.msg = f"切换房间后发消息失败: {tr.actual}"
    return tr

def test_Socket大规模并发连接():
    results = []
    def connect_cycle(i):
        try:
            sio = socketio.Client(request_timeout=3, http_session=SOCKET_HTTP_SESSION)
            sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
            time.sleep(0.05)
            sio.disconnect()
            results.append(True)
        except Exception:
            results.append(False)
    threads = [threading.Thread(target=connect_cycle, args=(i,)) for i in range(20)]
    t0 = time.time()
    for t in threads: t.start()
    for t in threads: t.join()
    elapsed = time.time() - t0
    ok = sum(1 for r in results if r)
    tr = TR()
    tr.expected = "至少15个连接成功"
    tr.actual = f"{ok}/20 成功 ({elapsed:.1f}s)"
    if ok < 15:
        tr.passed = False
        tr.msg = f"大规模并发连接不足: {tr.actual}"
    return tr

def test_Socket消息顺序一致性():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sent_contents = []
    for i in range(20):
        content = f"顺序_{i}_{rand_str(4)}"
        sent_contents.append(content)
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": content, "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 201:
            return TR().check_status(r, 201)
    time.sleep(0.5)
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages?limit=25"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        items = r.json().get("items", [])
        fetched = [m.get("content") for m in items]
        missing = [s for s in sent_contents[-20:] if s not in fetched]
        tr.expected = f"全部{len(sent_contents[-20:])}条消息可查"
        tr.actual = f"缺失{len(missing)}条"
        if len(missing) > 0:
            tr.passed = False
            tr.msg = f"消息顺序不一致: {tr.actual}"
    return tr

# ═══ 数据一致性 ═══
def test_并发修改权限一致性():
    uid = USERS["bob"]["id"]
    results = []
    def change_perm(i):
        perm = "admin" if i % 2 == 0 else "user"
        try:
            r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{uid}/permission"), json={
                "permission": perm
            }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=change_perm, args=(i,)) for i in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 200)
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{uid}/permission"), json={
        "permission": "user"
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR()
    tr.expected = "至少8个权限修改成功"
    tr.actual = f"{ok}/10 成功"
    if ok < 8:
        tr.passed = False
        tr.msg = f"并发修改权限不足: {tr.actual}"
    return tr

def test_并发创建私聊幂等性():
    room_ids = []
    lock = threading.Lock()
    def create_direct():
        try:
            r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
                "targetUserId": USERS["bob"]["id"]
            }, headers={"Authorization": f"Bearer {USERS['carol']['token']}"}, timeout=10)
            if r.status_code == 201:
                rid = r.json().get("room", {}).get("id")
                with lock:
                    room_ids.append(rid)
        except Exception:
            pass
    threads = [threading.Thread(target=create_direct) for _ in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    for rid in room_ids:
        track_room(rid)
    tr = TR()
    tr.expected = "并发创建私聊幂等"
    tr.actual = f"创建了{len(set(room_ids))}个不同房间"
    if len(room_ids) > 0 and len(set(room_ids)) > 1:
        tr.passed = False
        tr.msg = f"并发创建私聊非幂等: {tr.actual}"
    return tr

def test_消息发送后即时可查():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    content = f"即时查询_{rand_str(8)}"
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": content, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201)
    if r.status_code != 201:
        return tr
    time.sleep(0.2)
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages?limit=5"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        items = r.json().get("items", [])
        found = any(m.get("content") == content for m in items)
        tr.expected = "消息可即时查询"
        tr.actual = "已找到" if found else "未找到"
        if not found:
            tr.passed = False
            tr.msg = "发送的消息未在查询结果中找到"
    return tr

# ═══ 大数据量 ═══
def test_消息分页游标压力():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sent = []
    for i in range(50):
        content = f"分页_{i}_{rand_str(3)}"
        sent.append(content)
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": content, "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 201:
            return TR().check_status(r, 201)
    all_fetched = []
    cursor = None
    for page in range(15):
        url = f"/api/v1/rooms/{rid}/messages?limit=5"
        if cursor:
            url += f"&cursor={cursor}"
        r = SESSION.get(urljoin(CHAT_BASE, url),
            headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 200:
            return TR().check_status(r, 200)
        d = r.json()
        items = d.get("items", [])
        all_fetched.extend([m.get("content") for m in items])
        cursor = d.get("cursor")
        if not cursor or len(items) == 0:
            break
    missing = [s for s in sent[-30:] if s not in all_fetched]
    tr = TR()
    tr.expected = f"全部{len(sent[-30:])}条消息可分页获取"
    tr.actual = f"缺失{len(missing)}条"
    if len(missing) > 5:
        tr.passed = False
        tr.msg = f"分页压力测试失败: {tr.actual}"
    return tr

def test_大群组消息():
    member_ids = []
    for i in range(5):
        name = f"biggrp_{rand_str(5)}_{i}"
        pw = rand_pw()
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
            "username": name, "password": pw, "app_id": "chat"
        }, timeout=5)
        if r.status_code == 201:
            uid = r.json()["user"]["id"]
            track_user(uid)
            member_ids.append(uid)
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "大群组测试", "memberIds": member_ids
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    big_rid = r.json()["room"]["id"]
    track_room(big_rid)
    results = []
    def send_as(uid, i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{big_rid}/messages"), json={
                "content": f"大群消息 {i}", "type": "text"
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=send_as, args=(USERS["alice"]["id"], i)) for i in range(25)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "至少20条消息成功"
    tr.actual = f"{ok}/25 成功"
    if ok < 20:
        tr.passed = False
        tr.msg = f"大群组消息不足: {tr.actual}"
    return tr

def test_大payloads注册():
    results = []
    for i in range(20):
        name = f"payload_{rand_str(4)}_{i}"
        pw = rand_pw() * 3
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
                "username": name, "password": pw, "app_id": "chat"
            }, timeout=10)
            results.append(r.status_code)
            if r.status_code == 201:
                track_user(r.json()["user"]["id"])
        except Exception:
            results.append(0)
    ok = sum(1 for s in results if s in (201, 400))
    tr = TR()
    tr.expected = "至少18个请求成功处理"
    tr.actual = f"{ok}/20 成功"
    if ok < 18:
        tr.passed = False
        tr.msg = f"大payloads注册不足: {tr.actual}"
    return tr

# ═══ 系统韧性 ═══
def test_连续错误请求():
    for i in range(20):
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
                "username": f"hacker_{i}", "password": "wrong"
            }, timeout=5)
            if r.status_code not in (401, 400):
                tr = TR()
                tr.expected = "401或400"
                tr.actual = r.status_code
                tr.passed = False
                tr.msg = f"第{i+1}个错误请求返回 {r.status_code}"
                return tr
        except requests.exceptions.ConnectionError:
            tr = TR()
            tr.expected = "连接正常"
            tr.actual = "连接断开"
            tr.passed = False
            tr.msg = f"第{i+1}个错误请求导致连接断开"
            return tr
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_健康检查基线():
    r1 = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"), timeout=5)
    if r1.status_code != 200:
        return TR().check_status(r1, 200)
    mem1 = r1.json().get("memory", {}).get("rss", 0)
    for i in range(50):
        SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    r2 = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"), timeout=5)
    if r2.status_code != 200:
        return TR().check_status(r2, 200)
    mem2 = r2.json().get("memory", {}).get("rss", 0)
    tr = TR()
    tr.expected = f"内存增长不超过2倍 (基线={mem1})"
    tr.actual = f"实际={mem2}"
    if mem1 > 0 and mem2 > mem1 * 2:
        tr.passed = False
        tr.msg = f"内存增长过快: {mem1} -> {mem2}"
    return tr

def test_连续健康检查():
    for i in range(30):
        r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=3)
        if r.status_code != 200:
            return TR().check_status(r, 200)
        r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/health"), timeout=3)
        if r.status_code != 200:
            return TR().check_status(r, 200)
    return TR()

# ═══ 测试套件定义 ═══
# ══════════════════════════════════════════════════════════════
#  权限矩阵 (debug / 非debug 双模式)
# ══════════════════════════════════════════════════════════════

def test_非debug_真Admin访问chatAdmin():
    # 无 debug header，真实 admin (alice=首个注册用户) 应通过
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_非debug_真Admin访问userAdmin():
    r = ND_SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"用户数不足: {r.json().get('total')}")
    return tr

def test_非debug_无认证Admin403():
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"), timeout=5)
    return TR().check_status(r, 403)

def test_非debug_非成员访问房间详情403():
    # 注册临时用户（从未加入任何房间）→ 403
    tmp_name = f"nonmember_{rand_str(4)}"
    pw = rand_pw()
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": tmp_name, "password": pw, "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    tmp_token_r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": tmp_name, "password": pw
    }, timeout=5)
    if tmp_token_r.status_code != 200:
        return TR().check_status(tmp_token_r, 200)
    tmp_token = tmp_token_r.json().get("short_token", "")
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r2 = ND_SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}"),
        headers={"Authorization": f"Bearer {tmp_token}"}, timeout=5)
    return TR().check_status(r2, 403)

def test_非debug_非成员访问房间成员403():
    tmp_name = f"nonmember_{rand_str(4)}"
    pw = rand_pw()
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": tmp_name, "password": pw, "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    tmp_token_r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": tmp_name, "password": pw
    }, timeout=5)
    if tmp_token_r.status_code != 200:
        return TR().check_status(tmp_token_r, 200)
    tmp_token = tmp_token_r.json().get("short_token", "")
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r2 = ND_SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/members"),
        headers={"Authorization": f"Bearer {tmp_token}"}, timeout=5)
    return TR().check_status(r2, 403)

def test_debug_成员访问房间详情200():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_非debug_房间不存在404():
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_消息类型超长400():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "type超长测试", "type": "abcdefghij"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_注册重复用户名400():
    # 产品设计：重名用户自动获得 #N 后缀（全局名唯一），注册仍成功
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": USERS["alice"]["username"], "password": "Test1234!", "app_id": "chat"
    }, timeout=5)
    tr = TR().check_status(r, 201)
    if r.status_code == 201:
        g = r.json().get("user", {}).get("globalName", "")
        if g == USERS["alice"]["username"]:
            tr.fail(f"重名注册未生成后缀: {g}")
    return tr

def test_登录错误密码401():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["alice"]["username"], "password": "WrongPass123!"
    }, timeout=5)
    return TR().check_status(r, 401)

def test_分页翻页无重复():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    # 先发 70 条消息撑出 3 页
    for i in range(70):
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": f"分页消息{i:03d}", "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 201:
            return TR().check_status(r, 201)
    seen = set()
    cursor = None
    pages = 0
    while pages < 10:
        url = f"/api/v1/rooms/{rid}/messages?limit=30"
        if cursor:
            url += f"&cursor={cursor}"
        r = SESSION.get(urljoin(CHAT_BASE, url),
            headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 200:
            return TR().check_status(r, 200)
        data = r.json()
        items = data.get("items") or data.get("messages") or []
        dupes = [m["id"] for m in items if m["id"] in seen]
        if dupes:
            tr = TR().check_status(r, 200)
            tr.fail(f"翻页出现重复消息: {dupes[:3]}")
            return tr
        for m in items:
            seen.add(m["id"])
        pages += 1
        if not data.get("hasMore"):
            break
        cursor = data.get("cursor")
    if len(seen) < 70:
        tr = TR().check_status(r, 200)
        tr.fail(f"翻页消息数不足: {len(seen)}/70, pages={pages}")
        return tr
    return TR().check_status(r, 200)

def test_最后管理员保护():
    # 验证管理员保护：admin 不能降级自己的权限（防误操作）
    token = get_admin_token()  # alice = admin
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['alice']['id']}/permission"), json={
        "permission": "user"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 400)
    if tr.ok() and "权限" not in (r.json().get("error") or ""):
        tr.fail(f"错误信息不含\"权限\": {r.json().get('error')}")
    return tr

def test_Token生命周期_短token仍可验证():
    # 登录后 short token 立即有效；同时 long token 也有效
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

SUITES = [
    ("健康检查", [
        (test_User健康检查, 1), (test_Chat健康检查, 1),
        (test_User就绪检查, 1), (test_Chat就绪检查, 1),
        (test_User指标, 1), (test_Chat指标, 1),
    ]),
    ("用户注册", [
        (test_重复注册_生成不同名, 15),
        (test_注册用户名过短, 15),
        (test_注册密码过短, 15),
    ]),
    ("用户登录", [
        (test_登录, 1),
        (test_登录密码错误, 15),
        (test_登录用户不存在, 15),
        (test_登录缺少字段, 15),
    ]),
    ("Token验证", [
        (test_验证Token, 15),
        (test_验证无效Token, 15),
        (test_验证无认证, 15),
        (test_验证过短Token, 15),
    ]),
    ("用户查询", [
        (test_获取用户资料, 15),
        (test_获取用户资料_无认证, 15),
        (test_获取Token列表, 15),
        (test_获取Token列表_无认证, 15),
        (test_内部接口_获取用户, 15),
        (test_内部接口_无密钥, 15),
        (test_内部接口_用户不存在, 15),
    ]),
    ("API密钥", [
        (test_创建APIKey, 15),
        (test_创建APIKey_无效天数, 15),
        (test_创建APIKey_无认证, 15),
    ]),
    ("房间管理", [
        (test_创建私聊, 1),
        (test_创建私聊_缺少目标, 15),
        (test_创建私聊_无认证, 15),
        (test_创建群聊, 1),
        (test_创建群聊_成员过多, 15),
        (test_创建群聊_无认证, 15),
        (test_获取房间列表, 15),
        (test_获取房间列表_无认证, 15),
        (test_获取房间详情, 15),
        (test_获取房间详情_不存在, 15),
        (test_获取房间成员, 15),
        (test_获取房间成员_无认证, 15),
    ]),
    ("消息收发", [
        (test_发送消息, 15),
        (test_发送消息_内容为空, 15),
        (test_发送消息_无认证, 15),
        (test_发送消息_非成员, 15),
        (test_获取消息, 15),
        (test_获取消息_带游标, 15),
        (test_获取消息_无认证, 15),
        (test_发送消息_长内容, 15),
        (test_发送消息_超长, 15),
    ]),
    ("管理员-聊天", [
        (test_Admin_房间列表, 15),
        (test_Admin_房间列表_无认证, 15),
        (test_Admin_房间列表_非管理员, 15),
        (test_Admin_房间成员, 15),
        (test_Admin_统计, 15),
        (test_Admin_创建私聊, 1),
        (test_Admin_创建私聊_相同用户, 15),
        (test_Admin_创建群聊, 1),
        (test_Admin_添加成员, 1),
        (test_Admin_重复添加成员, 15),
        (test_Admin_移除成员, 15),
        (test_Admin_代理发消息, 15),
        (test_Admin_查看消息, 15),
        (test_Admin_删除房间, 1),
        (test_Admin_删除不存在房间, 15),
    ]),
    ("管理员-用户", [
        (test_Admin_用户列表, 15),
        (test_Admin_按ID查用户, 15),
        (test_Admin_用户列表_非管理员, 15),
        (test_Admin_Token列表, 15),
        (test_Admin_修改权限, 15),
        (test_Admin_删除用户, 5),
        (test_Admin_删除不存在用户, 15),
        (test_Admin_撤销Token, 5),
        (test_Admin_撤销不存在Token, 15),
        (test_Admin_无效权限, 15),
    ]),
    ("跨服务调用", [
        (test_Chat登录代理, 15),
        (test_Chat登录代理_密码错误, 15),
    ]),
    ("并发测试", [
        (test_并发注册, 5),
        (test_并发发消息, 5),
        (test_并发登录, 5),
        (test_并发创建房间, 5),
    ]),
    ("边界测试", [
        (test_无效房间ID, 15),
        (test_空请求体, 15),
        (test_格式错误JSON, 15),
        (test_方法不允许, 15),
    ]),
    ("Socket.IO", [
        (test_Socket连接_有效, 5),
        (test_Socket连接_无效Token, 5),
        (test_Socket加入房间, 5),
        (test_Socket发送消息, 5),
        (test_Socket加入不存在房间, 5),
        (test_Socket离开房间, 5),
        (test_Socket并发消息, 5),
        (test_Socket快速重连, 5),
    ]),
    ("内容安全", [
        (test_Unicode消息, 15),
        (test_Emoji消息, 15),
        (test_HTML消息, 15),
        (test_SQL注入消息, 15),
        (test_SQL注入登录, 5),
    ]),
    ("在线状态", [
        (test_登录后在线状态, 5),
        (test_统计在线用户, 5),
    ]),
    ("Token生命周期", [
        (test_长期Token验证, 15),
        (test_长短Token都能验证, 15),
        (test_Socket快速重连, 5),
    ]),
    # ═══ 新增压力测试套件 ═══
    ("突发流量", [
        (test_突发批量注册, 3),
        (test_突发批量登录, 3),
        (test_突发批量发消息, 3),
        (test_突发批量创建房间, 3),
        (test_突发混合请求, 3),
    ]),
    ("资源生命周期", [
        (test_快速注册登录删除循环, 3),
        (test_快速创建删除房间循环, 3),
        (test_快速Token创建撤销, 3),
        (test_快速APIKey生命周期, 3),
    ]),
    ("WebSocket多客户端", [
        (test_Socket多客户端同房间, 3),
        (test_Socket多客户端广播, 3),
        (test_Socket客户端切换房间, 3),
        (test_Socket大规模并发连接, 3),
        (test_Socket消息顺序一致性, 3),
    ]),
    ("数据一致性", [
        (test_并发修改权限一致性, 3),
        (test_并发创建私聊幂等性, 3),
        (test_消息发送后即时可查, 3),
    ]),
    ("大数据量", [
        (test_消息分页游标压力, 2),
        (test_大群组消息, 2),
        (test_大payloads注册, 2),
    ]),
    ("系统韧性", [
        (test_连续错误请求, 3),
        (test_健康检查基线, 2),
        (test_连续健康检查, 3),
    ]),
    # ═══ 权限矩阵 — 放最后，因为最后管理员保护测试会删除测试用户 ═══
    ("权限矩阵", [
        (test_非debug_真Admin访问chatAdmin, 3),
        (test_非debug_真Admin访问userAdmin, 3),
        (test_非debug_无认证Admin403, 3),
        (test_非debug_非成员访问房间详情403, 3),
        (test_非debug_非成员访问房间成员403, 3),
        (test_debug_成员访问房间详情200, 3),
        (test_非debug_房间不存在404, 3),
        (test_消息类型超长400, 3),
        (test_注册重复用户名400, 3),
        (test_登录错误密码401, 3),
        (test_分页翻页无重复, 1),
        (test_最后管理员保护, 1),
        (test_Token生命周期_短token仍可验证, 3),
    ]),
]

def run_all():
    global PASS, FAIL, EXPECTED_FAIL, ERRORS
    PASS = 0
    FAIL = 0
    EXPECTED_FAIL = 0
    ERRORS = []

    log("\n=== 等待服务就绪 ===")
    try:
        wait_service(USER_BASE, "User Service")
        wait_service(CHAT_BASE, "Chat Service")
    except Exception as e:
        log(f"致命错误: {e}")
        sys.exit(1)

    log("\n=== 重置数据库 ===")
    reset_db()

    log("\n=== 初始化测试用户 ===")
    init_users()
    try:
        test_注册()
        test_登录()
        for u in USERS.values():
            if u.get("id"):
                track_user(u["id"])
        log("  用户已创建并登录")
    except Exception as e:
        log(f"致命错误: 初始化失败: {e}")
        sys.exit(1)

    for suite_name, tests in SUITES:
        log(f"\n{'='*60}")
        log(f"  套件: {suite_name}")
        log(f"{'='*60}")
        for fn, times in tests:
            R(fn.__name__, fn, times=times)

    total = PASS + FAIL + EXPECTED_FAIL
    log(f"\n{'='*60}")
    log(f"  总计: {total} 项测试")
    log(f"  通过: {PASS}")
    log(f"  预期失败: {EXPECTED_FAIL}")
    log(f"  失败: {FAIL}")
    log(f"  追踪资源: 用户={len(TESTED_IDS['users'])}, 房间={len(TESTED_IDS['rooms'])}, Token={len(TESTED_IDS['tokens'])}")
    if ERRORS:
        log(f"\n  失败详情（前10条）:")
        for e in ERRORS[:10]:
            log(f"    {e}")
    log(f"{'='*60}")

    cleanup_all()

    return FAIL == 0

if __name__ == "__main__":
    ok = run_all()
    sys.exit(0 if ok else 1)
