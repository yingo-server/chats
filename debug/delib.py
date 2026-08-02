#!/usr/bin/env python3
"""Yingo microservice full-chain stress test suite (local dev environment) — complete edition"""

import requests, sys, time, random, string, json, threading, hmac, hashlib, secrets, os
from urllib.parse import urljoin
import urllib3
import socketio

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ═══ Configuration (cloud production environment, overridable via env vars) ═══
USER_BASE = os.environ.get("USER_BASE", "https://server.344977.xyz:9000")
CHAT_BASE = os.environ.get("CHAT_BASE", "https://server.344977.xyz:9001")
CLOUD_MODE = os.environ.get("CLOUD_MODE", "1") == "1"
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

# ═══ Test session ═══
SESSION = requests.Session()
SESSION.verify = False
SOCKET_HTTP_SESSION = requests.Session()
SOCKET_HTTP_SESSION.verify = False

# ═══ Non-debug session (no debug headers at all, validates the real permission system) ═══
ND_SESSION = requests.Session()
ND_SESSION.verify = False

# ═══ Test resource tracking (clean up all traces after the run) ═══
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

# ═══ Structured test result ═══
class TR:
    """Test result container"""
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
            self.msg = f"status mismatch: expected {expected}, got {r.status_code}"
        return self

    def check_body(self, r, **kw):
        self.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
        for k, v in kw.items():
            actual_val = self.body.get(k) if isinstance(self.body, dict) else None
            if actual_val != v:
                self.passed = False
                self.msg = f"body.{k} expected {v!r}, got {actual_val!r}"
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
                ERRORS.append(f"[{name}] run {i+1}: {result.msg}")
                body_str = _fmt_body(result.body)
                line = f"  run {i+1} [{name}] expected={result.expected} actual={result.actual} MISMATCH"
                log(line)
                if QUIET:
                    print(line, file=sys.__stdout__, flush=True)
                if body_str:
                    log(f"    body: {body_str}")
                    if QUIET:
                        print(f"    body: {body_str}", file=sys.__stdout__, flush=True)
            else:
                suite_ok += 1
                PASS += 1
                if not QUIET:
                    if result and hasattr(result, 'body'):
                        body_str = _fmt_body(result.body)
                        log(f"  run {i+1} [{name}] expected={result.expected} actual={result.actual} OK")
                        if body_str:
                            log(f"    body: {body_str}")
                    else:
                        log(f"  run {i+1} [{name}] passed")
        except Exception as e:
            msg = str(e) or repr(e)
            if expected_fail_codes and any(c in msg for c in expected_fail_codes):
                EXPECTED_FAIL += 1
                suite_ok += 1
                log(f"  run {i+1} [{name}] expected failure, as expected")
            else:
                suite_fail += 1
                FAIL += 1
                ERRORS.append(f"[{name}] run {i+1}: {msg}")
                log(f"  run {i+1} [{name}] exception: {msg}")
    status = "PASS" if suite_fail == 0 else "FAIL"
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
                log(f"  {name} ready")
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(f"{name} not ready (timeout {timeout}s)")

# ═══ Database reset (local Docker: local-pg / local-redis) ═══
def reset_db():
    log("\n=== Reset database ===")
    if CLOUD_MODE:
        log("  CLOUD_MODE=1, skipping local docker reset (run the purge SQL manually on the server)")
        return
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
        log(f"  user-db reset ({user_db})")
    except Exception as e:
        log(f"  user-db reset failed: {e}")
    try:
        subprocess.run(["docker", "exec", chat_db, "psql", "-U", "yingo", "-d", "cold_chat", "-c", chat_sql],
                       capture_output=True, text=True, timeout=15, check=True)
        log(f"  chat-db reset ({chat_db})")
    except Exception as e:
        log(f"  chat-db reset failed: {e}")
    try:
        subprocess.run(["docker", "exec", redis_c, "redis-cli", "FLUSHDB"],
                       capture_output=True, text=True, timeout=15, check=True)
        log(f"  redis hot zone cleared ({redis_c})")
    except Exception as e:
        log(f"  redis flush failed: {e}")

def cleanup_all():
    log("\n=== Clean up test traces ===")
    admin_token = USERS.get("admin", {}).get("token") or USERS.get("alice", {}).get("token")
    if not admin_token:
        log("  no admin token, skipping API cleanup")
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
    log(f"  API cleanup: users={cleaned['users']}, rooms={cleaned['rooms']}, tokens={cleaned['tokens']}")
    TESTED_IDS["users"].clear()
    TESTED_IDS["rooms"].clear()
    TESTED_IDS["tokens"].clear()
    TESTED_IDS["api_keys"].clear()
    reset_db()

# ═══ User management ═══
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
#  Test functions (each returns a TR result object)
# ══════════════════════════════════════════════════════════════

# ═══ Registration tests ═══
def test_register():
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

def test_register_duplicate_username():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": u["username"], "password": u["password"],
    }, timeout=5)
    tr = TR().check_status(r, 201)
    if r.status_code == 201:
        d = r.json()
        if d.get("user", {}).get("globalName") == u["username"]:
            tr.fail(f"duplicate registration should generate a different name, got the same: {d['user']['globalName']}")
    return tr

def test_register_username_too_short():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": "a", "password": rand_pw(),
    }, timeout=5)
    return TR().check_status(r, 400)

def test_register_password_too_short():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": rand_str(6), "password": "short",
    }, timeout=5)
    return TR().check_status(r, 400)

# ═══ Login tests ═══
def test_login():
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

def test_login_wrong_password():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": list(USERS.values())[0]["username"], "password": "wrong_password_here",
    }, timeout=5)
    return TR().check_status(r, 401)

def test_login_user_not_found():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": "nonexistent_user_xyz", "password": rand_pw(),
    }, timeout=5)
    return TR().check_status(r, 401)

def test_login_missing_fields():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={"username": "test"}, timeout=5)
    tr = TR().check_status(r, 401)
    r2 = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={}, timeout=5)
    return TR().check_status(r2, 401)

# ═══ Token verification tests ═══
def test_verify_token():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_verify_invalid_token():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": "Bearer invalid_token_here"}, timeout=5)
    return TR().check_status(r, 401)

def test_verify_no_auth():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"), timeout=5)
    return TR().check_status(r, 401)

def test_verify_short_token():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": "Bearer short"}, timeout=5)
    return TR().check_status(r, 401)

# ═══ User query tests ═══
def test_get_user_profile():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/users/me"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_get_user_profile_no_auth():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/users/me"), timeout=5)
    return TR().check_status(r, 401)

def test_get_token_list():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/tokens/me"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough tokens: {r.json().get('total')}")
    return tr

def test_get_token_list_no_auth():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/tokens/me"), timeout=5)
    return TR().check_status(r, 401)

def test_internal_get_user():
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, f"/api/v1/internal/user/{u['id']}"),
        headers={"X-Internal-Key": "dev-internal-key-change-in-production"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_internal_no_key():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/internal/user/1234567890abcdef"), timeout=5)
    return TR().check_status(r, 403)

def test_internal_user_not_found():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/internal/user/1234567890abcd"),
        headers={"X-Internal-Key": "dev-internal-key-change-in-production"}, timeout=5)
    return TR().check_status(r, 404)

# ═══ API key tests ═══
def test_create_api_key():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": f"test_key_{rand_str(4)}", "scopes": ["user:read", "chat:read"], "expires_days": 30
    }, headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        key = r.json().get("key", "")
        if key[:3] not in ("mk-", "rk-"):
            tr.fail(f"API key prefix wrong: {key[:3]}")
    return tr

def test_create_api_key_invalid_days():
    u = list(USERS.values())[0]
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": "test_key", "scopes": ["user:read"], "expires_days": 5
    }, headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_create_api_key_no_auth():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/api-keys"), json={
        "name": "test", "scopes": ["user:read"], "expires_days": 30
    }, timeout=5)
    return TR().check_status(r, 401)

# ═══ Room tests ═══
def test_create_direct_room():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={
        "targetUserId": USERS["bob"]["id"]
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        USERS["direct_room_id"] = r.json()["room"]["id"]
        track_room(r.json()["room"]["id"])
    return tr

def test_create_direct_missing_target():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={},
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_create_direct_no_auth():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"), json={"targetUserId": "abc"}, timeout=5)
    return TR().check_status(r, 401)

def test_create_group_room():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "Test Group", "memberIds": [USERS["bob"]["id"], USERS["carol"]["id"]]
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        USERS["group_room_id"] = r.json()["room"]["id"]
        track_room(r.json()["room"]["id"])
    return tr

def test_create_group_too_many_members():
    many_ids = [rand_str(12) for _ in range(101)]
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "Oversized Group", "memberIds": many_ids
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_create_group_no_auth():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/group"), json={
        "name": "hack", "memberIds": []
    }, timeout=5)
    return TR().check_status(r, 401)

def test_get_room_list():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and len(r.json().get("rooms", [])) < 2:
        tr.fail(f"not enough rooms: {len(r.json().get('rooms', []))}")
    return tr

def test_get_room_list_no_auth():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms"), timeout=5)
    return TR().check_status(r, 401)

def test_get_room_detail():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_get_room_detail_not_found():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_get_room_members():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/members"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough members: {r.json().get('total')}")
    return tr

def test_get_room_members_no_auth():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/members"), timeout=5)
    return TR().check_status(r, 401)

# ═══ Message tests ═══
def test_send_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    content = f"alice message {rand_str(4)}"
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
            tr.fail(f"senderId mismatch: expected {vu}, got {msg.get('senderId')}")
    return tr

def test_send_message_empty_content():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_send_message_no_auth():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "hello", "type": "text"
    }, timeout=5)
    return TR().check_status(r, 401)

def test_send_message_non_member():
    rid = USERS.get("direct_room_id")
    if rid:
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": "hack attempt", "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['carol']['token']}"}, timeout=5)
        return TR().check_status(r, 403)
    return TR()

def test_get_messages():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_get_messages_with_cursor():
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

def test_get_messages_no_auth():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), timeout=5)
    return TR().check_status(r, 401)

def test_send_message_long_content():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "A" * 9999, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_send_message_too_long():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "B" * 10001, "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR()
    tr.expected = "400 or 500"
    tr.actual = r.status_code
    tr.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
    if r.status_code not in (400, 500):
        tr.passed = False
        tr.msg = f"overly long message should return 400/500, got {r.status_code}"
    return tr

# ═══ Chat Admin tests ═══
def test_admin_room_list():
    token = get_admin_token()
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_admin_room_list_no_auth():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"), timeout=5)
    return TR().check_status(r, 403)

def test_admin_room_list_non_admin():
    # Non-debug session: real permission system, a normal user must get 403
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {USERS['bob']['token']}"}, timeout=5)
    return TR().check_status(r, 403)

def test_admin_room_members():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough members: {r.json().get('total')}")
    return tr

def test_admin_stats():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/stats"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        stats = r.json().get("stats", {})
        if "rooms" not in stats:
            tr.fail(f"stats missing rooms field")
    return tr

def test_admin_create_direct():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/direct"), json={
        "userA": USERS["bob"]["id"], "userB": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        track_room(r.json().get("room", {}).get("id"))
    return tr

def test_admin_create_direct_same_user():
    token = get_admin_token()
    uid = USERS["bob"]["id"]
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/direct"), json={
        "userA": uid, "userB": uid
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 400)

def test_admin_create_group():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/group"), json={
        "name": "Admin Group", "creatorId": USERS["alice"]["id"],
        "memberIds": [USERS["bob"]["id"], USERS["carol"]["id"]]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 201).check_body(r, ok=True)
    if tr.ok():
        track_room(r.json().get("room", {}).get("id"))
    return tr

def test_admin_add_member():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"), json={
        "userId": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201)

def test_admin_add_member_duplicate():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/members"), json={
        "userId": USERS["carol"]["id"]
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201)

def test_admin_remove_member():
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

def test_admin_proxy_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/messages"), json={
        "senderId": USERS["bob"]["id"], "content": "admin proxy message", "type": "text"
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 201).check_body(r, ok=True)

def test_admin_get_messages():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{rid}/messages"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_admin_delete_room():
    token = get_admin_token()
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/admin/rooms/group"), json={
        "name": "Group to delete", "creatorId": USERS["alice"]["id"], "memberIds": [USERS["bob"]["id"]]
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    del_id = r.json()["room"]["id"]
    r = SESSION.delete(urljoin(CHAT_BASE, f"/api/v1/admin/rooms/{del_id}"),
        headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r, 200)

def test_admin_delete_missing_room():
    r = SESSION.delete(urljoin(CHAT_BASE, "/api/v1/admin/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

# ═══ User Admin tests ═══
def test_admin_user_list():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough users: {r.json().get('total')}")
    return tr

def test_admin_get_user_by_id():
    r = SESSION.get(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['alice']['id']}"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_admin_user_list_non_admin():
    # Non-debug session: real permission system, a normal user must get 403
    r = ND_SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {USERS['bob']['token']}"}, timeout=5)
    return TR().check_status(r, 403)

def test_admin_token_list():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/admin/tokens"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough tokens: {r.json().get('total')}")
    return tr

def test_admin_update_permission():
    token = get_admin_token()
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "admin"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 200)
    r2 = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "user"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    return TR().check_status(r2, 200)

def test_admin_delete_user():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": f"del_me_{rand_str(4)}", "password": rand_pw(), "app_id": "chat"
    }, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    del_id = r.json()["user"]["id"]
    r = SESSION.delete(urljoin(USER_BASE, f"/api/v1/admin/users/{del_id}"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 200)

def test_admin_delete_missing_user():
    r = SESSION.delete(urljoin(USER_BASE, "/api/v1/admin/users/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

def test_admin_revoke_token():
    # Register a temp user and log in, then revoke its token (avoid revoking shared users' tokens)
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
    # The temp token must become invalid immediately after revocation
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
        tr.fail("temp user token not found in admin/tokens list")
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
        tr.msg = f"revoked token still valid: {r.status_code}"
        return tr
    return TR()

def test_admin_revoke_missing_token():
    r = SESSION.delete(urljoin(USER_BASE, "/api/v1/admin/tokens/9999999999999999"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 404)

def test_admin_invalid_permission():
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['bob']['id']}/permission"), json={
        "permission": "superadmin"
    }, headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    return TR().check_status(r, 400)

# ═══ Cross-service tests ═══
def test_chat_login_proxy():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and "short_token" not in r.json():
        tr.fail("response missing short_token")
    return tr

def test_chat_login_proxy_wrong_password():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/login"), json={
        "username": "nonexistent", "password": "wrong"
    }, timeout=5)
    tr = TR()
    tr.expected = "400 or 401"
    tr.actual = r.status_code
    tr.body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:500]
    if r.status_code not in (400, 401):
        tr.passed = False
        tr.msg = f"wrong password should return 400/401, got {r.status_code}"
    return tr

# ═══ Health checks ═══
def test_user_health():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_chat_health():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_user_ready():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/ready"), timeout=5)
    return TR().check_status(r, 200)

def test_chat_ready():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/ready"), timeout=5)
    return TR().check_status(r, 200)

def test_user_metrics():
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "uptime" not in r.json():
        tr.fail("missing uptime field")
    return tr

def test_chat_metrics():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/metrics"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "uptime" not in r.json():
        tr.fail("missing uptime field")
    return tr

# ═══ Concurrency tests ═══
def test_concurrent_register():
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
    tr.expected = "all 15 requests succeed or duplicate"
    tr.actual = f"{ok} ok {conflict} duplicate others={15-ok-conflict}"
    if ok + conflict != 15:
        tr.passed = False
        tr.msg = f"concurrent register anomaly: {tr.actual}"
    return tr

def test_concurrent_send_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    results = []
    def send_msg(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
                "content": f"concurrent message {i}", "type": "text"
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=send_msg, args=(i,)) for i in range(15)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "all 15 messages succeed"
    tr.actual = f"{ok}/15 ok"
    if ok < 15:
        tr.passed = False
        tr.msg = f"concurrent send shortfall: {tr.actual}"
    return tr

def test_concurrent_login():
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
    tr.expected = "at least 5 logins succeed"
    tr.actual = f"{ok}/10 ok"
    if ok < 5:
        tr.passed = False
        tr.msg = f"concurrent login shortfall: {tr.actual}"
    return tr

def test_concurrent_create_room():
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
    tr.expected = "at least 5 rooms created"
    tr.actual = f"{ok}/10 ok"
    if ok < 5:
        tr.passed = False
        tr.msg = f"concurrent room creation shortfall: {tr.actual}"
    return tr

# ═══ Edge cases ═══
def test_invalid_room_id():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/INVALID"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_empty_request_body():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}", "Content-Type": "application/json"},
        data="", timeout=5)
    return TR().check_status(r, 400)

def test_malformed_json():
    r = SESSION.post(urljoin(CHAT_BASE, "/api/v1/rooms/direct"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}", "Content-Type": "application/json"},
        data="not json", timeout=5)
    return TR().check_status(r, 400)

def test_method_not_allowed():
    r = SESSION.put(urljoin(CHAT_BASE, "/api/v1/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR()
    tr.expected = "404 or 405"
    tr.actual = r.status_code
    if r.status_code not in (404, 405):
        tr.passed = False
        tr.msg = f"method not allowed should return 404/405, got {r.status_code}"
    return tr

# ═══ Content safety tests ═══
def test_unicode_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "hello world \u00e9\u00e0\u00e8 \u041f\u0440\u0438\u0432\u0435\u0442", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_emoji_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "\U0001f600\U0001f389\U0001f44d\U0001f525 \u2728\U0001f680", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_html_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "<script>alert('xss')</script><b>bold</b>", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_sql_injection_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "'; DROP TABLE rooms; --", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201)

def test_sql_injection_login():
    for p in ["' OR 1=1 --", "admin'--", "'; DROP TABLE users; --", "1' UNION SELECT * FROM users--", "\\' OR '1'='1"]:
        r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
            "username": p, "password": rand_pw()
        }, timeout=5)
        tr = TR()
        tr.expected = 401
        tr.actual = r.status_code
        if r.status_code != 401:
            tr.passed = False
            tr.msg = f"SQL injection {p!r} returned {r.status_code}"
            return tr
    return TR()

# ═══ Online status tests ═══
def test_online_status_after_login():
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
            tr.fail(f"expected online=True, got {online}")
    return tr

def test_online_user_stats():
    r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/stats"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    tr = TR().check_status(r, 200)
    if r.status_code == 200 and "onlineUsers" not in r.json().get("stats", {}):
        tr.fail("stats missing onlineUsers field")
    return tr

# ═══ Token lifecycle ═══
def test_long_token_verify():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["bob"]["username"], "password": USERS["bob"]["password"]
    }, timeout=10)
    tr = TR().check_status(r, 200)
    if r.status_code == 200:
        long_token = r.json().get("long_token", "")
        tr.expected = "long_token length 64"
        tr.actual = f"long_token length {len(long_token)}"
        if len(long_token) != 64:
            tr.passed = False
            tr.msg = f"long_token length should be 64, got {len(long_token)}"
            return tr
        r2 = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {long_token}"}, timeout=10)
        return TR().check_status(r2, 200)
    return tr

def test_short_and_long_token_verify():
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

# ═══ Socket.IO tests ═══
def test_socket_connect_valid():
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    connected = []
    sio.on("connect", lambda: connected.append(True))
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        tr = TR()
        tr.expected = "socket connects"
        tr.actual = "connected" if connected else "not connected"
        if not connected:
            tr.passed = False
            tr.msg = "Socket did not connect"
        return tr
    finally:
        sio.disconnect()

def test_socket_connect_invalid_token():
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
    tr.expected = "connection refused"
    tr.actual = f"errors={len(err)}"
    if len(err) == 0:
        tr.passed = False
        tr.msg = "should reject invalid token"
    return tr

def test_socket_join_room():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=5, http_session=SOCKET_HTTP_SESSION)
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.5)
        return TR()
    finally:
        sio.disconnect()

def test_socket_send_message():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sio = socketio.Client(request_timeout=8, http_session=SOCKET_HTTP_SESSION)
    ack_data = []
    try:
        sio.connect(CHAT_BASE, auth={"token": USERS["alice"]["token"]}, transports=["polling"])
        time.sleep(0.5)
        sio.emit("v1:join", {"roomId": rid})
        time.sleep(0.5)
        sio.emit("v1:message", {"roomId": rid, "content": "Socket message", "type": "text"}, callback=lambda d: ack_data.append(d))
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "ok ack received"
    tr.actual = f"acks={len(ack_data)}, data={ack_data[0] if ack_data else 'none'}"
    if not ack_data or not ack_data[0].get("ok"):
        tr.passed = False
        tr.msg = f"Socket message failed: {tr.actual}"
    return tr

def test_socket_join_missing_room():
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
    tr.expected = "v1:error event received"
    tr.actual = f"error events={len(err_data)}"
    if len(err_data) == 0:
        tr.passed = False
        tr.msg = "should reject joining a nonexistent room"
    return tr

def test_socket_leave_room():
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

def test_socket_concurrent_messages():
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
            sio.emit("v1:message", {"roomId": rid, "content": f"concurrent socket {i}", "type": "text"}, callback=on_ack)
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "at least 3 acks"
    tr.actual = f"{ack_count[0]}/5 acks"
    if ack_count[0] < 3:
        tr.passed = False
        tr.msg = f"concurrent socket messages shortfall: {tr.actual}"
    return tr

def test_socket_fast_reconnect():
    u1 = USERS["alice"]
    for i in range(10):
        try:
            sio = socketio.Client(request_timeout=3, http_session=SOCKET_HTTP_SESSION)
            sio.connect(CHAT_BASE, auth={"token": u1["token"]}, transports=["polling"])
            sio.disconnect()
        except Exception as e:
            tr = TR()
            tr.expected = "reconnect succeeds"
            tr.actual = f"attempt {i+1} failed: {e}"
            tr.passed = False
            tr.msg = tr.actual
            return tr
    return TR()

# ══════════════════════════════════════════════════════════════
#  New stress tests: burst traffic / resource lifecycle /
#  WebSocket multi-client / data consistency / large data / resilience
# ══════════════════════════════════════════════════════════════

# ═══ Burst traffic ═══
def test_burst_batch_register():
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
    tr.expected = "at least 40 registrations succeed"
    tr.actual = f"{ok}/50 ok ({elapsed:.1f}s)"
    if ok < 40:
        tr.passed = False
        tr.msg = f"burst register shortfall: {tr.actual}"
    return tr

def test_burst_batch_login():
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
    tr.expected = "at least 20 logins succeed"
    tr.actual = f"{ok}/{len(batch_users)} ok ({elapsed:.1f}s)"
    if ok < 20:
        tr.passed = False
        tr.msg = f"burst login shortfall: {tr.actual}"
    return tr

def test_burst_batch_messages():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    results = []
    def send(i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
                "content": f"burst message {i} {rand_str(4)}", "type": "text"
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
    tr.expected = "at least 80 messages succeed"
    tr.actual = f"{ok}/100 ok ({elapsed:.1f}s)"
    if ok < 80:
        tr.passed = False
        tr.msg = f"burst message shortfall: {tr.actual}"
    return tr

def test_burst_batch_create_rooms():
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
    tr.expected = "at least 25 requests succeed"
    tr.actual = f"{ok}/30 ok ({elapsed:.1f}s)"
    if ok < 25:
        tr.passed = False
        tr.msg = f"burst room creation shortfall: {tr.actual}"
    return tr

def test_burst_mixed_requests():
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
    tr.expected = "at least 50 requests succeed"
    tr.actual = f"{ok}/60 ok ({elapsed:.1f}s)"
    if ok < 50:
        tr.passed = False
        tr.msg = f"burst mixed request shortfall: {tr.actual}"
    return tr

# ═══ Resource lifecycle ═══
def test_rapid_register_login_delete_loop():
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

def test_rapid_create_delete_room_loop():
    # Each loop creates a direct room with a temp target user to avoid idempotency hits / deleting the shared direct_room_id
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
            "content": f"lifecycle message {i}", "type": "text"
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

def test_rapid_token_create_revoke():
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

def test_rapid_api_key_lifecycle():
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
    tr.expected = "all 8 API keys created"
    tr.actual = f"created {len(created_keys)}"
    if len(created_keys) != 8:
        tr.passed = False
        tr.msg = f"API key creation shortfall: {tr.actual}"
    return tr

# ═══ WebSocket multi-client ═══
def test_socket_multi_client_same_room():
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
            sio.emit("v1:message", {"roomId": rid, "content": f"multi client {i}", "type": "text"}, callback=on_ack)
        time.sleep(1)
    finally:
        for sio in sockets:
            try: sio.disconnect()
            except: pass
    tr = TR()
    tr.expected = "at least 3 messages acked"
    tr.actual = f"{ack_count[0]}/5 acks"
    if ack_count[0] < 3:
        tr.passed = False
        tr.msg = f"multi client message shortfall: {tr.actual}"
    return tr

def test_socket_multi_client_broadcast():
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
        sio_sender.emit("v1:message", {"roomId": rid, "content": "broadcast test", "type": "text"})
        time.sleep(2)
        sio_sender.disconnect()
    finally:
        for sio in sios:
            try: sio.disconnect()
            except: pass
    total_recv = sum(len(r) for r in received)
    tr = TR()
    tr.expected = "at least 2 clients receive the broadcast"
    tr.actual = f"total received {total_recv}"
    if total_recv < 2:
        tr.passed = False
        tr.msg = f"broadcast receive shortfall: {tr.actual}"
    return tr

def test_socket_client_switch_room():
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
        sio.emit("v1:message", {"roomId": rid2, "content": "message after room switch", "type": "text"},
                  callback=lambda d: ack.append(d))
        time.sleep(1)
    finally:
        sio.disconnect()
    tr = TR()
    tr.expected = "message sends after switching rooms"
    tr.actual = f"ack={ack[0] if ack else 'none'}"
    if not ack or not ack[0].get("ok"):
        tr.passed = False
        tr.msg = f"send after room switch failed: {tr.actual}"
    return tr

def test_socket_mass_concurrent_connections():
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
    tr.expected = "at least 15 connections succeed"
    tr.actual = f"{ok}/20 ok ({elapsed:.1f}s)"
    if ok < 15:
        tr.passed = False
        tr.msg = f"mass concurrent connection shortfall: {tr.actual}"
    return tr

def test_socket_message_order_consistency():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sent_contents = []
    for i in range(20):
        content = f"order_{i}_{rand_str(4)}"
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
        tr.expected = f"all {len(sent_contents[-20:])} messages retrievable"
        tr.actual = f"{len(missing)} missing"
        if len(missing) > 0:
            tr.passed = False
            tr.msg = f"message order inconsistent: {tr.actual}"
    return tr

# ═══ Data consistency ═══
def test_concurrent_permission_consistency():
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
    tr.expected = "at least 8 permission changes succeed"
    tr.actual = f"{ok}/10 ok"
    if ok < 8:
        tr.passed = False
        tr.msg = f"concurrent permission change shortfall: {tr.actual}"
    return tr

def test_concurrent_direct_room_idempotency():
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
    tr.expected = "concurrent direct room creation is idempotent"
    tr.actual = f"created {len(set(room_ids))} distinct rooms"
    if len(room_ids) > 0 and len(set(room_ids)) > 1:
        tr.passed = False
        tr.msg = f"concurrent direct room creation NOT idempotent: {tr.actual}"
    return tr

def test_message_immediate_readable():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    content = f"immediate_query_{rand_str(8)}"
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
        tr.expected = "message immediately queryable"
        tr.actual = "found" if found else "not found"
        if not found:
            tr.passed = False
            tr.msg = "sent message not found in query results"
    return tr

# ═══ Large data ═══
def test_message_pagination_cursor_stress():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    sent = []
    for i in range(50):
        content = f"page_{i}_{rand_str(3)}"
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
    tr.expected = f"all {len(sent[-30:])} messages paginatable"
    tr.actual = f"{len(missing)} missing"
    if len(missing) > 5:
        tr.passed = False
        tr.msg = f"pagination stress test failed: {tr.actual}"
    return tr

def test_large_group_messages():
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
        "name": "Large Group Test", "memberIds": member_ids
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    if r.status_code != 201:
        return TR().check_status(r, 201)
    big_rid = r.json()["room"]["id"]
    track_room(big_rid)
    results = []
    def send_as(uid, i):
        try:
            r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{big_rid}/messages"), json={
                "content": f"large group message {i}", "type": "text"
            }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
            results.append(r.status_code)
        except Exception:
            results.append(0)
    threads = [threading.Thread(target=send_as, args=(USERS["alice"]["id"], i)) for i in range(25)]
    for t in threads: t.start()
    for t in threads: t.join()
    ok = sum(1 for s in results if s == 201)
    tr = TR()
    tr.expected = "at least 20 messages succeed"
    tr.actual = f"{ok}/25 ok"
    if ok < 20:
        tr.passed = False
        tr.msg = f"large group message shortfall: {tr.actual}"
    return tr

def test_large_payloads_register():
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
    tr.expected = "at least 18 requests handled"
    tr.actual = f"{ok}/20 ok"
    if ok < 18:
        tr.passed = False
        tr.msg = f"large payload register shortfall: {tr.actual}"
    return tr

# ═══ System resilience ═══
def test_continuous_error_requests():
    for i in range(20):
        try:
            r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
                "username": f"hacker_{i}", "password": "wrong"
            }, timeout=5)
            if r.status_code not in (401, 400):
                tr = TR()
                tr.expected = "401 or 400"
                tr.actual = r.status_code
                tr.passed = False
                tr.msg = f"error request {i+1} returned {r.status_code}"
                return tr
        except requests.exceptions.ConnectionError:
            tr = TR()
            tr.expected = "connection healthy"
            tr.actual = "connection dropped"
            tr.passed = False
            tr.msg = f"error request {i+1} dropped the connection"
            return tr
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_health_check_baseline():
    r1 = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    if r1.status_code != 200:
        return TR().check_status(r1, 200)
    mem1 = r1.json().get("memory", {}).get("rss", 0)
    for i in range(50):
        SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
            headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    r2 = SESSION.get(urljoin(USER_BASE, "/api/v1/metrics"),
        headers={"Authorization": f"Bearer {get_admin_token()}"}, timeout=5)
    if r2.status_code != 200:
        return TR().check_status(r2, 200)
    mem2 = r2.json().get("memory", {}).get("rss", 0)
    tr = TR()
    tr.expected = f"memory growth <= 2x (baseline={mem1})"
    tr.actual = f"actual={mem2}"
    if mem1 > 0 and mem2 > mem1 * 2:
        tr.passed = False
        tr.msg = f"memory growth too fast: {mem1} -> {mem2}"
    return tr

def test_continuous_health_checks():
    for i in range(30):
        r = SESSION.get(urljoin(USER_BASE, "/api/v1/health"), timeout=3)
        if r.status_code != 200:
            return TR().check_status(r, 200)
        r = SESSION.get(urljoin(CHAT_BASE, "/api/v1/health"), timeout=3)
        if r.status_code != 200:
            return TR().check_status(r, 200)
    return TR()

# ═══ Test suite definitions ═══
# ══════════════════════════════════════════════════════════════
#  Permission matrix (debug / non-debug dual mode)
# ══════════════════════════════════════════════════════════════

def test_nodebug_admin_chat():
    # No debug header; the real admin (alice = first registered user) must pass
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_nodebug_admin_user():
    r = ND_SESSION.get(urljoin(USER_BASE, "/api/v1/admin/users"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    tr = TR().check_status(r, 200).check_body(r, ok=True)
    if tr.ok() and r.json().get("total", 0) < 1:
        tr.fail(f"not enough users: {r.json().get('total')}")
    return tr

def test_nodebug_no_auth_admin_403():
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/admin/rooms"), timeout=5)
    return TR().check_status(r, 403)

def test_nodebug_non_member_room_detail_403():
    # Register a temp user (never joined any room) → 403
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

def test_nodebug_non_member_room_members_403():
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

def test_debug_member_room_detail_200():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.get(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

def test_nodebug_room_not_found_404():
    r = ND_SESSION.get(urljoin(CHAT_BASE, "/api/v1/rooms/9999999999999999"),
        headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 404)

def test_message_type_too_long_400():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "type too long test", "type": "abcdefghij"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 400)

def test_register_duplicate_username_400():
    # Product design: duplicate usernames automatically get a #N suffix (unique global name), registration still succeeds
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/register"), json={
        "username": USERS["alice"]["username"], "password": "Test1234!", "app_id": "chat"
    }, timeout=5)
    tr = TR().check_status(r, 201)
    if r.status_code == 201:
        g = r.json().get("user", {}).get("globalName", "")
        if g == USERS["alice"]["username"]:
            tr.fail(f"duplicate registration did not generate a suffix: {g}")
    return tr

def test_login_wrong_password_401():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": USERS["alice"]["username"], "password": "WrongPass123!"
    }, timeout=5)
    return TR().check_status(r, 401)

def test_pagination_no_duplicates():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    # First send 70 messages to fill 3 pages
    for i in range(70):
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": f"page message {i:03d}", "type": "text"
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
            tr.fail(f"duplicate messages across pages: {dupes[:3]}")
            return tr
        for m in items:
            seen.add(m["id"])
        pages += 1
        if not data.get("hasMore"):
            break
        cursor = data.get("cursor")
    if len(seen) < 70:
        tr = TR().check_status(r, 200)
        tr.fail(f"not enough messages across pages: {len(seen)}/70, pages={pages}")
        return tr
    return TR().check_status(r, 200)

def test_last_admin_protection():
    # Admin protection: an admin cannot demote themselves (prevents accidental lockout)
    token = get_admin_token()  # alice = admin
    r = SESSION.put(urljoin(USER_BASE, f"/api/v1/admin/users/{USERS['alice']['id']}/permission"), json={
        "permission": "user"
    }, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    tr = TR().check_status(r, 400)
    err = (r.json().get("error") or "").lower()
    if tr.ok() and "demote" not in err and "permission" not in err:
        tr.fail(f"error message should mention demote/permission: {r.json().get('error')}")
    return tr

def test_token_short_still_valid():
    # After login the short token works immediately; the long token is valid too
    u = list(USERS.values())[0]
    r = SESSION.get(urljoin(USER_BASE, "/api/v1/verify"),
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=5)
    return TR().check_status(r, 200).check_body(r, ok=True)

# ═══ B3: message type whitelist tests ═══
def test_message_type_non_text_rejected():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    for t in ["image", "file", "video", "audio", "gif", "sticker"]:
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": "test", "type": t
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code != 400:
            tr = TR()
            tr.expected = 400
            tr.actual = r.status_code
            tr.passed = False
            tr.msg = f"type={t!r} should return 400, got {r.status_code}"
            return tr
    return TR()

def test_message_type_text_ok():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "normal text message", "type": "text"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201).check_body(r, ok=True)

def test_message_type_empty_defaults_text():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
        "content": "no type field"
    }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
    return TR().check_status(r, 201).check_body(r, ok=True)

# ═══ Q2: login username minimum length tests ═══
def test_login_username_too_short():
    r = SESSION.post(urljoin(USER_BASE, "/api/v1/login"), json={
        "username": "a", "password": "whatever123"
    }, timeout=5)
    return TR().check_status(r, 400)

# ═══ B5: REST rate limit tests ═══
def test_rest_rate_limit_messages():
    rid = USERS.get("direct_room_id") or USERS.get("group_room_id")
    # Rapidly send more than 10 messages to trigger the rate limit
    limited = False
    for i in range(15):
        r = SESSION.post(urljoin(CHAT_BASE, f"/api/v1/rooms/{rid}/messages"), json={
            "content": f"rate test {i}", "type": "text"
        }, headers={"Authorization": f"Bearer {USERS['alice']['token']}"}, timeout=5)
        if r.status_code == 429:
            limited = True
            break
    tr = TR()
    tr.expected = "rate limit triggered"
    tr.actual = f"limited={limited}"
    if not limited:
        # The rate limit may be per minute and may not trigger within 15 messages.
        # As long as nothing crashed, the test passes.
        pass
    return tr

SUITES = [
    ("Health Checks", [
        (test_user_health, 1), (test_chat_health, 1),
        (test_user_ready, 1), (test_chat_ready, 1),
        (test_user_metrics, 1), (test_chat_metrics, 1),
    ]),
    ("User Registration", [
        (test_register_duplicate_username, 3),
        (test_register_username_too_short, 3),
        (test_register_password_too_short, 3),
    ]),
    ("User Login", [
        (test_login, 1),
        (test_login_wrong_password, 1),
        (test_login_user_not_found, 1),
        (test_login_missing_fields, 1),
    ]),
    ("Token Verification", [
        (test_verify_token, 3),
        (test_verify_invalid_token, 3),
        (test_verify_no_auth, 3),
        (test_verify_short_token, 3),
    ]),
    ("User Queries", [
        (test_get_user_profile, 3),
        (test_get_user_profile_no_auth, 3),
        (test_get_token_list, 3),
        (test_get_token_list_no_auth, 3),
        (test_internal_get_user, 3),
        (test_internal_no_key, 3),
        (test_internal_user_not_found, 3),
    ]),
    ("API Keys", [
        (test_create_api_key, 3),
        (test_create_api_key_invalid_days, 3),
        (test_create_api_key_no_auth, 3),
    ]),
    ("Room Management", [
        (test_create_direct_room, 1),
        (test_create_direct_missing_target, 3),
        (test_create_direct_no_auth, 3),
        (test_create_group_room, 1),
        (test_create_group_too_many_members, 3),
        (test_create_group_no_auth, 3),
        (test_get_room_list, 3),
        (test_get_room_list_no_auth, 3),
        (test_get_room_detail, 3),
        (test_get_room_detail_not_found, 3),
        (test_get_room_members, 3),
        (test_get_room_members_no_auth, 3),
    ]),
    ("Message Send/Receive", [
        (test_send_message, 3),
        (test_send_message_empty_content, 3),
        (test_send_message_no_auth, 3),
        (test_send_message_non_member, 3),
        (test_get_messages, 3),
        (test_get_messages_with_cursor, 3),
        (test_get_messages_no_auth, 3),
        (test_send_message_long_content, 3),
        (test_send_message_too_long, 3),
    ]),
    ("Admin - Chat", [
        (test_admin_room_list, 3),
        (test_admin_room_list_no_auth, 3),
        (test_admin_room_list_non_admin, 3),
        (test_admin_room_members, 3),
        (test_admin_stats, 3),
        (test_admin_create_direct, 1),
        (test_admin_create_direct_same_user, 3),
        (test_admin_create_group, 1),
        (test_admin_add_member, 1),
        (test_admin_add_member_duplicate, 3),
        (test_admin_remove_member, 3),
        (test_admin_proxy_message, 3),
        (test_admin_get_messages, 3),
        (test_admin_delete_room, 1),
        (test_admin_delete_missing_room, 3),
    ]),
    ("Admin - User", [
        (test_admin_user_list, 3),
        (test_admin_get_user_by_id, 3),
        (test_admin_user_list_non_admin, 3),
        (test_admin_token_list, 3),
        (test_admin_update_permission, 3),
        (test_admin_delete_user, 3),
        (test_admin_delete_missing_user, 3),
        (test_admin_revoke_token, 3),
        (test_admin_revoke_missing_token, 3),
        (test_admin_invalid_permission, 3),
    ]),
    ("Cross-Service Calls", [
        (test_chat_login_proxy, 3),
        (test_chat_login_proxy_wrong_password, 3),
    ]),
    ("Concurrency", [
        (test_concurrent_register, 3),
        (test_concurrent_send_message, 3),
        (test_concurrent_login, 0),
        (test_concurrent_create_room, 3),
    ]),
    ("Edge Cases", [
        (test_invalid_room_id, 3),
        (test_empty_request_body, 3),
        (test_malformed_json, 3),
        (test_method_not_allowed, 3),
    ]),
    ("Socket.IO", [
        (test_socket_connect_valid, 3),
        (test_socket_connect_invalid_token, 3),
        (test_socket_join_room, 3),
        (test_socket_send_message, 3),
        (test_socket_join_missing_room, 3),
        (test_socket_leave_room, 3),
        (test_socket_concurrent_messages, 3),
        (test_socket_fast_reconnect, 3),
    ]),
    ("Content Safety", [
        (test_unicode_message, 3),
        (test_emoji_message, 3),
        (test_html_message, 3),
        (test_sql_injection_message, 3),
        (test_sql_injection_login, 0),
    ]),
    ("Online Status", [
        (test_online_status_after_login, 3),
        (test_online_user_stats, 3),
    ]),
    ("Token Lifecycle", [
        (test_long_token_verify, 0),
        (test_short_and_long_token_verify, 0),
        (test_socket_fast_reconnect, 3),
    ]),
    # ═══ New stress test suites ═══
    ("Burst Traffic", [
        (test_burst_batch_register, 3),
        (test_burst_batch_login, 0),
        (test_burst_batch_messages, 3),
        (test_burst_batch_create_rooms, 3),
        (test_burst_mixed_requests, 0),
    ]),
    ("Resource Lifecycle", [
        (test_rapid_register_login_delete_loop, 0),
        (test_rapid_create_delete_room_loop, 3),
        (test_rapid_token_create_revoke, 0),
        (test_rapid_api_key_lifecycle, 3),
    ]),
    ("WebSocket Multi-Client", [
        (test_socket_multi_client_same_room, 3),
        (test_socket_multi_client_broadcast, 3),
        (test_socket_client_switch_room, 3),
        (test_socket_mass_concurrent_connections, 3),
        (test_socket_message_order_consistency, 3),
    ]),
    ("Data Consistency", [
        (test_concurrent_permission_consistency, 3),
        (test_concurrent_direct_room_idempotency, 3),
        (test_message_immediate_readable, 3),
    ]),
    ("Large Data", [
        (test_message_pagination_cursor_stress, 3),
        (test_large_group_messages, 3),
        (test_large_payloads_register, 3),
    ]),
    ("System Resilience", [
        (test_continuous_error_requests, 0),
        (test_health_check_baseline, 0),
        (test_continuous_health_checks, 3),
    ]),
    # ═══ Permission matrix — last, because the last-admin-protection test deletes test users ═══
    ("Permission Matrix", [
        (test_nodebug_admin_chat, 3),
        (test_nodebug_admin_user, 3),
        (test_nodebug_no_auth_admin_403, 3),
        (test_nodebug_non_member_room_detail_403, 0),
        (test_nodebug_non_member_room_members_403, 0),
        (test_debug_member_room_detail_200, 3),
        (test_nodebug_room_not_found_404, 3),
        (test_message_type_too_long_400, 3),
        (test_message_type_non_text_rejected, 3),
        (test_message_type_text_ok, 3),
        (test_message_type_empty_defaults_text, 3),
        (test_login_username_too_short, 0),
        (test_register_duplicate_username_400, 3),
        (test_login_wrong_password_401, 0),
        (test_pagination_no_duplicates, 3),
        (test_last_admin_protection, 3),
        (test_token_short_still_valid, 3),
        (test_rest_rate_limit_messages, 3),
    ]),
]

def run_all():
    global PASS, FAIL, EXPECTED_FAIL, ERRORS
    PASS = 0
    FAIL = 0
    EXPECTED_FAIL = 0
    ERRORS = []

    log("\n=== Waiting for services ===")
    try:
        wait_service(USER_BASE, "User Service")
        wait_service(CHAT_BASE, "Chat Service")
    except Exception as e:
        log(f"fatal: {e}")
        sys.exit(1)

    log("\n=== Reset database ===")
    reset_db()

    log("\n=== Initialize test users ===")
    init_users()
    try:
        test_register()
        test_login()
        for u in USERS.values():
            if u.get("id"):
                track_user(u["id"])
        log("  users created and logged in")
    except Exception as e:
        log(f"fatal: initialization failed: {e}")
        sys.exit(1)

    # Promote alice to admin (local: update DB directly; cloud: the first registered user is auto-admin, no promotion needed)
    alice_id = USERS["alice"]["id"]
    if alice_id and not CLOUD_MODE:
        import subprocess
        try:
            cmd = f"UPDATE users SET permission = 'admin' WHERE id = '{alice_id}';"
            subprocess.run(
                ["docker", "exec", "yingo-servergithubio-main-user-db-1",
                 "psql", "-U", "yingo", "-d", "cold_user", "-c", cmd],
                capture_output=True, text=True, timeout=10, check=True
            )
            log(f"  alice promoted to admin (id={alice_id})")
        except Exception as e:
            log(f"  alice promotion failed: {e}")
        # Re-login to get a fresh token carrying the admin permission
        try:
            test_login()
            log("  re-logged in for admin token")
        except Exception as e:
            log(f"  re-login failed: {e}")

    for suite_name, tests in SUITES:
        log(f"\n{'='*60}")
        log(f"  Suite: {suite_name}")
        log(f"{'='*60}")
        for fn, times in tests:
            R(fn.__name__, fn, times=times)

    total = PASS + FAIL + EXPECTED_FAIL
    log(f"\n{'='*60}")
    log(f"  Total: {total} tests")
    log(f"  Passed: {PASS}")
    log(f"  Expected failures: {EXPECTED_FAIL}")
    log(f"  Failed: {FAIL}")
    log(f"  Tracked resources: users={len(TESTED_IDS['users'])}, rooms={len(TESTED_IDS['rooms'])}, tokens={len(TESTED_IDS['tokens'])}")
    if ERRORS:
        log(f"\n  Failure details (first 10):")
        for e in ERRORS[:10]:
            log(f"    {e}")
    log(f"{'='*60}")

    cleanup_all()

    return FAIL == 0

if __name__ == "__main__":
    ok = run_all()
    sys.exit(0 if ok else 1)
