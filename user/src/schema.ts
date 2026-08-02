import { pgTable, varchar, text, bigint, boolean, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

// ═══ Cold user database cold_user ═══

/** User main table - ID is a 16-digit numeric string */
export const users = pgTable("users", {
  id: varchar("id", { length: 16 }).primaryKey(),
  globalName: varchar("global_name", { length: 64 }).notNull().unique(),
  appNames: jsonb("app_names").notNull().$type<Record<string, string>>(), // {chat:"John", forum:"John#1"}
  passwordHash: text("password_hash").notNull(),   // bcrypt(pepper + salt + password)
  passwordSalt: varchar("password_salt", { length: 32 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),   // unix ms
  lastOnlineAt: bigint("last_online_at", { mode: "number" }).notNull(),
  permission: varchar("permission", { length: 16 }).notNull().default("user"),
  online: boolean("online").notNull().default(false),
});

/** Token table - short-term 32 chars + long-term 64 chars */
export const tokens = pgTable("tokens", {
  id: varchar("id", { length: 16 }).primaryKey(),
  userId: varchar("user_id", { length: 16 }).notNull().references(() => users.id),
  tokenLookup: varchar("token_lookup", { length: 64 }).notNull().unique(),  // SHA-256(longToken) for indexed lookup
  shortLookup: varchar("short_lookup", { length: 64 }).notNull().unique(),  // SHA-256(shortToken) for indexed lookup
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
  lookupIdx: index("idx_tokens_lookup").on(t.tokenLookup),
}));

/** API Key - user-created 128-bit, prefix mk-/rk- */
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

/** OAuth2 Client (simplified) */
export const oauthClients = pgTable("oauth_clients", {
  id: varchar("id", { length: 16 }).primaryKey(),
  clientId: varchar("client_id", { length: 32 }).notNull().unique(),
  clientSecretHash: varchar("client_secret_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  appId: varchar("app_id", { length: 32 }).notNull(), // linked application ID
  allowedScopes: text("allowed_scopes").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  status: integer("status").notNull().default(1),
});

/** Per-user per-room display name note (visible only to its owner) */
export const roomNotes = pgTable("room_notes", {
  id: varchar("id", { length: 16 }).primaryKey(),
  userId: varchar("user_id", { length: 16 }).notNull().references(() => users.id),
  roomId: varchar("room_id", { length: 16 }).notNull(),
  note: varchar("note", { length: 64 }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => ({
  userRoomUnique: uniqueIndex("idx_room_notes_user_room_unique").on(t.userId, t.roomId),
  userIdx: index("idx_room_notes_user_id").on(t.userId),
}));
