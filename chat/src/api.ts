import pino from "pino";
import type { AuthResult } from "./types.js";
import { createClient } from "./redis.js";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-api" });

const USER_SVC = (process.env.USER_SERVICE_URL || "http://localhost:9000").trim().replace(/\/+$/, "");
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_KEY) throw new Error("INTERNAL_API_KEY env var is required");
const CACHE_TTL = 300_000;

const redis = createClient();

// ═══ 滑动窗口速率限制（基于 Redis INCR）═══
// 返回 true = 允许, false = 超限
export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / 1000 / windowSec)}`;
    const prevKey = `${key}:${Math.floor(now / 1000 / windowSec) - 1}`;

    const [currCount, prevCount] = await Promise.all([
      redis.get(windowKey),
      redis.get(prevKey),
    ]);

    const curr = parseInt(currCount || "0", 10);
    const prev = parseInt(prevCount || "0", 10);

    // 加权：上一个窗口的剩余比例 + 当前窗口计数
    const elapsed = (now / 1000) % windowSec;
    const weight = 1 - elapsed / windowSec;
    const total = prev * weight + curr;

    if (total >= limit) return false;

    const pipe = redis.pipeline();
    pipe.incr(windowKey);
    pipe.expire(windowKey, windowSec * 2);
    await pipe.exec();
    return true;
  } catch (e) {
    // Redis 不可用时拒绝请求（fail-closed）
    log.warn({ err: e }, "Rate limit check failed, denying request");
    return false;
  }
}

export async function secureFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

// ═══ verifyToken: 带重试 + 单飞 + 短缓存（避免每个 socket 连接都查 user 服务）═══
const inflight = new Map<string, Promise<AuthResult | null>>();
const verifyCache = new Map<string, { result: AuthResult | null; ts: number }>();
const VERIFY_CACHE_TTL = 30_000;

export function verifyToken(token: string): Promise<AuthResult | null> {
  if (!token) return Promise.resolve(null);
  const cached = verifyCache.get(token);
  if (cached && Date.now() - cached.ts < VERIFY_CACHE_TTL) return Promise.resolve(cached.result);
  const existing = inflight.get(token);
  if (existing) return existing;
  const p = doVerifyToken(token).finally(() => { inflight.delete(token); });
  inflight.set(token, p);
  return p;
}

async function doVerifyToken(token: string): Promise<AuthResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await secureFetch(`${USER_SVC}/api/v1/verify`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      } as any);
      clearTimeout(timeout);
      if (!r.ok) { verifyCache.set(token, { result: null, ts: Date.now() }); return null; }
      const d = await r.json() as any;
      const result = d.ok ? { userId: d.user_id, scopes: d.scopes, permission: d.permission || "user" } : null;
      verifyCache.set(token, { result, ts: Date.now() });
      if (verifyCache.size > 10000) {
        const oldest = verifyCache.keys().next().value;
        if (oldest) verifyCache.delete(oldest);
      }
      return result;
    } catch (e: any) {
      if (attempt === 0) {
        log.warn({ attempt, err: e.message }, "verifyToken failed, retrying");
        await new Promise(r => setTimeout(r, 100));
      } else {
        log.error({ err: e.message }, "verifyToken failed after retry");
      }
    }
  }
  verifyCache.set(token, { result: null, ts: Date.now() });
  return null;
}

// ═══ fetchUser: 带缓存+重试 ═══
const userCache = new Map<string, { user: any; ts: number }>();

export async function fetchUser(userId: string): Promise<any> {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.user;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await secureFetch(`${USER_SVC}/api/v1/internal/user/${userId}`, {
        headers: { "x-internal-key": INTERNAL_KEY },
        signal: controller.signal,
      } as any);
      clearTimeout(timeout);
      if (!r.ok) return null;
      const d = await r.json() as any;
      if (!d.ok) return null;
      const user = { id: d.id, global_name: d.name, app_names: d.app_names };
      userCache.set(userId, { user, ts: Date.now() });
      if (userCache.size > 1000) {
        const oldest = userCache.keys().next().value ?? "";
        userCache.delete(oldest);
      }
      return user;
    } catch (e: any) {
      if (attempt === 0) {
        log.warn({ attempt, userId, err: e.message }, "fetchUser failed, retrying");
        await new Promise(r => setTimeout(r, 100));
      } else {
        log.error({ userId, err: e.message }, "fetchUser failed after retry");
      }
    }
  }
  return null;
}

// ═══ searchUsers: 代理到 user service ═══
export async function searchUsers(token: string, query: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await secureFetch(`${USER_SVC}/api/v1/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      } as any);
      clearTimeout(timeout);
      return await r.json();
    } catch (e: any) {
      if (attempt === 0) {
        log.warn({ attempt, err: e.message }, "searchUsers failed, retrying");
        await new Promise(r => setTimeout(r, 100));
      } else {
        log.error({ err: e.message }, "searchUsers failed after retry");
      }
    }
  }
  return { ok: false, error: "user service unreachable" };
}
