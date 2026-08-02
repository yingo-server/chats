import type { FastifyInstance } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import { sendMessage, getMessages, getMessagesAdmin, createRoom, deleteRoom, removeRoomForUser, getUserRooms, getRoomDetail, getRoomMembers, isRoomMember, createDirectRoom, db } from "./core.js";
import { verifyToken, fetchUser, secureFetch, searchUsers } from "./api.js";
import { createClient } from "./redis.js";
import { rooms, roomMembers, coldMessages } from "./schema.js";
import { randomBytes } from "node:crypto";

const redis = createClient();
const USER_SVC = (process.env.USER_SERVICE_URL || "http://localhost:9000").trim().replace(/\/+$/, "");

let broadcast: ((roomId: string, msg: any) => void) | undefined;
export function setBroadcast(fn: (roomId: string, msg: any) => void) { broadcast = fn; }

function requireString(body: any, field: string, min: number, max: number): string {
  if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
  if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} chars`);
  return body[field];
}

function parseLimit(raw: any): number | null {
  if (raw === undefined || raw === null) return 30;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1 || n > 100) return null;
  return n;
}

async function requireAdmin(req: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = await verifyToken(auth.slice(7));
  if (!payload || payload.permission !== "admin") return null;
  return payload;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ═══ Login proxy (forwards to User Service) ═══
  app.post("/api/v1/login", async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body || typeof body.username !== "string" || typeof body.password !== "string")
        return reply.status(400).send({ ok: false, error: "username and password required" });
      const fwdHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const res = await secureFetch(`${USER_SVC}/api/v1/login`, {
        method: "POST",
        headers: fwdHeaders,
        body: JSON.stringify({ username: body.username, password: body.password }),
      });
      const data = await res.json();
      return reply.status(res.status).send(data);
    } catch (e: any) { return reply.status(502).send({ ok: false, error: "user service unreachable" }); }
  });

  // ═══ REST rooms ═══
  app.post("/api/v1/rooms/direct", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { targetUserId } = req.body as any;
    if (!targetUserId || typeof targetUserId !== "string") return reply.status(400).send({ ok: false, error: "targetUserId required" });
    if (targetUserId === u.userId) return reply.status(400).send({ ok: false, error: "cannot chat with self" });
    try {
      const room = await createDirectRoom(u.userId, targetUserId);
      return reply.status(201).send({ ok: true, room });
    } catch (e: any) {
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });

  app.post("/api/v1/rooms/group", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { name, memberIds } = req.body as any;
    if (name && typeof name !== "string") return reply.status(400).send({ ok: false, error: "name must be string" });
    if (memberIds && !Array.isArray(memberIds)) return reply.status(400).send({ ok: false, error: "memberIds must be array" });
    if (memberIds && memberIds.length > 100) return reply.status(400).send({ ok: false, error: "memberIds max 100" });
    const room = await createRoom("group", u.userId, name, memberIds);
    return reply.status(201).send({ ok: true, room });
  });

  app.get("/api/v1/rooms/:id/messages", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { id } = req.params as any;
    const { cursor, limit } = req.query as any;
    const safeLimit = parseLimit(limit);
    if (safeLimit === null) return reply.status(400).send({ ok: false, error: "limit must be 1-100" });
    try {
      const result = await getMessages(id, u.userId, cursor, safeLimit);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      const code = e.message === "not a room member" ? 403 : 500;
      return reply.status(code).send({ ok: false, error: e.message });
    }
  });

  // ═══ Get current user's room list ═══
  app.get("/api/v1/rooms", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    try {
      const rooms = await getUserRooms(u.userId);
      return reply.send({ ok: true, rooms });
    } catch (e: any) {
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });

  // ═══ User deletes/leaves a room ═══
  app.delete("/api/v1/rooms/:id", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    try {
      const result = await removeRoomForUser(id, u.userId);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      const code = e.message === "room not found" ? 404 : e.message === "not a room member" ? 403 : 500;
      return reply.status(code).send({ ok: false, error: e.message });
    }
  });

  // ═══ Search users (proxy to User Service) ═══
  app.get("/api/v1/users/search", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const query = String((req.query as any).query || "").trim();
    if (query.length < 1) return reply.send({ ok: true, users: [] });
    const result = await searchUsers(t!, query);
    return reply.send(result);
  });

  // ═══ Get single room detail ═══
  app.get("/api/v1/rooms/:id", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { id } = req.params as any;
    try {
      const room = await getRoomDetail(id);
      if (!room) return reply.status(404).send({ ok: false, error: "room not found" });
      const member = await isRoomMember(id, u.userId);
      if (!member) return reply.status(403).send({ ok: false, error: "not a room member" });
      return reply.send({ ok: true, room });
    } catch (e: any) {
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });

  // ═══ Get room members ═══
  app.get("/api/v1/rooms/:id/members", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { id } = req.params as any;
    try {
      const room = await getRoomDetail(id);
      if (!room) return reply.status(404).send({ ok: false, error: "room not found" });
      const member = await isRoomMember(id, u.userId);
      if (!member) return reply.status(403).send({ ok: false, error: "not a room member" });
      const members = await getRoomMembers(id);
      return reply.send({ ok: true, members, total: members.length });
    } catch (e: any) {
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });

  // ═══ Health check (liveness) ═══
  app.get("/api/v1/health", async () => ({ ok: true, service: "chat-v1", uptime: process.uptime() }));

  // ═══ Readiness check ═══
  app.get("/api/v1/ready", async () => {
    let dbOk = false; let redisOk = false;
    try { await db.execute(sql`SELECT 1`); dbOk = true; } catch {}
    try { await redis.ping(); redisOk = true; } catch {}
    return { ok: dbOk && redisOk, service: "chat-v1", db: dbOk ? "ok" : "error", redis: redisOk ? "ok" : "error" };
  });

  // ═══ Metrics ═══
  app.get("/api/v1/metrics", async () => ({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
  }));

  // ═══ Admin: Room list ═══
  app.get("/api/v1/admin/rooms", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    try {
      const rows = await db.select().from(rooms).limit(200);
      return reply.send({ ok: true, rooms: rows, total: rows.length });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Room members ═══
  app.get("/api/v1/admin/rooms/:id/members", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    try {
      const rows = await db.select().from(roomMembers).where(eq(roomMembers.roomId, id));
      return reply.send({ ok: true, members: rows, total: rows.length });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Message stats ═══
  app.get("/api/v1/admin/stats", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    try {
      const [roomCount] = await db.select({ count: sql<number>`count(*)::bigint` }).from(rooms);
      const [memberCount] = await db.select({ count: sql<number>`count(*)::bigint` }).from(roomMembers);
      const [msgCount] = await db.select({ count: sql<number>`count(*)::bigint` }).from(coldMessages);
      const onlineKeys: string[] = [];
      let scanCursor = "0";
      do {
        const [next, keys] = await redis.scan(scanCursor, "MATCH", "online:*", "COUNT", 100);
        scanCursor = next;
        onlineKeys.push(...keys);
      } while (scanCursor !== "0");
      return reply.send({
        ok: true,
        stats: {
          rooms: roomCount?.count ?? 0,
          members: memberCount?.count ?? 0,
          coldMessages: msgCount?.count ?? 0,
          onlineUsers: onlineKeys.length,
        },
      });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Create direct room (specified both users, admin not a member) ═══
  app.post("/api/v1/admin/rooms/direct", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { userA, userB } = req.body as any;
    if (!userA || !userB || typeof userA !== "string" || typeof userB !== "string")
      return reply.status(400).send({ ok: false, error: "userA and userB required" });
    if (userA === userB) return reply.status(400).send({ ok: false, error: "cannot chat with self" });
    try {
      // Reuse the idempotent creation logic: one room per user pair
      const room = await createDirectRoom(userA, userB);
      return reply.status(201).send({ ok: true, room });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: View room messages (bypasses membership check) ═══
  app.get("/api/v1/admin/rooms/:id/messages", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    const { cursor, limit } = req.query as any;
    const safeLimit = parseLimit(limit);
    if (safeLimit === null) return reply.status(400).send({ ok: false, error: "limit must be 1-100" });
    try {
      const result = await getMessagesAdmin(id, cursor as string, safeLimit);
      return reply.send({ ok: true, ...result });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Send message on behalf (bypasses membership check) ═══
  app.post("/api/v1/admin/rooms/:id/messages", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    const { senderId, content, type } = req.body as any;
    if (!senderId || typeof senderId !== "string") return reply.status(400).send({ ok: false, error: "senderId required" });
    if (!content || typeof content !== "string") return reply.status(400).send({ ok: false, error: "content required" });
    try {
      const msg = await sendMessage(id, senderId, content, type || "text", req.ip, true);
      broadcast?.(id, msg);
      return reply.status(201).send({ ok: true, message: msg });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Create group (specified creator, admin not a member) ═══
  app.post("/api/v1/admin/rooms/group", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { name, creatorId, memberIds } = req.body as any;
    if (!creatorId || typeof creatorId !== "string") return reply.status(400).send({ ok: false, error: "creatorId required" });
    if (!name || typeof name !== "string") return reply.status(400).send({ ok: false, error: "name required" });
    try {
      const room = await createRoom("group", creatorId, name, memberIds);
      return reply.status(201).send({ ok: true, room });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Add room member ═══
  app.post("/api/v1/admin/rooms/:id/members", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    const { userId } = req.body as any;
    if (!userId || typeof userId !== "string") return reply.status(400).send({ ok: false, error: "userId required" });
    try {
      const mid = Date.now().toString().slice(-10)+randomBytes(3).readUIntBE(0,3).toString().padStart(6,"0").slice(-6);
      await db.insert(roomMembers).values({ id: mid, roomId: id, userId, joinedAt: Date.now() }).onConflictDoNothing();
      return reply.status(201).send({ ok: true, roomId: id, userId });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ Admin: Remove room member ═══
  app.delete("/api/v1/admin/rooms/:roomId/members/:userId", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { roomId, userId } = req.params as any;
    try {
      await db.delete(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
      return reply.send({ ok: true, roomId, userId });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });

  // ═══ User sends message ═══
  app.post("/api/v1/rooms/:id/messages", async (req, reply) => {
    const t = req.headers.authorization?.slice(7);
    const u = await verifyToken(t || "");
    if (!u) return reply.status(401).send({ ok: false, error: "unauthorized" });
    const { id } = req.params as any;
    const { content, type } = req.body as any;
    if (!content || typeof content !== "string") return reply.status(400).send({ ok: false, error: "content required" });
    try {
      const msg = await sendMessage(id, u.userId, content, type || "text", req.ip);
      broadcast?.(id, msg);
      return reply.status(201).send({ ok: true, message: msg });
    } catch (e: any) {
      const code = e.message === "not a room member" ? 403 : e.message.includes("must be") ? 400 : 500;
      return reply.status(code).send({ ok: false, error: e.message });
    }
  });

  // ═══ Admin: Delete room ═══
  app.delete("/api/v1/admin/rooms/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!admin) return reply.status(403).send({ ok: false, error: "admin access required" });
    const { id } = req.params as any;
    if (typeof id !== "string" || id.length > 16) return reply.status(400).send({ ok: false, error: "invalid id" });
    try {
      const [r] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id)).limit(1);
      if (!r) return reply.status(404).send({ ok: false, error: "room not found" });
      await deleteRoom(id);
      return reply.send({ ok: true, deleted: id });
    } catch (e: any) { return reply.status(500).send({ ok: false, error: e.message }); }
  });
}
