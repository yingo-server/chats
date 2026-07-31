import { pgTable, varchar, text, bigint, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";

// ═══ 冷用户数据库 cold_user ═══

/** 用户主表 — ID为16位数字字符串 */
export const users = pgTable("users", {
  id: varchar("id", { length: 16 }).primaryKey(),
  globalName: varchar("global_name", { length: 64 }).notNull().unique(),
  appNames: jsonb("app_names").notNull().$type<Record<string, string>>(), // {chat:"张三", forum:"张三#1"}
  passwordHash: text("password_hash").notNull(),   // bcrypt(pepper + salt + password)
  passwordSalt: varchar("password_salt", { length: 32 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),   // unix ms
  lastOnlineAt: bigint("last_online_at", { mode: "number" }).notNull(),
  permission: varchar("permission", { length: 16 }).notNull().default("user"),
  online: boolean("online").notNull().default(false),
});

/** Token表 — 短期32位 + 长期64位 */
export const tokens = pgTable("tokens", {
  id: varchar("id", { length: 16 }).primaryKey(),
  userId: varchar("user_id", { length: 16 }).notNull().references(() => users.id),
  shortHash: varchar("short_hash", { length: 255 }).notNull(),  // HMAC(secret + salt + shortToken)
  longHash: varchar("long_hash", { length: 255 }).notNull(),    // HMAC(secret + salt + longToken)
  tokenSalt: varchar("token_salt", { length: 32 }).notNull(),
  shortExpires: bigint("short_expires", { mode: "number" }).notNull(),
  longExpires: bigint("long_expires", { mode: "number" }).notNull(),
  scopes: text("scopes").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  revokedAt: bigint("revoked_at", { mode: "number" }),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
}, (t) => ({
  userIdx: index("idx_tokens_user_id").on(t.userId),
  expiresIdx: index("idx_tokens_long_expires").on(t.longExpires),
  shortExpiresIdx: index("idx_tokens_short_expires").on(t.shortExpires),
  revokedIdx: index("idx_tokens_revoked_at").on(t.revokedAt),
}));

/** API Key — 用户自建128位，前缀mk-/rk- */
export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 16 }).primaryKey(),
  userId: varchar("user_id", { length: 16 }).notNull().references(() => users.id),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  keySalt: varchar("key_salt", { length: 32 }).notNull(),
  prefix: varchar("prefix", { length: 4 }).notNull(),   // mk- or rk-
  name: varchar("name", { length: 64 }).notNull(),
  scopes: text("scopes").notNull().default(""),
  rateLimit: integer("rate_limit").notNull().default(100), // -1=unlimited
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
  revokedAt: bigint("revoked_at", { mode: "number" }),
});

/** OAuth2 Client (简化) */
export const oauthClients = pgTable("oauth_clients", {
  id: varchar("id", { length: 16 }).primaryKey(),
  clientId: varchar("client_id", { length: 32 }).notNull().unique(),
  clientSecretHash: varchar("client_secret_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  appId: varchar("app_id", { length: 32 }).notNull(), // 关联的应用ID
  allowedScopes: text("allowed_scopes").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  status: integer("status").notNull().default(1),
});
