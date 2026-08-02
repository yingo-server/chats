import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

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
  coldMessages: { id: "id", roomId: "room_id", senderId: "sender_id", senderName: "sender_name", senderAppName: "sender_app_name", content: "content", type: "type", sentAt: "sent_at", senderIp: "sender_ip", recalled: "recalled", manuallyDeleted: "manually_deleted", autoDeleted: "auto_deleted" },
}));

vi.mock("../core.js", () => ({
  sendMessage: vi.fn().mockResolvedValue({ id: "1234567890000001", roomId: "room1", content: "hello" }),
  getMessages: vi.fn().mockResolvedValue({ items: [], cursor: undefined, hasMore: false }),
  createRoom: vi.fn().mockResolvedValue({ id: "1234567890000001", type: "direct", name: null }),
  createDirectRoom: vi.fn().mockResolvedValue({ id: "1234567890000001", type: "direct", name: null }),
  startArchiver: vi.fn().mockReturnValue(setInterval(() => {}, 30000)),
  isRoomMember: vi.fn().mockResolvedValue(true),
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
});
