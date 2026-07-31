import type { FastifyInstance } from "fastify";
import { eq, sql, and, ne } from "drizzle-orm";
import { db } from "./db.js";
import { users, tokens } from "./schema.js";
import { registerUser, loginUser, verifyToken, createApiKey, getUserById, getUserTokens, deleteUser, revokeToken, updateUserPermission, invalidateTokenCache } from "./core.js";
import { apiKeys } from "./schema.js";


function requireString(body: any, field: string, min: number, max: number): string {
  if (!body || typeof body[field] !== "string") throw new Error(`${field} 必须是字符串`);
  if (body[field].length < min || body[field].length > max) throw new Error(`${field} 长度须在 ${min}-${max} 字符之间`);
  return body[field];
}

async function requireAdmin(req: any): Promise<{ userId: string; permission: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = await verifyToken(auth.slice(7));
  if (!payload || payload.permission !== "admin") return null;
  return { userId: payload.userId, permission: payload.permission };
}

// 目标用户若为 admin，是否系统内最后一个 admin
async function isLastAdmin(targetId: string): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    .where(and(eq(users.permission, "admin"), ne(users.id, targetId)));
  return Number(count) === 0;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ═══ 注册 ═══
  app.post("/api/v1/register", async (req, reply) => {
    try {
      const { username, password, app_id } = req.body as any;
      const u = requireString(req.body, "username", 2, 20);
      const p = requireString(req.body, "password", 8, 128);
      const user = await registerUser(u, p, app_id || "chat");
      return reply.status(201).send({ ok: true, user });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // requireString / registerUser 的字段与业务错误 → 400；其余(DB故障等) → 500
      const isValidation = /^(用户名|密码)|必须是字符串|长度须在/.test(msg);
      return reply.status(isValidation ? 400 : 500).send({ ok: false, error: isValidation ? msg : "注册失败，请稍后重试" });
    }
  });

  // ═══ 登录 ═══
  app.post("/api/v1/login", async (req, reply) => {
    try {
      const { username, password } = req.body as any;
      requireString(req.body, "username", 1, 64);
      requireString(req.body, "password", 1, 128);
      const result = await loginUser(username, password);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      const msg = e?.message || "internal error";
      // 凭据错误(密码错误/用户不存在/字段缺失) → 401；其余(DB故障等) → 500
      const isCredential = msg === "用户名或密码错误" || /必须是字符串|长度须在/.test(msg);
      return reply.status(isCredential ? 401 : 500).send({ ok: false, error: isCredential ? msg : "登录失败，请稍后重试" });
    }
  });

  // ═══ 验证Token ═══
  app.get("/api/v1/verify", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const token = auth.slice(7);
    if (token.length < 32 || token.length > 128) return reply.status(401).send({ ok: false, error: "invalid token format" });
    const payload = await verifyToken(token);
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    return reply.send({ ok: true, user_id: payload.userId, scopes: payload.scopes, permission: payload.permission });
  });

  // ═══ 通过ID获取用户 (内部, 需要 Internal API Key) ═══
  app.get("/api/v1/internal/user/:id", async (req, reply) => {
    const internalKey = req.headers["x-internal-key"];
    if (!internalKey || internalKey !== (process.env.INTERNAL_API_KEY || "dev-internal-key-change-in-production"))
      return reply.status(403).send({ ok: false, error: "forbidden" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const [u] = await db.select({ id: users.id, globalName: users.globalName, appNames: users.appNames })
      .from(users).where(eq(users.id, id)).limit(1);
    if (!u) return reply.status(404).send({ ok: false });
    return reply.send({ ok: true, id: u.id, name: u.globalName, app_names: u.appNames });
  });

  // ═══ 创建 API Key ═══
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
      // 业务校验错误 → 400；其余（DB故障等）→ 500
      const isBusiness = /^(用户不存在|name 须为|scopes 须为|有效期必须)/.test(msg);
      return reply.status(isBusiness ? 400 : 500).send({ ok: false, error: isBusiness ? msg : "创建失败，请稍后重试" });
    }
  });

  // ═══ 获取当前用户资料 ═══
  app.get("/api/v1/users/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const user = await getUserById(payload.userId);
    if (!user) return reply.status(404).send({ ok: false, error: "user not found" });
    return reply.send({ ok: true, user });
  });

  // ═══ 获取当前用户 Token 列表 ═══
  app.get("/api/v1/tokens/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ ok: false, error: "missing token" });
    const payload = await verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    const tokenList = await getUserTokens(payload.userId);
    return reply.send({ ok: true, tokens: tokenList, total: tokenList.length });
  });

  // ═══ 健康检查 (liveness) ═══
  app.get("/api/v1/health", async () => ({ ok: true, service: "user-v1", uptime: process.uptime() }));

  // ═══ 就绪检查 (readiness) ═══
  app.get("/api/v1/ready", async () => {
    let dbOk = false;
    try { await db.execute(sql`SELECT 1`); dbOk = true; } catch {}
    return { ok: dbOk, service: "user-v1", db: dbOk ? "ok" : "error" };
  });

  // ═══ Metrics ═══
  app.get("/api/v1/metrics", async () => ({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
  }));

  // ═══ Admin: 通过ID获取用户 ═══
  app.get("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "无效的用户ID" });
    try {
      const rows = await db.select({
        id: users.id, globalName: users.globalName, appNames: users.appNames,
        permission: users.permission, online: users.online,
        createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
      }).from(users).where(eq(users.id, id)).limit(1);
      if (!rows.length) return reply.status(404).send({ ok: false, error: "用户不存在" });
      return reply.send({ ok: true, user: rows[0] });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: 用户列表 ═══
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
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Token 列表 ═══
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
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: 删除用户 ═══
  app.delete("/api/v1/admin/users/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    if (id === admin.userId) return reply.status(400).send({ ok: false, error: "不能删除自己" });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "用户不存在" });
      if (u.permission === "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "不能删除最后一个管理员" });
      await deleteUser(id);
      invalidateTokenCache();
      return reply.send({ ok: true, deleted: id });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: 撤销 Token ═══
  app.delete("/api/v1/admin/tokens/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    try {
      const [t] = await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.id, id)).limit(1);
      if (!t) return reply.status(404).send({ ok: false, error: "token 不存在" });
      await revokeToken(id);
      invalidateTokenCache();
      return reply.send({ ok: true, revoked: id });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: 修改用户权限 ═══
  app.put("/api/v1/admin/users/:id/permission", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    const { permission } = req.body as any;
    if (permission !== "admin" && permission !== "user") return reply.status(400).send({ ok: false, error: "permission 必须是 admin 或 user" });
    if (id === admin.userId && permission !== "admin") return reply.status(400).send({ ok: false, error: "不能降低自己的权限" });
    try {
      const [u] = await db.select({ id: users.id, permission: users.permission }).from(users).where(eq(users.id, id)).limit(1);
      if (!u) return reply.status(404).send({ ok: false, error: "用户不存在" });
      if (u.permission === "admin" && permission !== "admin" && await isLastAdmin(id))
        return reply.status(400).send({ ok: false, error: "不能降低最后一个管理员的权限" });
      await updateUserPermission(id, permission);
      invalidateTokenCache();
      return reply.send({ ok: true, userId: id, permission });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });
}
