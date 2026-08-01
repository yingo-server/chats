import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "./db.js";
import { users, tokens, apiKeys } from "./schema.js";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "user-service" });

if (!process.env.PEPPER_SECRET) {
  if (process.env.NODE_ENV === "production") throw new Error("PEPPER_SECRET must be set in production");
  console.warn("[SECURITY] Using default PEPPER_SECRET - set PEPPER_SECRET in production");
}
if (!process.env.TOKEN_SECRET) {
  if (process.env.NODE_ENV === "production") throw new Error("TOKEN_SECRET must be set in production");
  console.warn("[SECURITY] Using default TOKEN_SECRET - set TOKEN_SECRET in production");
}
const PEPPER = process.env.PEPPER_SECRET || "dev-pepper-change-in-production";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "dev-token-secret-change-in-production";
const DEFAULT_SCOPES = "user:read chat:read chat:send";
function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  try {
    const computed = createHmac("sha256", PEPPER).update(salt + pw).digest("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
  } catch { return false; }
}

// ═══ ID ═══
export function generateId(): string {
  const ts = Date.now().toString(); // 13 位毫秒时间戳，2286 年前不会回绕
  const rand = (randomBytes(2).readUIntBE(0, 2) % 1000).toString().padStart(3, "0");
  return ts + rand;
}

// ═══ 用户名去重（LIKE 通配符转义 + 精确匹配 #N 后缀）═══
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => "\\" + m);
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function resolveGlobalName(baseName: string): Promise<string> {
  const existing = await db.select({ globalName: users.globalName })
    .from(users).where(sql`${users.globalName} LIKE ${escapeLike(baseName) + '%'} ESCAPE '\\'`);
  if (existing.length === 0) return baseName;
  const re = new RegExp(`^${escapeRegex(baseName)}#(\\d+)$`);
  let max = 0;
  for (const u of existing) {
    const m = u.globalName.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${baseName}#${max + 1}`;
}

// ═══ 注册 ═══
export async function registerUser(username: string, password: string, appId: string = "chat") {
  if (username.length < 2 || username.length > 20) throw new Error("用户名2-20字");
  if (password.length < 8) throw new Error("密码至少8位");

  const adminUsername = process.env.ADMIN_USERNAME;

  // ID碰撞/并发同名自动重试（最多3次）；事务内用 advisory lock 串行化"首个管理员"判定
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(424242)`);
        const [{ count: adminCount }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.permission, "admin"));
        const [{ count: userCount }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
        const isFirstAdmin = Number(adminCount) === 0;
        const isAdmin = isFirstAdmin || (adminUsername && username === adminUsername) || Number(userCount) === 0;
        const permission = isAdmin ? "admin" : "user";

        const existing = await tx.select({ globalName: users.globalName })
          .from(users).where(sql`${users.globalName} LIKE ${escapeLike(username) + '%'} ESCAPE '\\'`);
        let globalName = username;
        if (existing.length > 0) {
          const re = new RegExp(`^${escapeRegex(username)}#(\\d+)$`);
          let max = 0;
          for (const u of existing) {
            const m = u.globalName.match(re);
            if (m) max = Math.max(max, parseInt(m[1], 10));
          }
          globalName = `${username}#${max + 1}`;
        }

        const salt = randomBytes(16).toString("hex");
        const pwHash = salt + ":" + createHmac("sha256", PEPPER).update(salt + password).digest("hex");
        const id = generateId();
        await tx.insert(users).values({
          id, globalName,
          appNames: { [appId]: username },
          passwordHash: pwHash,
          passwordSalt: salt,
          createdAt: Date.now(),
          lastOnlineAt: Date.now(),
          permission,
          online: false,
        });
        if (isAdmin) log.info({ user: globalName, permission }, "Admin account created");
        return { id, globalName, permission };
      });
    } catch (e: any) {
      if (e?.code === "23505") {
        const detail: string = e?.detail || "";
        const isNameConflict = e?.constraint_name?.includes?.("global_name") || detail.includes("global_name");
        if (isNameConflict) {
          // 并发同名注册：后缀解析有竞态，重试重新取名
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 10));
            continue;
          }
          throw new Error("用户名已被占用");
        }
        if (attempt < 2) {
          log.warn({ attempt, code: "id-collision" }, "ID collision, retrying");
          await new Promise(r => setTimeout(r, 10));
          continue;
        }
      }
      throw e;
    }
  }
  throw new Error("注册失败，请重试");
}

// ═══ 登录 → 签发Token对 ═══
export async function loginUser(username: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.globalName, username)).limit(1);
  if (!user) throw new Error("用户名或密码错误");

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error("用户名或密码错误");

  // 更新在线状态
  await db.update(users).set({ online: true, lastOnlineAt: Date.now() }).where(eq(users.id, user.id));

  const shortToken = randomBytes(16).toString("hex"); // 32 hex chars
  const longToken = randomBytes(32).toString("hex");  // 64 hex chars
  const tokenSalt = randomBytes(16).toString("hex");
  const shortHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + shortToken).digest("hex");
  const longHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + longToken).digest("hex");
  const now = Date.now();

  // ID 碰撞自动重试（最多3次）
  for (let attempt = 0; attempt < 3; attempt++) {
    const tid = generateId();
    try {
      await db.insert(tokens).values({
        id: tid, userId: user.id,
        shortHash, longHash, tokenSalt,
        shortExpires: now + 3600_000,    // 1h
        longExpires: now + 2592000_000,  // 30d
        scopes: DEFAULT_SCOPES,
        createdAt: now,
      });
      break;
    } catch (e: any) {
      if (e?.code === "23505" && attempt < 2) {
        await new Promise(r => setTimeout(r, 10));
        continue;
      }
      throw e;
    }
  }

  return { user_id: user.id, short_token: shortToken, long_token: longToken, expires_in: 3600, permission: user.permission };
}

// ═══ 验证Token（带内存缓存，避免全表扫描）═══
const tokenVerifyCache = new Map<string, { result: { userId: string; scopes: string[]; permission: string } | null; ts: number }>();
const TOKEN_CACHE_TTL = 10_000;
const TOKEN_CACHE_FAIL_TTL = 1_000;
const TOKEN_CACHE_MAX = 50_000;

// 权限变更/撤销/删除后调用，使缓存立即失效
export function invalidateTokenCache() {
  tokenVerifyCache.clear();
}

export async function verifyToken(tokenStr: string): Promise<{ userId: string; scopes: string[]; permission: string } | null> {
  if (!tokenStr) return null;

  // 命中缓存直接返回
  const cached = tokenVerifyCache.get(tokenStr);
  if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL) return cached.result;

  const now = Date.now();
  // 查出所有未撤销、任一有效期未过的 token，逐个 HMAC 验证
  let candidates: any[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      candidates = await db.select().from(tokens).innerJoin(users, eq(tokens.userId, users.id)).where(
        and(isNull(tokens.revokedAt), sql`(${tokens.longExpires} > ${now} OR ${tokens.shortExpires} > ${now})`)
      ).limit(10000);
      break;
    } catch (e: any) {
      log.warn({ attempt, err: e.message }, "verifyToken query failed, retrying");
      if (attempt === 0) await new Promise(r => setTimeout(r, 100));
    }
  }

  for (const row of candidates) {
    const t = row.tokens;
    const u = row.users;
    const computed = createHmac("sha256", TOKEN_SECRET).update(t.tokenSalt + tokenStr).digest("hex");
    const storedShort = t.shortHash.includes(":") ? t.shortHash.split(":")[1] : t.shortHash;
    const storedLong = t.longHash.includes(":") ? t.longHash.split(":")[1] : t.longHash;
    // short token 只能在其 1h 有效期内通过；long token 在 30d 有效期内通过
    const shortValid = computed === storedShort && t.shortExpires > now;
    const longValid = computed === storedLong && t.longExpires > now;
    if (shortValid || longValid) {
      db.update(tokens).set({ lastUsedAt: Date.now() }).where(eq(tokens.id, t.id)).catch((e) => { log.warn({ err: e }, "Failed to update lastUsedAt"); });
      const result = { userId: t.userId, scopes: t.scopes.trim().split(/\s+/).filter(Boolean), permission: u.permission };
      tokenVerifyCache.set(tokenStr, { result, ts: Date.now() });
      return result;
    }
  }

  // 失败结果只缓存 1 秒，避免 DB 瞬时抖动造成 10 秒雪崩
  tokenVerifyCache.set(tokenStr, { result: null, ts: Date.now() - (TOKEN_CACHE_TTL - TOKEN_CACHE_FAIL_TTL) });
  if (tokenVerifyCache.size > TOKEN_CACHE_MAX) {
    const nowTs = Date.now();
    for (const [key, v] of tokenVerifyCache) {
      if (nowTs - v.ts > TOKEN_CACHE_TTL) tokenVerifyCache.delete(key);
    }
  }
  return null;
}

// ═══ 获取用户自身的资料 ═══
export async function getUserById(userId: string) {
  const [u] = await db.select({
    id: users.id, globalName: users.globalName, appNames: users.appNames,
    permission: users.permission, online: users.online,
    createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
  }).from(users).where(eq(users.id, userId)).limit(1);
  return u || null;
}

// ═══ 获取用户自身的 Token 列表 ═══
export async function getUserTokens(userId: string) {
  const rows = await db.select().from(tokens).where(eq(tokens.userId, userId)).limit(200);
  return rows.map(t => ({
    id: t.id, scopes: t.scopes,
    shortExpires: t.shortExpires, longExpires: t.longExpires,
    createdAt: t.createdAt, revokedAt: t.revokedAt, lastUsedAt: t.lastUsedAt,
  }));
}

// ═══ 创建 API Key (128位, mk-/rk- 前缀) ═══
export async function createApiKey(userId: string, name: string, scopes: string[], expiresDays: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("用户不存在");

  if (!name || typeof name !== "string" || name.length < 1 || name.length > 64) throw new Error("name 须为 1-64 字符");
  if (!Array.isArray(scopes) || scopes.length > 8 || scopes.some(s => typeof s !== "string" || s.length < 1 || s.length > 32))
    throw new Error("scopes 须为最多8个 1-32 字符的字符串");

  const validDays = [7, 30, 60, 90, 180];
  if (!validDays.includes(expiresDays)) throw new Error("有效期必须是 7/30/60/90/180 天");

  const keyBody = randomBytes(64).toString("hex"); // 128 hex chars
  const prefix = user.permission === "admin" ? "rk-" : "mk-";
  const fullKey = prefix + keyBody;
  const keySalt = randomBytes(16).toString("hex");
  const keyHash = keySalt + ":" + createHmac("sha256", TOKEN_SECRET).update(keySalt + fullKey).digest("hex");

  const rateLimit = user.permission === "admin" ? -1 : 100;

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = generateId();
    try {
      await db.insert(apiKeys).values({
        id, userId, keyHash, keySalt, prefix, name,
        scopes: scopes.join(" "), rateLimit,
        expiresAt: Date.now() + expiresDays * 86400_000,
        createdAt: Date.now(),
      });
      return { key: fullKey, name, expiresDays, rateLimit, prefix };
    } catch (e: any) {
      if (e?.code === "23505" && attempt < 2) {
        await new Promise(r => setTimeout(r, 10));
        continue;
      }
      throw e;
    }
  }
  throw new Error("创建 API Key 失败");
}

// ═══ 管理员: 删除用户（事务级联删除 token + api key）═══
export async function deleteUser(userId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(tokens).where(eq(tokens.userId, userId));
      await tx.delete(apiKeys).where(eq(apiKeys.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  } catch (e: any) {
    log.error({ err: e, userId }, "deleteUser transaction failed, falling back to sequential");
    await db.delete(tokens).where(eq(tokens.userId, userId));
    await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

// ═══ 管理员: 撤销（删除）Token ═══
export async function revokeToken(tokenId: string): Promise<void> {
  await db.update(tokens).set({ revokedAt: Date.now() }).where(eq(tokens.id, tokenId));
}

// ═══ 管理员: 修改用户权限 ═══
export async function updateUserPermission(userId: string, permission: string): Promise<void> {
  if (permission !== "admin" && permission !== "user") throw new Error("权限必须是 admin 或 user");
  await db.update(users).set({ permission }).where(eq(users.id, userId));
}

// ═══ Token 清理: 删除过期+已撤销token ═══
export function startTokenCleaner(): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await db.delete(tokens).where(sql`${tokens.longExpires} < ${Date.now()}`);
      // 同时清理 revokedAt 超过 7 天的旧记录
      await db.delete(tokens).where(and(
        sql`${tokens.revokedAt} IS NOT NULL`,
        sql`${tokens.revokedAt} < ${Date.now() - 604800_000}`
      ));
    } catch (e) {
      log.error({ err: e }, "Token cleaner error");
    }
  }, 86_400_000);
}

// ═══ Reset all online status on startup ═══
export async function resetAllOnline(): Promise<void> {
  try {
    await db.update(users).set({ online: false });
  } catch (e) {
    log.error({ err: e }, "Failed to reset online status");
  }
}
