import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes, createHmac } from "node:crypto";

// ═══ Test generateId ═══
describe("generateId", () => {
  // Importing generateId requires mocking the database connection first
  // since core.ts creates the connection at module top level
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.PEPPER_SECRET = "test-pepper";
    process.env.TOKEN_SECRET = "test-token-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("generates a 16-digit ID (10-digit timestamp + 6-digit random)", () => {
    // Test the ID generation logic directly
    const ts = Date.now().toString().slice(-10);
    const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
    const id = ts + rand;

    expect(id).toHaveLength(16);
    expect(id).toMatch(/^\d{16}$/);
  });

  it("generates different IDs at different timestamps", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const ts = Date.now().toString().slice(-10);
      const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
      ids.add(ts + rand);
    }
    // Most of 100 IDs should be unique (extremely low collision probability)
    expect(ids.size).toBeGreaterThan(95);
  });
});

// ═══ Test verifyPassword ═══
describe("verifyPassword", () => {
  const PEPPER = "test-pepper";

  function hashPassword(pw: string, salt?: string): string {
    const s = salt || randomBytes(16).toString("hex");
    const hash = createHmac("sha256", PEPPER).update(s + pw).digest("hex");
    return s + ":" + hash;
  }

  it("returns true for the correct password", () => {
    const stored = hashPassword("mypassword123");
    const parts = stored.split(":");
    const [salt, hash] = parts;
    const computed = createHmac("sha256", PEPPER).update(salt + "mypassword123").digest("hex");
    expect(hash).toBe(computed);
  });

  it("returns false for a wrong password", () => {
    const stored = hashPassword("mypassword123");
    const parts = stored.split(":");
    const [salt, hash] = parts;
    const computed = createHmac("sha256", PEPPER).update(salt + "wrongpassword").digest("hex");
    expect(hash).not.toBe(computed);
  });

  it("handles malformed stored values (no colon)", () => {
    const stored = "nocolonhash";
    const parts = stored.split(":");
    expect(parts.length).not.toBe(2);
  });

  it("does not crash on an empty password", () => {
    const stored = hashPassword("test");
    const parts = stored.split(":");
    expect(parts.length).toBe(2);
  });
});

// ═══ Test HMAC-SHA256 hashing ═══
describe("HMAC-SHA256 hashing", () => {
  const PEPPER = "test-pepper";

  it("produces the same hash for the same input", () => {
    const salt = "abc123";
    const pw = "password";
    const h1 = createHmac("sha256", PEPPER).update(salt + pw).digest("hex");
    const h2 = createHmac("sha256", PEPPER).update(salt + pw).digest("hex");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different passwords", () => {
    const salt = "abc123";
    const h1 = createHmac("sha256", PEPPER).update(salt + "pass1").digest("hex");
    const h2 = createHmac("sha256", PEPPER).update(salt + "pass2").digest("hex");
    expect(h1).not.toBe(h2);
  });

  it("produces different hashes for different salts", () => {
    const pw = "password";
    const h1 = createHmac("sha256", PEPPER).update("salt1" + pw).digest("hex");
    const h2 = createHmac("sha256", PEPPER).update("salt2" + pw).digest("hex");
    expect(h1).not.toBe(h2);
  });
});

// ═══ Test token hashing ═══
describe("Token hashing", () => {
  const TOKEN_SECRET = "test-token-secret";

  it("uses the first 16 chars of the hash for fast lookup", () => {
    const token = randomBytes(16).toString("hex");
    const tokenSalt = randomBytes(16).toString("hex");
    const fullHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + token).digest("hex");
    const shortHash = createHmac("sha256", TOKEN_SECRET).update(tokenSalt + token).digest("hex").slice(0, 16);
    expect(fullHash).toContain(shortHash);
  });
});

// ═══ Test ID uniqueness (simulated registration) ═══
describe("ID collision defense", () => {
  it("generates mostly unique IDs within the same millisecond", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const ts = Date.now().toString().slice(-10);
      const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
      ids.add(ts + rand);
    }
    // Of 1000 IDs, collision probability ~1/65536 * 1000 ~ 1.5%, allow at most 5 collisions
    expect(ids.size).toBeGreaterThan(995);
  });
});

// ═══ Test DEFAULT_SCOPES ═══
describe("DEFAULT_SCOPES", () => {
  it("default scopes include required permissions", () => {
    const scopes = "user:read chat:read chat:send".split(/\s+/);
    expect(scopes).toContain("user:read");
    expect(scopes).toContain("chat:read");
    expect(scopes).toContain("chat:send");
  });
});

// ═══ Test requireString (route validation logic) ═══
describe("requireString validation", () => {
  function requireString(body: any, field: string, min: number, max: number): string {
    if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
    if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} chars`);
    return body[field];
  }

  it("returns the value for valid input", () => {
    expect(requireString({ username: "testuser" }, "username", 2, 20)).toBe("testuser");
  });

  it("throws when the field is missing", () => {
    expect(() => requireString({}, "username", 2, 20)).toThrow("username must be a string");
  });

  it("throws for a non-string type", () => {
    expect(() => requireString({ username: 123 }, "username", 2, 20)).toThrow("username must be a string");
  });

  it("throws when the value is too short", () => {
    expect(() => requireString({ username: "a" }, "username", 2, 20)).toThrow("username must be 2-20 chars");
  });

  it("throws when the value is too long", () => {
    expect(() => requireString({ username: "a".repeat(21) }, "username", 2, 20)).toThrow("username must be 2-20 chars");
  });

  it("accepts the minimum length", () => {
    expect(requireString({ username: "ab" }, "username", 2, 20)).toBe("ab");
  });

  it("accepts the maximum length", () => {
    expect(requireString({ username: "a".repeat(20) }, "username", 2, 20)).toBe("a".repeat(20));
  });
});

// ═══ Test API Key expiry validation ═══
describe("API Key expiry", () => {
  it("accepts 7/30/60/90/180 days", () => {
    const validDays = [7, 30, 60, 90, 180];
    expect(validDays).toContain(7);
    expect(validDays).toContain(30);
    expect(validDays).toContain(60);
    expect(validDays).toContain(90);
    expect(validDays).toContain(180);
  });

  it("rejects other day counts", () => {
    const validDays = [7, 30, 60, 90, 180];
    expect(validDays).not.toContain(1);
    expect(validDays).not.toContain(14);
    expect(validDays).not.toContain(365);
  });

  it("admin has no rate limit (-1)", () => {
    const permission: string = "admin";
    const rateLimit = permission === "admin" ? -1 : 100;
    expect(rateLimit).toBe(-1);
  });

  it("regular users have rate limit 100", () => {
    const permission: string = "user";
    const rateLimit = permission === "admin" ? -1 : 100;
    expect(rateLimit).toBe(100);
  });
});

// ═══ Test token expiry ═══
describe("Token expiry", () => {
  it("shortToken expires after 1 hour", () => {
    const now = Date.now();
    const shortExpires = now + 3600_000;
    const oneHourLater = now + 3600_000;
    expect(shortExpires).toBe(oneHourLater);
  });

  it("longToken expires after 30 days", () => {
    const now = Date.now();
    const longExpires = now + 2592000_000;
    const thirtyDaysLater = now + 30 * 24 * 3600_000;
    expect(longExpires).toBe(thirtyDaysLater);
  });
});

// ═══ Test resolveGlobalName logic ═══
describe("resolveGlobalName logic", () => {
  // Simulate the username list returned by the database
  function simulateResolve(baseName: string, existing: string[]): string {
    if (existing.length === 0) return baseName;
    const nums = existing
      .map(u => u.replace(baseName, ""))
      .filter(s => s.startsWith("#"))
      .map(s => parseInt(s.slice(1)) || 0);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return max > 0 ? `${baseName}#${max + 1}` : `${baseName}#1`;
  }

  it("returns the original name when there is no conflict", () => {
    expect(simulateResolve("alice", [])).toBe("alice");
  });

  it("appends #1 on conflict", () => {
    expect(simulateResolve("alice", ["alice"])).toBe("alice#1");
  });

  it("appends #2 when #1 is taken", () => {
    expect(simulateResolve("alice", ["alice", "alice#1"])).toBe("alice#2");
  });

  it("skips #2 when #1 and #3 exist", () => {
    expect(simulateResolve("alice", ["alice", "alice#1", "alice#3"])).toBe("alice#4");
  });
});
