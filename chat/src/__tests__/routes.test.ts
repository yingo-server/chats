import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { Buffer } from "node:buffer";

// ═══ Mock database and dependencies ═══
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
};

vi.mock("../redis.js", () => ({
  createClient: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue("PONG"),
    connect: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("../db.js", () => ({ db: mockDb }));
vi.mock("../schema.js", () => ({
  rooms: { id: "id", type: "type", name: "name", creatorId: "creator_id", createdAt: "created_at" },
  roomMembers: { roomId: "room_id", userId: "user_id", joinedAt: "joined_at" },
  coldMessages: { id: "id", roomId: "room_id", senderId: "sender_id", senderName: "sender_name", senderAppName: "sender_app_name", content: "content", type: "type", sentAt: "sent_at", senderIp: "sender_ip", recalled: "recalled", manuallyDeleted: "manually_deleted", autoDeleted: "auto_deleted", mediaId: "media_id", mediaType: "media_type" },
  media: { id: "id", mimeType: "mime_type", data: "data", size: "size", sha256: "sha256", ownerId: "owner_id", createdAt: "created_at" },
}));

const fakeMediaRow = {
  id: "1234567890000001",
  mimeType: "image/png",
  size: 4,
  sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ownerId: "1234567890000001",
  createdAt: 1,
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

vi.mock("../core.js", () => ({
  sendMessage: vi.fn().mockResolvedValue({ id: "1234567890000001", roomId: "room1", content: "hello" }),
  getMessages: vi.fn().mockResolvedValue({ items: [], cursor: undefined, hasMore: false }),
  getMessagesAdmin: vi.fn().mockResolvedValue({ items: [], cursor: undefined, hasMore: false }),
  createRoom: vi.fn().mockResolvedValue({ id: "1234567890000001", type: "direct", name: null }),
  createDirectRoom: vi.fn().mockResolvedValue({ id: "1234567890000001", type: "direct", name: null }),
  removeRoomForUser: vi.fn().mockResolvedValue({ action: "deleted" }),
  startArchiver: vi.fn().mockReturnValue(setInterval(() => {}, 30000)),
  isRoomMember: vi.fn().mockResolvedValue(true),
  createMedia: vi.fn().mockResolvedValue(fakeMediaRow),
  getMedia: vi.fn().mockResolvedValue(fakeMediaRow),
  deleteMedia: vi.fn().mockResolvedValue(fakeMediaRow),
  listMediaByOwner: vi.fn().mockResolvedValue([fakeMediaRow]),
  db: mockDb,
}));

vi.mock("../api.js", () => ({
  verifyToken: vi.fn().mockImplementation(async (token: string) => {
    if (!token || token === "invalid") return null;
    return { userId: "1234567890000001", scopes: ["user:read", "chat:read", "chat:send"] };
  }),
  fetchUser: vi.fn().mockResolvedValue({ name: "testuser", appName: "chat" }),
}));

// ═══ Test routes ═══
describe("Chat Service routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    const { registerRoutes } = await import("../routes.js");
    await registerRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // ═══ Health check ═══
  it("GET /api/v1/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("chat-v1");
  });

  // ═══ Readiness check ═══
  it("GET /api/v1/ready checks DB and Redis", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("ok");
    expect(body.redis).toBe("ok");
  });

  // ═══ Metrics ═══
  it("GET /api/v1/metrics returns process info", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/metrics" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.memory).toBeDefined();
    expect(body.pid).toBeGreaterThan(0);
  });

  // ═══ Create direct room ═══
  it("POST /api/v1/rooms/direct succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/direct",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { targetUserId: "1234567890000002" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.room.id).toBeDefined();
  });

  it("POST /api/v1/rooms/direct returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/direct",
      payload: { targetUserId: "1234567890000002" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/rooms/direct returns 400 when targetUserId is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/direct",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══ Create group room ═══
  it("POST /api/v1/rooms/group succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/group",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { name: "Test Group", memberIds: ["user1", "user2"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.room.id).toBeDefined();
  });

  it("POST /api/v1/rooms/group returns 400 when memberIds exceeds 100", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/group",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { name: "Big Group", memberIds: Array.from({ length: 101 }, (_, i) => `user${i}`) },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("memberIds max 100");
  });

  // ═══ Get message history ═══
  it("GET /api/v1/rooms/:id/messages succeeds", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/rooms/1234567890000001/messages",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it("GET /api/v1/rooms/:id/messages returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/rooms/1234567890000001/messages",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/rooms/:id/messages returns 400 for an invalid limit", async () => {
    const { getMessages } = await import("../core.js");
    (getMessages as any).mockResolvedValueOnce({ items: [], cursor: undefined, hasMore: false });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/rooms/1234567890000001/messages?limit=abc",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══ Delete / leave room ═══
  it("DELETE /api/v1/rooms/:id succeeds", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/rooms/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("deleted");
  });

  it("DELETE /api/v1/rooms/:id returns 401 without auth", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/v1/rooms/1234567890000001" });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/v1/rooms/:id returns 400 for an invalid id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/rooms/12345678901234567",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /api/v1/rooms/:id returns 403 when not a member", async () => {
    const { removeRoomForUser } = await import("../core.js");
    (removeRoomForUser as any).mockRejectedValueOnce(new Error("not a room member"));
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/rooms/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /api/v1/rooms/:id returns 404 when room is missing", async () => {
    const { removeRoomForUser } = await import("../core.js");
    (removeRoomForUser as any).mockRejectedValueOnce(new Error("room not found"));
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/rooms/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(404);
  });

  // ═══ Upload media ═══
  it("POST /api/v1/media returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      payload: { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/media returns 400 when dataUrl is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("dataUrl required");
  });

  it("POST /api/v1/media succeeds with a dataUrl", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.media.id).toBeDefined();
    expect(body.media.mimeType).toBe("image/png");
    expect(body.media.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("POST /api/v1/media returns 400 when upload is rejected", async () => {
    const { createMedia } = await import("../core.js");
    (createMedia as any).mockRejectedValueOnce(new Error("media too large, max 2097152 bytes"));
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══ List own media ═══
  it("GET /api/v1/media returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/media" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/media lists own media metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/media",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.media)).toBe(true);
    expect(body.media[0].id).toBeDefined();
    expect(body.media[0].dataUrl).toBeUndefined();
  });

  it("GET /api/v1/media returns 400 for an invalid limit", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/media?limit=abc",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══ Get media ═══
  it("GET /api/v1/media/:id returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/media/1234567890000001" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/media/:id returns media with dataUrl", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/media/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.media.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("GET /api/v1/media/:id returns 404 when media is missing", async () => {
    const { getMedia } = await import("../core.js");
    (getMedia as any).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/media/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/media/:id?raw=1 streams raw bytes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/media/1234567890000001?raw=1",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.payload.length).toBeGreaterThan(0);
  });

  // ═══ Delete media ═══
  it("DELETE /api/v1/media/:id returns 403 when not the owner", async () => {
    const { getMedia } = await import("../core.js");
    (getMedia as any).mockResolvedValueOnce({ ...fakeMediaRow, ownerId: "someone-else" });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/media/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /api/v1/media/:id returns 409 while referenced by messages", async () => {
    const { deleteMedia } = await import("../core.js");
    (deleteMedia as any).mockRejectedValueOnce(new Error("media is referenced by messages"));
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/media/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("DELETE /api/v1/media/:id succeeds for the owner", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/media/1234567890000001",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  // ═══ Message media filtering ═══
  it("GET /api/v1/rooms/:id/messages returns 400 for an invalid mediaType", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/rooms/1234567890000001/messages?mediaType=bogus",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/rooms/:id/messages accepts a valid mediaType filter", async () => {
    const { getMessages } = await import("../core.js");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/rooms/1234567890000001/messages?mediaType=image",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    expect((getMessages as any).mock.calls.some((c: any[]) => c[4] === "image")).toBe(true);
  });

  // ═══ Send message with media ═══
  it("POST /api/v1/rooms/:id/messages returns 400 when content and mediaId are both missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/1234567890000001/messages",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("content or mediaId required");
  });

  it("POST /api/v1/rooms/:id/messages succeeds with mediaId only", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/1234567890000001/messages",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { mediaId: "1234567890000001" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it("POST /api/v1/rooms/:id/messages returns 404 when the media is missing", async () => {
    const { sendMessage } = await import("../core.js");
    (sendMessage as any).mockRejectedValueOnce(new Error("media not found"));
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/rooms/1234567890000001/messages",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { mediaId: "1234567890000999" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/admin/media requires admin (403 for regular users)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/media?limit=abc",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(403);
  });
});
