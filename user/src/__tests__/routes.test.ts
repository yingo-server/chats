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

vi.mock("../db.js", () => ({ db: mockDb }));
vi.mock("../schema.js", () => ({
  users: { id: "id", globalName: "global_name", appNames: "app_names", passwordHash: "password_hash", passwordSalt: "password_salt", createdAt: "created_at", lastOnlineAt: "last_online_at", permission: "permission", online: "online" },
  tokens: { id: "id", userId: "user_id", shortHash: "short_hash", longHash: "long_hash", tokenSalt: "token_salt", shortExpires: "short_expires", longExpires: "long_expires", scopes: "scopes", createdAt: "created_at", revokedAt: "revoked_at", lastUsedAt: "last_used_at" },
  apiKeys: { id: "id", userId: "user_id", keyHash: "key_hash", keySalt: "key_salt", prefix: "prefix", name: "name", scopes: "scopes", rateLimit: "rate_limit", expiresAt: "expires_at", createdAt: "created_at", lastUsedAt: "last_used_at", revokedAt: "revoked_at" },
}));

vi.mock("../core.js", () => ({
  registerUser: vi.fn().mockResolvedValue({ id: "1234567890000001", globalName: "testuser" }),
  loginUser: vi.fn().mockResolvedValue({ user_id: "1234567890000001", short_token: "a".repeat(32), long_token: "b".repeat(64), expires_in: 3600 }),
  verifyToken: vi.fn().mockImplementation(async (token: string) => {
    if (!/^[0-9a-f]{32}$/.test(token) && !/^[0-9a-f]{64}$/.test(token)) return null;
    return { userId: "1234567890000001", scopes: ["user:read", "chat:read", "chat:send"], permission: "admin" };
  }),
  createApiKey: vi.fn().mockResolvedValue({ key: "mk-" + "c".repeat(128), name: "testkey", expiresDays: 30, rateLimit: 100, prefix: "mk-" }),
  startTokenCleaner: vi.fn().mockReturnValue(setInterval(() => {}, 86400000)),
  resetAllOnline: vi.fn().mockResolvedValue(undefined),
}));

// ═══ Test routes ═══
describe("User Service routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = "dev-internal-key-change-in-production";
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
    expect(body.service).toBe("user-v1");
  });

  // ═══ Readiness check ═══
  it("GET /api/v1/ready checks the database", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("ok");
  });

  // ═══ Metrics ═══
  it("GET /api/v1/metrics returns 403 without admin auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/metrics" });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/metrics returns process info for an admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: { authorization: "Bearer " + "a".repeat(32) },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.memory).toBeDefined();
    expect(body.pid).toBeGreaterThan(0);
  });

  // ═══ Register ═══
  it("POST /api/v1/register succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/register",
      payload: { username: "newuser", password: "password123", app_id: "chat" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.user.id).toBeDefined();
  });

  it("POST /api/v1/register returns 400 for a username that is too short", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/register",
      payload: { username: "a", password: "password123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/register returns 400 when the password is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/register",
      payload: { username: "testuser" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══ Login ═══
  it("POST /api/v1/login succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/login",
      payload: { username: "testuser", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.short_token).toBeDefined();
    expect(body.long_token).toBeDefined();
  });

  it("POST /api/v1/login returns 401 when the username is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/login",
      payload: { password: "password123" },
    });
    expect(res.statusCode).toBe(401);
  });

  // ═══ Token verification ═══
  it("GET /api/v1/verify returns user info for a valid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/verify",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.user_id).toBeDefined();
    expect(body.scopes).toBeDefined();
  });

  it("GET /api/v1/verify returns 401 when the token is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/verify" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/verify returns 401 for an invalid format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/verify",
      headers: { authorization: "Bearer short" },
    });
    expect(res.statusCode).toBe(401);
  });

  // ═══ Internal user query (no auth) ═══
  it("GET /api/v1/internal/user/:id returns 403 without the key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/internal/user/1234567890000001",
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/internal/user/:id returns the user with the correct key", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "1234567890000001", globalName: "testuser", appNames: { chat: "testuser" } }]),
        }),
      }),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/internal/user/1234567890000001",
      headers: { "x-internal-key": "dev-internal-key-change-in-production" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it("GET /api/v1/internal/user/:id returns 403 with a wrong key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/internal/user/1234567890000001",
      headers: { "x-internal-key": "wrong-key" },
    });
    expect(res.statusCode).toBe(403);
  });

  // ═══ API Key ═══
  it("POST /api/v1/api-keys creates a key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { name: "testkey", scopes: ["chat:read"], expires_days: 30 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(/^mk-/);
  });

  it("POST /api/v1/api-keys returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      payload: { name: "testkey", scopes: ["chat:read"], expires_days: 30 },
    });
    expect(res.statusCode).toBe(401);
  });
});
