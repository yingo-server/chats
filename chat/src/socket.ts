import type { Server, Socket } from "socket.io";
import { sendMessage, isRoomMember } from "./core.js";
import { verifyToken, checkRateLimit } from "./api.js";
import { createClient } from "./redis.js";

import pino from "pino";

function sanitizeMessage(msg: any) {
  const { senderIp, ...rest } = msg;
  return rest;
}

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-socket" });
const redis = createClient();

const onlineDebounce = new Map<string, number>();
// 每个用户当前连接的 socket 集合（多端在线：任一断开不下线）
const userSockets = new Map<string, Set<string>>();
function refreshOnline(uid: string) {
  const now = Date.now();
  const last = onlineDebounce.get(uid);
  if (last && now - last < 5000) return;
  onlineDebounce.set(uid, now);
  redis.set(`online:${uid}`, "1", "EX", 120).catch(() => {});
}

function trackSocket(uid: string, socketId: string) {
  let set = userSockets.get(uid);
  if (!set) { set = new Set(); userSockets.set(uid, set); }
  set.add(socketId);
}

function untrackSocket(uid: string, socketId: string) {
  const set = userSockets.get(uid);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(uid);
}

function isUserOnline(uid: string): boolean {
  return (userSockets.get(uid)?.size ?? 0) > 0;
}

// 定期清理过期的 debounce 记录，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [uid, ts] of onlineDebounce) {
    if (now - ts > 300_000) onlineDebounce.delete(uid);
  }
}, 60_000);

export async function verifySocketAuth(token: string): Promise<{ userId: string; scopes: string[] } | null> {
  return verifyToken(token);
}

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket) => {
    const uid = socket.data.userId as string;
    refreshOnline(uid);
    trackSocket(uid, socket.id);
    // 不再 io.emit — 不向所有客户端广播在线状态

    socket.on("v1:join", async ({ roomId }) => {
      refreshOnline(uid);
      if (!roomId || typeof roomId !== "string") return socket.emit("v1:error", { message: "invalid roomId" });
      try {
        const member = await isRoomMember(roomId, uid);
        if (!member) return socket.emit("v1:error", { message: "not a room member" });
        socket.join(roomId);
        // 加入房间后，向该房间所有成员广播此用户在线
        io.in(roomId).emit("v1:online", { userId: uid, online: true });
      } catch (e: any) {
        log.warn({ uid, roomId, err: e.message }, "v1:join failed");
        socket.emit("v1:error", { message: "join failed" });
      }
    });

    socket.on("v1:leave", ({ roomId }) => {
      refreshOnline(uid);
      if (!roomId || typeof roomId !== "string") return;
      socket.leave(roomId);
      // 离开房间后，向该房间所有成员广播此用户离线
      io.in(roomId).emit("v1:online", { userId: uid, online: false });
    });

    socket.on("v1:message", async ({ roomId, content, type }, cb) => {
      try {
        refreshOnline(uid);
        if (!roomId || typeof roomId !== "string") throw new Error("invalid roomId");
        if (!content || typeof content !== "string") throw new Error("content required");
        // 速率限制: 60条/10秒
        const allowed = await checkRateLimit(`ratelimit:msg:${uid}`, 60, 10);
        if (!allowed) throw new Error("rate limit exceeded, slow down");
        const ip = socket.handshake.address;
        const msg = await sendMessage(roomId, uid, content, type || "text", ip);
        const safeMsg = sanitizeMessage(msg);
        io.to(roomId).emit("v1:message", safeMsg);
        if (cb) cb({ ok: true, msg: safeMsg });
      } catch (e: any) {
        const errMsg = e.message || "internal error";
        if (cb) cb({ ok: false, error: errMsg });
        else socket.emit("v1:error", { message: errMsg });
      }
    });

    socket.on("disconnect", () => {
      // 收集 disconnect 前的房间列表（disconnect 后 socket.rooms 已清空）
      const memberRooms: string[] = [];
      for (const room of socket.rooms) {
        if (room !== socket.id) memberRooms.push(room);
      }
      untrackSocket(uid, socket.id);
      if (!isUserOnline(uid)) {
        redis.del(`online:${uid}`).catch(() => {});
      }
      // 向该用户所有房间的成员广播离线
      const payload = { userId: uid, online: false };
      for (const roomKey of memberRooms) {
        io.in(roomKey).emit("v1:online", payload);
      }
    });
  });
}
