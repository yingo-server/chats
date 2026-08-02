import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "./redis.js";
import { coldMessages, rooms, roomMembers } from "./schema.js";
import { fetchUser } from "./api.js";
import { sanitizeMessage } from "./utils.js";
import { randomBytes } from "node:crypto";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-service" });

const client = postgres(process.env.DATABASE_URL || "postgres://yingo:yingo123@localhost:5432/cold_chat", {
  max: 20,
  idle_timeout: 300,
  connect_timeout: 15,
  max_lifetime: 1800,
});
const db = drizzle(client);
export { db };
const redis = createClient();
export { redis };

const FIVE_MIN = 300_000;

function genId(): string {
  const ts = Date.now().toString(); // 13-digit millisecond timestamp, no wrap-around before year 2286
  const rand = (randomBytes(2).readUIntBE(0, 2) % 1000).toString().padStart(3, "0");
  return ts + rand;
}

// ═══ Room membership check (throws on DB failure instead of faking 403 as 500) ═══
export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: roomMembers.roomId }).from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return !!row;
}

// ═══ Get all rooms joined by a user ═══
export async function getUserRooms(userId: string) {
  const memberships = await db.select({ roomId: roomMembers.roomId }).from(roomMembers)
    .where(eq(roomMembers.userId, userId));
  if (memberships.length === 0) return [];

  const roomIds = memberships.map(m => m.roomId);
  const roomRows = await db.select().from(rooms).where(sql`${rooms.id} IN ${roomIds}`);

  const allMembers = await db.select({ roomId: roomMembers.roomId, userId: roomMembers.userId })
    .from(roomMembers).where(sql`${roomMembers.roomId} IN ${roomIds}`);

  const membersMap = new Map<string, string[]>();
  for (const m of allMembers) {
    const arr = membersMap.get(m.roomId) || [];
    arr.push(m.userId);
    membersMap.set(m.roomId, arr);
  }

  return roomRows.map(r => ({
    ...r,
    memberIds: membersMap.get(r.id) || [],
  }));
}

// ═══ Get single room detail ═══
export async function getRoomDetail(roomId: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) return null;
  const members = await db.select({ userId: roomMembers.userId }).from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return { ...room, memberIds: members.map(m => m.userId) };
}

// ═══ Get room members ═══
export async function getRoomMembers(roomId: string): Promise<string[]> {
  const members = await db.select({ userId: roomMembers.userId }).from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return members.map(m => m.userId);
}

// ═══ Send message -> write to hot zone (Redis) ═══
export async function sendMessage(roomId: string, senderId: string, content: string, type: string, ip: string, bypassMembership = false) {
  if (!content || content.length > 10000) throw new Error("content must be 1-10000 characters");
  const ALLOWED_TYPES = ["text"];
  if (!type || typeof type !== "string" || !ALLOWED_TYPES.includes(type)) throw new Error("type must be 'text'");
  if (!bypassMembership) {
    const member = await isRoomMember(roomId, senderId);
    if (!member) throw new Error("not a room member");
  }

  const user = await fetchUser(senderId);
  const now = Date.now();

  // Build message, placehold ID, loop to avoid collisions (max 5 attempts)
  const msg: Record<string, any> = {
    roomId, senderId,
    senderName: user?.global_name || "unknown",
    senderAppName: user?.app_names?.["chat"] || user?.global_name || "unknown",
    content, type, sentAt: now, senderIp: ip,
    recalled: false, manuallyDeleted: false, autoDeleted: false,
    intervalSinceLast: null,
  };

  let saved = false;
  let savedDirect = false;
  for (let i = 0; i < 5; i++) {
    msg.id = genId();
    try {
      const ok = await redis.set(`hot:msg:${msg.id}`, JSON.stringify(msg), "EX", 600, "NX");
      if (ok === "OK") { saved = true; break; }
    } catch (e: any) {
      log.warn({ err: e.message, attempt: i }, "Redis hot write failed, falling back to cold DB");
      break;
    }
    if (i < 4) await new Promise(r => setTimeout(r, 5));
  }
  if (!saved) {
    // Redis unavailable -> write directly to cold DB so the message is never lost (no hot zone afterwards)
    try {
      await db.insert(coldMessages).values({
        id: msg.id, roomId: msg.roomId, senderId: msg.senderId,
        senderName: msg.senderName, senderAppName: msg.senderAppName,
        content: msg.content, type: msg.type, sentAt: msg.sentAt,
        senderIp: msg.senderIp, recalled: false,
        manuallyDeleted: false, autoDeleted: false,
      });
      savedDirect = true;
    } catch (e: any) {
      log.error({ err: e, roomId }, "Failed to persist message to cold DB");
      throw new Error("failed to persist message");
    }
  }
  if (savedDirect) return msg as any;

  // Compute interval since the previous message
  try {
    const last = await redis.get(`hot:last:${roomId}:${senderId}`);
    if (last) msg.intervalSinceLast = now - parseInt(last);
    if (msg.intervalSinceLast !== null && msg.intervalSinceLast > FIVE_MIN) msg.intervalSinceLast = null;
    await redis.set(`hot:last:${roomId}:${senderId}`, String(now), "EX", 600);
    // Write back to the hot zone after computing the interval so every reader gets it
    await redis.set(`hot:msg:${msg.id}`, JSON.stringify(msg), "EX", 600);
  } catch (e: any) {
    log.warn({ err: e.message }, "Failed to compute message interval");
  }

  // Add to room index
  try {
    await redis.lpush(`hot:room:${roomId}`, msg.id);
    await redis.expire(`hot:room:${roomId}`, 600);
  } catch (e: any) {
    log.warn({ err: e.message }, "Failed to update room index");
  }

  return msg as any;
}

// ═══ Archive -> cold database ═══
async function archiveMessage(msg: any) {
  const exists = await redis.get(`hot:msg:${msg.id}`);
  if (!exists) return;

  const { intervalSinceLast, ...cold } = msg;
  try {
    await db.insert(coldMessages).values({
      id: cold.id, roomId: cold.roomId, senderId: cold.senderId,
      senderName: cold.senderName, senderAppName: cold.senderAppName,
      content: cold.content, type: cold.type, sentAt: cold.sentAt,
      senderIp: cold.senderIp, recalled: cold.recalled,
      manuallyDeleted: cold.manuallyDeleted, autoDeleted: cold.autoDeleted,
    }).onConflictDoNothing();
    await redis.del(`hot:msg:${msg.id}`);
    await redis.lrem(`hot:room:${cold.roomId}`, 1, msg.id);
  } catch (e) {
    log.error({ err: e, msgId: msg?.id }, "Archive failed, will retry");
  }
}

// ═══ Get messages (hot + cold hybrid) ═══
export async function getMessages(roomId: string, userId: string, cursor?: string, limit = 30) {
  const member = await isRoomMember(roomId, userId);
  if (!member) throw new Error("not a room member");
  const safeLimit = Math.max(1, Math.min(limit, 100));

  // Fetch from the hot zone first (filtered by cursor to avoid page duplicates)
  let hotMsgs: any[] = [];
  try {
    const hotIds = await redis.lrange(`hot:room:${roomId}`, 0, -1);
    if (hotIds.length > 0) {
      const pipeline = redis.pipeline();
      for (const id of hotIds) {
        pipeline.get(`hot:msg:${id}`);
      }
      const results = await pipeline.exec();
      if (results) {
        for (const [err, raw] of results) {
          if (!err && raw) hotMsgs.push(JSON.parse(raw as string));
        }
      }
      hotMsgs.sort((a, b) => b.id.localeCompare(a.id));
    }
  } catch (e: any) {
    log.warn({ roomId, err: e.message }, "Failed to fetch hot messages");
  }

  const hotCursorFiltered = cursor ? hotMsgs.filter(m => m.id < cursor) : hotMsgs;

  // Fetch from the cold zone (cursor paging) - count = remaining quota
  const hotUsed = Math.min(hotCursorFiltered.length, safeLimit);
  const coldLimit = safeLimit - hotUsed;
  const conditions = [eq(coldMessages.roomId, roomId)];
  if (cursor) conditions.push(sql`${coldMessages.id} < ${cursor}`);
  let coldMsgs: any[] = [];
  if (coldLimit > 0) {
    coldMsgs = await db.select().from(coldMessages)
      .where(and(...conditions))
      .orderBy(sql`${coldMessages.id} DESC`)
      .limit(coldLimit);
  }

  // Merge and sort
  const all = [...hotCursorFiltered, ...coldMsgs].sort((a, b) => b.id.localeCompare(a.id));
  const items = all.slice(0, safeLimit).map(sanitizeMessage);
  return {
    items,
    cursor: items.length === safeLimit ? items[items.length - 1]?.id : undefined,
    hasMore: items.length === safeLimit,
  };
}

// ═══ Create room ═══
export async function createRoom(type: string, createdBy: string, name?: string, memberIds?: string[]) {
  const id = genId();
  const now = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(rooms).values({ id, type, name: name || null, creatorId: createdBy, createdAt: now });
      await tx.insert(roomMembers).values({ id: genId(), roomId: id, userId: createdBy, joinedAt: now });
      if (memberIds && memberIds.length > 0) {
        const uniqueIds = [...new Set(memberIds)].filter(uid => uid && typeof uid === "string" && uid !== createdBy);
        if (uniqueIds.length > 0) {
          await tx.insert(roomMembers).values(
            uniqueIds.map(uid => ({ id: genId(), roomId: id, userId: uid, joinedAt: now }))
          ).onConflictDoNothing();
        }
      }
    });
  } catch (e: any) {
    log.error({ err: e, roomId: id }, "createRoom transaction failed");
    throw e;
  }
  return { id, type, name: name || null, creatorId: createdBy, createdAt: now };
}

// ═══ Find an existing direct room between two users ═══
export async function findDirectRoom(a: string, b: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT rm1.room_id AS id FROM room_members rm1
    JOIN room_members rm2 ON rm1.room_id = rm2.room_id
    JOIN rooms r ON r.id = rm1.room_id
    WHERE r.type = 'direct' AND rm1.user_id = ${a} AND rm2.user_id = ${b}
    LIMIT 1
  `);
  const row = rows[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

// ═══ Create direct room (Redis lock guarantees concurrency idempotency: one room per user pair) ═══
export async function createDirectRoom(a: string, b: string) {
  const [u1, u2] = [a, b].sort();
  const lockKey = `lock:direct:${u1}:${u2}`;
  let locked = false;
  for (let i = 0; i < 25; i++) {
    try {
      const ok = await redis.set(lockKey, "1", "EX", 8, "NX");
      if (ok === "OK") { locked = true; break; }
    } catch (e: any) {
      log.warn({ err: e.message }, "createDirectRoom lock query failed, retrying");
    }
    await new Promise(r => setTimeout(r, 200));
  }
  if (!locked) throw new Error("concurrent conflict, please retry");
  try {
    const existing = await findDirectRoom(u1, u2);
    if (existing) {
      const detail = await getRoomDetail(existing);
      if (detail) return detail;
      return { id: existing, type: "direct", name: null, creatorId: a, createdAt: Date.now() };
    }
    return await createRoom("direct", a, undefined, [b]);
  } finally {
    if (locked) redis.del(lockKey).catch(() => {});
  }
}

// ═══ Periodic archiver: check and archive expired hot messages every 30 seconds ═══
const ARCHIVE_INTERVAL = 30_000;

export function startArchiver(): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      let cursor = "0";
      let scanned = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "hot:room:*", "COUNT", 50);
        cursor = nextCursor;
        scanned += keys.length;
        const now = Date.now();
        for (const roomKey of keys) {
          try {
            const msgIds = await redis.lrange(roomKey, 0, -1);
            for (const msgId of msgIds) {
              try {
                const raw = await redis.get(`hot:msg:${msgId}`);
                if (!raw) continue;
                const msg = JSON.parse(raw);
                if (now - msg.sentAt >= FIVE_MIN) {
                  await archiveMessage(msg);
                }
              } catch (e) {
                log.error({ err: e, msgId }, "Archive msg failed");
              }
            }
          } catch (e: any) {
            log.warn({ roomKey, err: e.message }, "Archiver: failed to process room");
          }
        }
      } while (cursor !== "0");
      if (scanned > 0) log.debug({ scanned }, "Archiver cycle completed");
    } catch (e) {
      log.error({ err: e }, "Archiver error");
    }
  }, ARCHIVE_INTERVAL);
}

// ═══ Admin: Get messages (bypasses membership check + hot/cold merge) ═══
export async function getMessagesAdmin(roomId: string, cursor?: string, limit = 30) {
  const safeLimit = Math.max(1, Math.min(limit, 100));

  let hotMsgs: any[] = [];
  try {
    const hotIds = await redis.lrange(`hot:room:${roomId}`, 0, -1);
    if (hotIds.length > 0) {
      const pipeline = redis.pipeline();
      for (const id of hotIds) { pipeline.get(`hot:msg:${id}`); }
      const results = await pipeline.exec();
      if (results) {
        for (const [err, raw] of results) {
          if (!err && raw) hotMsgs.push(JSON.parse(raw as string));
        }
      }
      hotMsgs.sort((a, b) => b.id.localeCompare(a.id));
    }
  } catch (e: any) {
    log.warn({ roomId, err: e.message }, "Admin: failed to fetch hot messages");
  }

  const hotCursorFiltered = cursor ? hotMsgs.filter(m => m.id < cursor) : hotMsgs;

  const hotUsed = Math.min(hotCursorFiltered.length, safeLimit);
  const coldLimit = safeLimit - hotUsed;
  const conditions = [eq(coldMessages.roomId, roomId)];
  if (cursor) conditions.push(sql`${coldMessages.id} < ${cursor}`);
  let coldMsgs: any[] = [];
  if (coldLimit > 0) {
    coldMsgs = await db.select().from(coldMessages)
      .where(and(...conditions))
      .orderBy(sql`${coldMessages.id} DESC`)
      .limit(coldLimit);
  }

  const all = [...hotCursorFiltered, ...coldMsgs].sort((a, b) => b.id.localeCompare(a.id));
  const items = all.slice(0, safeLimit).map(sanitizeMessage);
  return {
    items,
    cursor: items.length === safeLimit ? items[items.length - 1]?.id : undefined,
    hasMore: items.length === safeLimit,
  };
}

// ═══ Admin: Delete room ═══
export async function deleteRoom(roomId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(coldMessages).where(eq(coldMessages.roomId, roomId));
      await tx.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
      await tx.delete(rooms).where(eq(rooms.id, roomId));
    });
  } catch (e: any) {
    log.error({ err: e, roomId }, "deleteRoom transaction failed, falling back");
    await db.delete(coldMessages).where(eq(coldMessages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
    await db.delete(rooms).where(eq(rooms.id, roomId));
  }
  // Also clean up the room's hot messages in Redis
  try {
    await redis.del(`hot:room:${roomId}`);
  } catch {}
}
