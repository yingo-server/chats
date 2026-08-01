import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { eq, sql, and, ne } from "drizzle-orm";
import { db } from "./db.js";
import { users, tokens } from "./schema.js";
import { registerUser, loginUser, verifyToken, createApiKey, getUserById, getUserTokens, deleteUser, revokeToken, updateUserPermission, invalidateTokenCache } from "./core.js";
import { apiKeys } from "./schema.js";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "user-routes" });

// 鈺愨晲鈺?鐧诲綍閫熺巼闄愬埗: 鍙€氳繃鐜鍙橀噺閰嶇疆 鈺愨晲鈺?
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

// 姣?5 鍒嗛挓娓呯悊杩囨湡鏉＄洰
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
  if (!body || typeof body[field] !== "string") throw new Error(`${field} 蹇呴』鏄瓧绗︿覆`);
  if (body[field].length < min || body[field].length > max) throw new Error(`${field} 闀垮害椤诲湪 ${min}-${max} 瀛楃涔嬮棿`);
  return body[field];
}

async function requireAdmin(req: any): Promise<{ userId: string; permission: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = await verifyToken(auth.slice(7));
  if (!payload || payload.permission !== "admin") return null;
  return { userId: payload.userId, permission: payload.permission };
}

// 鐩爣鐢ㄦ埛鑻ヤ负 admin锛屾槸鍚︾郴缁熷唴鏈€鍚庝竴涓?admin
async function isLastAdmin(targetId: string): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    .where(and(eq(users.permission, "admin"), ne(users.id, targetId)));
  return Number(count) === 0;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // 鈺愨晲鈺?娉ㄥ唽 鈺愨晲鈺?
  app.post("/api/v1/register", async (req, reply) => {
    try {
      const { username, password, app_id } = req.body as any;
      const u = requireString(req.body, "username", 2, 20);
      const p = requireString(req.body, "password", 8, 128);
      const user = await registerUser(u, p, app_id || "chat");
      return reply.status(201).send({ ok: true, user });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // requireString / registerUser 鐨勫瓧娈典笌涓氬姟閿欒 鈫?400锛涘叾浣?DB鏁呴殰绛? 鈫?500
      const isValidation = /^(鐢ㄦ埛鍚峾瀵嗙爜)|蹇呴』鏄瓧绗︿覆|闀垮害椤诲湪/.test(msg);
      return reply.status(isValidation ? 400 : 500).send({ ok: false, error: isValidation ? msg : "娉ㄥ唽澶辫触锛岃绋嶅悗閲嶈瘯" });
    }
  });

  // 鈺愨晲鈺?鐧诲綍 鈺愨晲鈺?
  app.post("/api/v1/login", async (req, reply) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
      if (!checkLoginRateLimit(ip)) {
        return reply.status(429).send({ ok: false, error: "鐧诲綍灏濊瘯杩囧锛岃绋嶅悗鍐嶈瘯" });
      }
      const { username, password } = req.body as any;
      requireString(req.body, "username", 2, 64);
      requireString(req.body, "password", 1, 128);
      const result = await loginUser(username, password);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // 鍑嵁閿欒(瀵嗙爜閿欒/鐢ㄦ埛涓嶅瓨鍦?瀛楁缂哄け) 鈫?401锛涘叾浣?DB鏁呴殰绛? 鈫?500
      const isCredential = msg === "鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒" || /蹇呴』鏄瓧绗︿覆|闀垮害椤诲湪/.test(msg);
      return reply.status(isCredential ? 401 : 500).send({ ok: false, error: isCredential ? msg : "鐧诲綍澶辫触锛岃绋嶅悗閲嶈瘯" });
    }
  });

  // 鈺愨晲鈺?楠岃瘉Token 鈺愨晲鈺?
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

  // 鈺愨晲鈺?閫氳繃ID鑾峰彇鐢ㄦ埛 (鍐呴儴, 闇€瑕?Internal API Key) 鈺愨晲鈺?
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

  // 鈺愨晲鈺?鍒涘缓 API Key 鈺愨晲鈺?
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
      // 涓氬姟鏍￠獙閿欒 鈫?400锛涘叾浣欙紙DB鏁呴殰绛夛級鈫?500
      const isBusiness = /^(鐢ㄦ埛涓嶅瓨鍦▅name 椤讳负|scopes 椤讳负|鏈夋晥鏈熷繀椤?/.test(msg);
      return reply.status(isBusiness ? 400 : 500).send({ ok: false, error: isBusiness ? msg : "鍒涘缓澶辫触锛岃绋嶅悗閲嶈瘯" });
    }
  });

  // 鈺愨晲鈺?鑾峰彇褰撳墠鐢ㄦ埛璧勬枡 鈺愨晲鈺?
  app.get("/api/v1/users/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const user = await getUserById(payload.userId);
    if (!user) return reply.status(404).send({ ok: false, error: "user not found" });
    return reply.send({ ok: true, user });
  });

  // 鈺愨晲鈺?鑾峰彇褰撳墠鐢ㄦ埛 Token 鍒楄〃 鈺愨晲鈺?
  app.get("/api/v1/tokens/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const tokenList = await getUserTokens(payload.userId);
    return reply.send({ ok: true, tokens: tokenList, total: tokenList.length });
  });

  // 鈺愨晲鈺?鍋ュ悍妫€鏌?(liveness) 鈺愨晲鈺?
  app.get("/api/v1/health", async () => ({ ok: true, service: "user-v1", uptime: process.uptime() }));

  // 鈺愨晲鈺?灏辩华妫€鏌?(readiness) 鈺愨晲鈺?
  app.get("/api/v1/ready", async () => {
    let dbOk = false;
    try { await db.execute(sql`SELECT 1`); dbOk = true; } catch {}
    return { ok: dbOk, service: "user-v1", db: dbOk ? "ok" : "error" };
  });

  // 鈺愨晲鈺?Metrics (admin only) 鈺愨晲鈺?
  app.get("/api/v1/metrics", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    };
  });

  // 鈺愨晲鈺?Admin: 閫氳繃ID鑾峰彇鐢ㄦ埛 鈺愨晲鈺?
  app.get("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "鏃犳晥鐨勭敤鎴稩D" });
    try {
      const rows = await db.select({
        id: users.id, globalName: users.globalName, appNames: users.appNames,
        permission: users.permission, online: users.online,
        createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
      }).from(users).where(eq(users.id, id)).limit(1);
      if (!rows.length) return reply.status(404).send({ ok: false, error: "鐢ㄦ埛涓嶅瓨鍦? });
      return reply.send({ ok: true, user: rows[0] });
    } catch (e: any) { log.error({ err: e }, "admin getUser failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // 鈺愨晲鈺?Admin: 鐢ㄦ埛鍒楄〃 鈺愨晲鈺?
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

  // 鈺愨晲鈺?Admin: Token 鍒楄〃 鈺愨晲鈺?
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

  // 鈺愨晲鈺?Admin: 鍒犻櫎鐢ㄦ埛 鈺愨晲鈺?
  app.delete("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    if (id === admin.userId) return reply.status(400).send({ ok: false, error: "涓嶈兘鍒犻櫎鑷繁" });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "鐢ㄦ埛涓嶅瓨鍦? });
      if (u.permission === "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "涓嶈兘鍒犻櫎鏈€鍚庝竴涓鐞嗗憳" });
      await deleteUser(id);
      invalidateTokenCache();
      return reply.send({ ok: true, deleted: id });
    } catch (e: any) { log.error({ err: e }, "admin deleteUser failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // 鈺愨晲鈺?Admin: 鎾ら攢 Token 鈺愨晲鈺?
  app.delete("/api/v1/admin/tokens/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    try {
      const [t] = await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.id, id)).limit(1);
      if (!t) return reply.status(404).send({ ok: false, error: "token 涓嶅瓨鍦? });
      await revokeToken(id);
      invalidateTokenCache();
      return reply.send({ ok: true, revoked: id });
    } catch (e: any) { log.error({ err: e }, "admin revokeToken failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });

  // 鈺愨晲鈺?Admin: 淇敼鐢ㄦ埛鏉冮檺 鈺愨晲鈺?
  app.put("/api/v1/admin/users/:id/permission", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const { permission } = req.body as any;
    if (permission !== "admin" && permission !== "user") return reply.status(400).send({ ok: false, error: "permission 蹇呴』鏄?admin 鎴?user" });
    if (id === admin.userId && permission !== "admin") return reply.status(400).send({ ok: false, error: "涓嶈兘闄嶄綆鑷繁鐨勬潈闄? });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "鐢ㄦ埛涓嶅瓨鍦? });
      if (u.permission === "admin" && permission !== "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "涓嶈兘闄嶄綆鏈€鍚庝竴涓鐞嗗憳鐨勬潈闄? });
      await updateUserPermission(id, permission);
      invalidateTokenCache();
      return reply.send({ ok: true, userId: id, permission });
    } catch (e: any) { log.error({ err: e }, "admin updatePermission failed"); return reply.status(500).send({ ok: false, error: "internal error" }); }
  });
}
