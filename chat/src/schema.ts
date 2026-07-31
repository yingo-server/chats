import { pgTable, varchar, text, bigint, boolean, integer, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

// ═══ 冷聊天数据库 cold_chat ═══

export const rooms = pgTable("rooms", {
  id: varchar("id", { length: 16 }).primaryKey(),
  type: varchar("type", { length: 8 }).notNull().default("direct"),
  name: varchar("name", { length: 64 }),
  creatorId: varchar("creator_id", { length: 16 }).notNull(), // 注意: insert() 用 creatorId (JS属性名), 非 createdBy
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

/** 冷消息 — 超过5分钟的消息归档到此 */
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
});
