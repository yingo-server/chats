import { pgTable, varchar, text, bigint, boolean, integer, primaryKey, uniqueIndex, index, customType } from "drizzle-orm/pg-core";

// bytea is not a built-in column in drizzle-orm 0.33 -> custom type (raw bytes in / Buffer out)
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType() { return "bytea"; },
  toDriver(value: Buffer) { return value; },
  fromDriver(value: unknown) { return Buffer.from(value as Uint8Array); },
});

// ═══ Cold chat database cold_chat ═══

export const rooms = pgTable("rooms", {
  id: varchar("id", { length: 16 }).primaryKey(),
  type: varchar("type", { length: 8 }).notNull().default("direct"),
  name: varchar("name", { length: 64 }),
  creatorId: varchar("creator_id", { length: 16 }).notNull(), // note: insert() uses creatorId (JS property name), not createdBy
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const roomMembers = pgTable("room_members", {
  id: varchar("id", { length: 16 }).primaryKey(),
  roomId: varchar("room_id", { length: 16 }).notNull(),
  userId: varchar("user_id", { length: 16 }).notNull(),
  joinedAt: bigint("joined_at", { mode: "number" }).notNull(),
}, (t) => ({
  roomUserUnique: uniqueIndex("idx_room_members_room_user_unique").on(t.roomId, t.userId),
}));

/** Cold messages - messages older than 5 minutes are archived here */
export const coldMessages = pgTable("cold_messages", {
  id: varchar("id", { length: 16 }).primaryKey(),
  roomId: varchar("room_id", { length: 16 }).notNull(),
  senderId: varchar("sender_id", { length: 16 }).notNull(),
  senderName: varchar("sender_name", { length: 64 }).notNull(),
  senderAppName: varchar("sender_app_name", { length: 64 }).notNull(),
  content: text("content"),
  type: varchar("type", { length: 8 }).notNull().default("text"),
  sentAt: bigint("sent_at", { mode: "number" }).notNull(),
  senderIp: varchar("sender_ip", { length: 45 }),
  recalled: boolean("recalled").notNull().default(false),
  manuallyDeleted: boolean("manually_deleted").notNull().default(false),
  autoDeleted: boolean("auto_deleted").notNull().default(false),
  mediaId: varchar("media_id", { length: 16 }),
  mediaType: varchar("media_type", { length: 8 }),
}, (t) => ({
  mediaRoomTypeIdx: index("idx_msg_media_room_type").on(t.roomId, t.mediaType, t.id),
}));

/** Media blobs (images/audio/video/files). Deduplicated by content sha256. */
export const media = pgTable("media", {
  id: varchar("id", { length: 16 }).primaryKey(),
  mimeType: varchar("mime_type", { length: 64 }).notNull(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  ownerId: varchar("owner_id", { length: 16 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => ({
  sha256Unique: uniqueIndex("idx_media_sha256_unique").on(t.sha256),
}));
