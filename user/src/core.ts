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
  const ts = Date.now().toString(); // 13-digit millisecond timestamp, no wrap-around before year 2286
  const rand = (randomBytes(2).readUIntBE(0, 2) % 1000).toString().padStart(3, "0");
  return ts + rand;
}

// ═══ Username dedup (LIKE wildcard escaping + exact #N suffix matching) ═══
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

// ═══ Register ═══
export async function registerUser(username: string, password: string, appId: string = "chat") {
  if (username.length < 2 || username.length > 20) throw new Error("username must be 2-20 characters");
  if (password.length < 8) throw new Error("password must be at least 8 characters");

  const adminUsername = process.env.ADMIN_USERNAME;

  // ID collision / concurrent same-name retry (max 3 attempts); advisory lock serializes "first admin" decision in the transaction
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
          // Concurrent same-name registration: suffix resolution has a race, retry with a new name
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 10));
            continue;
          }
          throw new Error("username already taken");
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
  throw new Error("registration failed, please retry");
}

// ═══ Login -> issue token pair ═══
export async function loginUser(username: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.globalName, username)).limit(1);
  if (!user) throw new Error("invalid username or password");

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error("invalid username or password");

  // Update online status
  await db.update(users).set({ online: true, lastOnlineAt: Date.now() }).where(eq(users.id, user.id));

  const shortToken = randomBytes(16).toString("hex"); // 32 hex chars
  const longToken = randomBytes(32).toString("hex");  // 64 hex chars
  const tokenSalt = randomBytes(16).toString("hex");
  const shortHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + shortToken).digest("hex");
  const longHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + longToken).digest("hex");
  const lookupLong = createHash("sha256").update(longToken).digest("hex");
  const lookupShort = createHash("sha256").update(shortToken).digest("hex");
  const now = Date.now();

  // ID collision automatic retry (max 3 attempts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const tid = generateId();
    try {
      await db.insert(tokens).values({
        id: tid, userId: user.id,
        tokenLookup: lookupLong,
        shortLookup: lookupShort,
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

// ═══ Verify token (with in-memory cache to avoid full table scans) ═══
const tokenVerifyCache = new Map<string, { result: { userId: string; scopes: string[]; permission: string } | null; ts: number }>();
const TOKEN_CACHE_TTL = 10_000;
const TOKEN_CACHE_FAIL_TTL = 1_000;
const TOKEN_CACHE_MAX = 50_000;

// Call after permission changes / revocations / deletions to invalidate the cache immediately
export function invalidateTokenCache() {
  tokenVerifyCache.clear();
}

export async function verifyToken(tokenStr: string): Promise<{ userId: string; scopes: string[]; permission: string } | null> {
  if (!tokenStr) return null;

  // Cache hit returns immediately
  const cached = tokenVerifyCache.get(tokenStr);
  if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL) return cached.result;

  const now = Date.now();
  // Locate directly via tokenLookup / shortLookup index, O(1) lookup
  let candidate: any = null;
  const lookupHash = createHash("sha256").update(tokenStr).digest("hex");
  try {
    const rows = await db.select().from(tokens).innerJoin(users, eq(tokens.userId, users.id))
      .where(sql`${tokens.tokenLookup} = ${lookupHash} OR ${tokens.shortLookup} = ${lookupHash}`)
      .limit(1);
    candidate = rows[0] || null;
  } catch (e: any) {
    log.warn({ err: e.message }, "verifyToken lookup failed");
    return null;
  }

  if (!candidate) {
    tokenVerifyCache.set(tokenStr, { result: null, ts: Date.now() - (TOKEN_CACHE_TTL - TOKEN_CACHE_FAIL_TTL) });
    return null;
  }

  const t = candidate.tokens;
  const u = candidate.users;

  if (t.revokedAt) {
    tokenVerifyCache.set(tokenStr, { result: null, ts: Date.now() - (TOKEN_CACHE_TTL - TOKEN_CACHE_FAIL_TTL) });
    return null;
  }

  const computed = createHmac("sha256", TOKEN_SECRET).update(t.tokenSalt + tokenStr).digest("hex");
  const storedShort = t.shortHash.includes(":") ? t.shortHash.split(":")[1] : t.shortHash;
  const storedLong = t.longHash.includes(":") ? t.longHash.split(":")[1] : t.longHash;
  let shortValid = false;
  let longValid = false;
  try {
    shortValid = t.shortExpires > now && timingSafeEqual(Buffer.from(storedShort, "hex"), Buffer.from(computed, "hex"));
  } catch { /* length mismatch */ }
  try {
    longValid = t.longExpires > now && timingSafeEqual(Buffer.from(storedLong, "hex"), Buffer.from(computed, "hex"));
  } catch { /* length mismatch */ }

  if (shortValid || longValid) {
    db.update(tokens).set({ lastUsedAt: Date.now() }).where(eq(tokens.id, t.id)).catch((e) => { log.warn({ err: e }, "Failed to update lastUsedAt"); });
    const result = { userId: t.userId, scopes: t.scopes.trim().split(/\s+/).filter(Boolean), permission: u.permission };
    tokenVerifyCache.set(tokenStr, { result, ts: Date.now() });
    if (tokenVerifyCache.size > TOKEN_CACHE_MAX) {
      const oldest = tokenVerifyCache.keys().next().value;
      if (oldest) tokenVerifyCache.delete(oldest);
    }
    return result;
  }

  // Failed results are only cached for 1 second to avoid a 10-second thundering herd on transient DB issues
  tokenVerifyCache.set(tokenStr, { result: null, ts: Date.now() - (TOKEN_CACHE_TTL - TOKEN_CACHE_FAIL_TTL) });
  return null;
}

// ═══ Get user's own profile ═══
export async function getUserById(userId: string) {
  const [u] = await db.select({
    id: users.id, globalName: users.globalName, appNames: users.appNames,
    permission: users.permission, online: users.online,
    createdAt: users.createdAt, lastOnlineAt: users.lastOnlineAt,
  }).from(users).where(eq(users.id, userId)).limit(1);
  return u || null;
}

// ═══ Get user's own token list ═══
export async function getUserTokens(userId: string) {
  const rows = await db.select().from(tokens).where(eq(tokens.userId, userId)).limit(200);
  return rows.map(t => ({
    id: t.id, scopes: t.scopes,
    shortExpires: t.shortExpires, longExpires: t.longExpires,
    createdAt: t.createdAt, revokedAt: t.revokedAt, lastUsedAt: t.lastUsedAt,
  }));
}

// ═══ Create API Key (128-bit, mk-/rk- prefix) ═══
export async function createApiKey(userId: string, name: string, scopes: string[], expiresDays: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("user not found");

  if (!name || typeof name !== "string" || name.length < 1 || name.length > 64) throw new Error("name must be 1-64 characters");
  if (!Array.isArray(scopes) || scopes.length > 8 || scopes.some(s => typeof s !== "string" || s.length < 1 || s.length > 32))
    throw new Error("scopes must be at most 8 strings of 1-32 characters");

  const validDays = [7, 30, 60, 90, 180];
  if (!validDays.includes(expiresDays)) throw new Error("expiry must be 7/30/60/90/180 days");

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
  throw new Error("failed to create API key");
}

// ═══ Admin: Delete user (transactional cascade: tokens + api keys) ═══
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

// ═══ Admin: Revoke (delete) token ═══
export async function revokeToken(tokenId: string): Promise<void> {
  await db.update(tokens).set({ revokedAt: Date.now() }).where(eq(tokens.id, tokenId));
}

// ═══ Admin: Update user permission ═══
export async function updateUserPermission(userId: string, permission: string): Promise<void> {
  if (permission !== "admin" && permission !== "user") throw new Error("permission must be 'admin' or 'user'");
  await db.update(users).set({ permission }).where(eq(users.id, userId));
}

// ═══ Token cleanup: delete expired + revoked tokens ═══
export function startTokenCleaner(): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await db.delete(tokens).where(sql`${tokens.longExpires} < ${Date.now()}`);
      // Also clean up old records revoked more than 7 days ago
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
