import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { eq, sql, and, ne } from "drizzle-orm";
import { db } from "./db.js";
import { users, tokens } from "./schema.js";
import { registerUser, loginUser, verifyToken, createApiKey, getUserById, getUserTokens, deleteUser, revokeToken, updateUserPermission, invalidateTokenCache } from "./core.js";
import { apiKeys } from "./schema.js";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "user-routes" });

// ═══ Login rate limiting (configurable via env vars) ═══
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = parseInt(process.env.LOGIN_RATE_LIMIT || "30", 10);
const LOGIN_RATE_WINDOW = parseInt(process.env.LOGIN_RATE_WINDOW || "60000", 10);

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
    return true;
  }
  entry.count++;
  if (entry.count > LOGIN_RATE_LIMIT) return false;
  return true;
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 300_000);

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function requireString(body: any, field: string, min: number, max: number): string {
  if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
  if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} characters`);
  return body[field];
}

async function requireAdmin(req: any): Promise<{ userId: string; permission: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = await verifyToken(auth.slice(7));
  if (!payload || payload.permission !== "admin") return null;
  return { userId: payload.userId, permission: payload.permission };
}

// Is the target user the last admin left in the system?
async function isLastAdmin(targetId: string): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    .where(and(eq(users.permission, "admin"), ne(users.id, targetId)));
  return Number(count) === 0;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ═══ Register ═══
  app.post("/api/v1/register", async (req, reply) => {
    try {
      const { username, password, app_id } = req.body as any;
      const u = requireString(req.body, "username", 2, 20);
      const p = requireString(req.body, "password", 8, 128);
      const user = await registerUser(u, p, app_id || "chat");
      return reply.status(201).send({ ok: true, user });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // Validation errors from requireString / registerUser -> 400; anything else (DB failure etc.) -> 500
      const isValidation = /^(username|password) (must be|already taken)/.test(msg);
      return reply.status(isValidation ? 400 : 500).send({ ok: false, error: isValidation ? msg : "registration failed, please try again later" });
    }
  });

  // ═══ Login ═══
  app.post("/api/v1/login", async (req, reply) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
      if (!checkLoginRateLimit(ip)) {
        return reply.status(429).send({ ok: false, error: "too many login attempts, please try again later" });
      }
      const { username, password } = req.body as any;
      requireString(req.body, "username", 2, 64);
      requireString(req.body, "password", 1, 128);
      const result = await loginUser(username, password);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // Credential errors (wrong password / user not found / missing fields) -> 401; anything else -> 500
      const isCredential = msg === "invalid username or password" || /^(username|password) must be/.test(msg);
      return reply.status(isCredential ? 401 : 500).send({ ok: false, error: isCredential ? msg : "login failed, please try again later" });
    }
  });

  // ═══ Verify Token ═══
  app.get("/api/v1/verify", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const token = auth.slice(7);
    const payload = await verifyToken(token);
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    return reply.send({ ok: true, user_id: payload.userId, scopes: payload.scopes, permission: payload.permission });
  });

  // Search users by globalName (fuzzy match)
  app.get("/api/v1/users/search", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const query = String((req.query as any).query || "").trim();
    if (query.length < 1) return reply.send({ ok: true, users: [] });
    try {
      const rows = await db.select({
        id: users.id, globalName: users.globalName, appNames: users.appNames,
      }).from(users)
        .where(sql`${users.globalName} LIKE ${"%" + query.replace(/%/g, "\\%") + "%"} ESCAPE '\\'`)
        .limit(20);
      return reply.send({ ok: true, users: rows });
    } catch (e: any) {
      log.error({ err: e }, "searchUsers failed");
      return reply.status(500).send({ ok: false, error: "search failed" });
    }
  });

  // ═══ Get user by ID (internal, requires Internal API Key) ═══
  app.get("/api/v1/internal/user/:id", async (req, reply) => {
    const internalKey = String(req.headers["x-internal-key"] || "");
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (!internalKey || !expectedKey || !safeCompare(internalKey, expectedKey))
      return reply.status(403).send({ ok: false, error: "forbidden" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const [u] = await db.select({ id: users.id, globalName: users.globalName, appNames: users.appNames })
      .from(users).where(eq(users.id, id)).limit(1);
    if (!u) return reply.status(404).send({ ok: false });
    return reply.send({ ok: true, id: u.id, name: u.globalName, app_names: u.appNames });
  });

  // ═══ Create API Key ═══
  app.post("/api/v1/api-keys", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    try {
      const { name, scopes, expires_days } = req.body as any;
      if (!name || typeof name !== "string") throw new Error("name is required");
      if (!Array.isArray(scopes)) throw new Error("scopes must be an array");
      if (typeof expires_days !== "number") throw new Error("expires_days must be a number");
      const key = await createApiKey(payload.userId, name, scopes, expires_days);
      return reply.status(201).send({ ok: true, ...key });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // Business validation errors -> 400; anything else (DB failure etc.) -> 500
      const isBusiness = /^(user not found|name must be|scopes must be|expiry must be|name is required|expires_days must be)/.test(msg);
      return reply.status(isBusiness ? 400 : 500).send({ ok: false, error: isBusiness ? msg : "failed to create API key, please try again later" });
    }
  });

  // ═══ Get current user profile ═══
  app.get("/api/v1/users/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const user = await getUserById(payload.userId);
    if (!user) return reply.status(404).send({ ok: false, error: "user not found" });
    return reply.send({ ok: true, user });
  });

  // ═══ Get a user's profile by ID (authenticated users only, public fields) ═══
  app.get("/api/v1/users/:id", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const user = await getUserById(id);
    if (!user) return reply.status(404).send({ ok: false, error: "user not found" });
    return reply.send({ ok: true, user });
  });

  // ═══ Get current user token list ═══
  app.get("/api/v1/tokens/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const tokenList = await getUserTokens(payload.userId);
    return reply.send({ ok: true, tokens: tokenList, total: tokenList.length });
  });

  // ═══ Health check (liveness) ═══
  app.get("/api/v1/health", async () => ({ ok: true, service: "user-v1", uptime: process.uptime() }));

  // ═══ Readiness check ═══
  app.get("/api/v1/ready", async () => {
    let dbOk = false;
    try { await db.execute(sql`SELECT 1`); dbOk = true; } catch {}
    return { ok: dbOk, service: "user-v1", db: dbOk ? "ok" : "error" };
  });

  // ═══ Metrics (admin only) ═══
  app.get("/api/v1/metrics", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    };
  });

  // ═══ Admin: Get user by ID ═══
  app.get("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid user ID" });
    try {
      const rows = await db.select({
        id: users.id, globalName: users.globalName, appNames: users.appNames,
        permission: users.permission, online: users.online,
        createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
      }).from(users).where(eq(users.id, id)).limit(1);
      if (!rows.length) return reply.status(404).send({ ok: false, error: "user not found" });
      return reply.send({ ok: true, user: rows[0] });
    } catch (e: any) { log.error({ err: e }, "admin getUser failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // ═══ Admin: User list ═══
  app.get("/api/v1/admin/users", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    try {
      const rows = await db.select({
        id: users.id, globalName: users.globalName, appNames: users.appNames,
        permission: users.permission, online: users.online,
        createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
      }).from(users).limit(200);
      return reply.send({ ok: true, users: rows, total: rows.length });
    } catch (e: any) { log.error({ err: e }, "admin listUsers failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // ═══ Admin: Token list ═══
  app.get("/api/v1/admin/tokens", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    try {
      const rows = await db.select().from(tokens).limit(200);
      return reply.send({ ok: true, tokens: rows.map(t => ({
        id: t.id, userId: t.userId, scopes: t.scopes,
        shortExpires: t.shortExpires, longExpires: t.longExpires,
        createdAt: t.createdAt, revokedAt: t.revokedAt, lastUsedAt: t.lastUsedAt,
      })), total: rows.length });
    } catch (e: any) { log.error({ err: e }, "admin listTokens failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // ═══ Admin: Delete user ═══
  app.delete("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    if (id === admin.userId) return reply.status(400).send({ ok: false, error: "cannot delete yourself" });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "user not found" });
      if (u.permission === "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "cannot delete the last admin" });
      await deleteUser(id);
      invalidateTokenCache();
      return reply.send({ ok: true, deleted: id });
    } catch (e: any) { log.error({ err: e }, "admin deleteUser failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // ═══ Admin: Revoke token ═══
  app.delete("/api/v1/admin/tokens/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    try {
      const [t] = await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.id, id)).limit(1);
      if (!t) return reply.status(404).send({ ok: false, error: "token not found" });
      await revokeToken(id);
      invalidateTokenCache();
      return reply.send({ ok: true, revoked: id });
    } catch (e: any) { log.error({ err: e }, "admin revokeToken failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // ═══ Admin: Update user permission ═══
  app.put("/api/v1/admin/users/:id/permission", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const { permission } = req.body as any;
    if (permission !== "admin" && permission !== "user") return reply.status(400).send({ ok: false, error: "permission must be 'admin' or 'user'" });
    if (id === admin.userId && permission !== "admin") return reply.status(400).send({ ok: false, error: "cannot demote yourself" });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "user not found" });
      if (u.permission === "admin" && permission !== "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "cannot demote the last admin" });
      await updateUserPermission(id, permission);
      invalidateTokenCache();
      return reply.send({ ok: true, userId: id, permission });
    } catch (e: any) { log.error({ err: e }, "admin updatePermission failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });
}
