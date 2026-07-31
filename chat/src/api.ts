import pino from "pino";
import type { AuthResult } from "./types.js";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-api" });

const USER_SVC = (process.env.USER_SERVICE_URL || "http://localhost:9000").trim().replace(/\/+$/, "");
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || "dev-internal-key-change-in-production";
const CACHE_TTL = 300_000;

const isHttps = USER_SVC.startsWith("https");

let insecureDispatcher: any = undefined;
if (isHttps) {
  try {
    const { Agent } = await import("undici");
    insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    log.info("Loaded undici Agent for insecure HTTPS");
  } catch (e: any) {
    log.warn({ err: e.message }, "Failed to load undici Agent, falling back to default fetch");
  }
}

export async function secureFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!isHttps || !insecureDispatcher) return fetch(url, init);
  return fetch(url, { ...init, dispatcher: insecureDispatcher } as any);
}

// ═══ verifyToken: 带重试 + 单飞（同一 token 并发只查一次，避免击穿 user 服务）═══
const inflight = new Map<string, Promise<AuthResult | null>>();

export function verifyToken(token: string): Promise<AuthResult | null> {
  if (!token) return Promise.resolve(null);
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
      if (!r.ok) return null;
      const d = await r.json() as any;
      return d.ok ? { userId: d.user_id, scopes: d.scopes, permission: d.permission || "user" } : null;
    } catch (e: any) {
      if (attempt === 0) {
        log.warn({ attempt, err: e.message }, "verifyToken failed, retrying");
        await new Promise(r => setTimeout(r, 100));
      } else {
        log.error({ err: e.message }, "verifyToken failed after retry");
      }
    }
  }
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
