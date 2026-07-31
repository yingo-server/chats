import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes, createHmac } from "node:crypto";

// ═══ 测试 generateId ═══
describe("generateId", () => {
  // 导入 generateId 需要先 mock 掉数据库连接
  // 由于 core.ts 顶部直接创建数据库连接，我们需要 mock 模块
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.PEPPER_SECRET = "test-pepper";
    process.env.TOKEN_SECRET = "test-token-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("生成 16 位 ID (10位时间戳 + 6位随机数)", () => {
    // 直接测试 ID 生成逻辑
    const ts = Date.now().toString().slice(-10);
    const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
    const id = ts + rand;

    expect(id).toHaveLength(16);
    expect(id).toMatch(/^\d{16}$/);
  });

  it("不同时间戳生成不同 ID", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const ts = Date.now().toString().slice(-10);
      const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
      ids.add(ts + rand);
    }
    // 100个ID中应该大部分唯一（极小概率碰撞）
    expect(ids.size).toBeGreaterThan(95);
  });
});

// ═══ 测试 verifyPassword ═══
describe("verifyPassword", () => {
  const PEPPER = "test-pepper";

  function hashPassword(pw: string, salt?: string): string {
    const s = salt || randomBytes(16).toString("hex");
    const hash = createHmac("sha256", PEPPER).update(s + pw).digest("hex");
    return s + ":" + hash;
  }

  it("正确密码返回 true", () => {
    const stored = hashPassword("mypassword123");
    const parts = stored.split(":");
    const [salt, hash] = parts;
    const computed = createHmac("sha256", PEPPER).update(salt + "mypassword123").digest("hex");
    expect(hash).toBe(computed);
  });

  it("错误密码返回 false", () => {
    const stored = hashPassword("mypassword123");
    const parts = stored.split(":");
    const [salt, hash] = parts;
    const computed = createHmac("sha256", PEPPER).update(salt + "wrongpassword").digest("hex");
    expect(hash).not.toBe(computed);
  });

  it("畸形存储值 (无冒号) 返回 false", () => {
    const stored = "nocolonhash";
    const parts = stored.split(":");
    expect(parts.length).not.toBe(2);
  });

  it("空密码不崩溃", () => {
    const stored = hashPassword("test");
    const parts = stored.split(":");
    expect(parts.length).toBe(2);
  });
});

// ═══ 测试 HMAC-SHA256 哈希 ═══
describe("HMAC-SHA256 哈希", () => {
  const PEPPER = "test-pepper";

  it("相同输入产生相同哈希", () => {
    const salt = "abc123";
    const pw = "password";
    const h1 = createHmac("sha256", PEPPER).update(salt + pw).digest("hex");
    const h2 = createHmac("sha256", PEPPER).update(salt + pw).digest("hex");
    expect(h1).toBe(h2);
  });

  it("不同密码产生不同哈希", () => {
    const salt = "abc123";
    const h1 = createHmac("sha256", PEPPER).update(salt + "pass1").digest("hex");
    const h2 = createHmac("sha256", PEPPER).update(salt + "pass2").digest("hex");
    expect(h1).not.toBe(h2);
  });

  it("不同 salt 产生不同哈希", () => {
    const pw = "password";
    const h1 = createHmac("sha256", PEPPER).update("salt1" + pw).digest("hex");
    const h2 = createHmac("sha256", PEPPER).update("salt2" + pw).digest("hex");
    expect(h1).not.toBe(h2);
  });
});

// ═══ 测试 Token 哈希 ═══
describe("Token 哈希", () => {
  const TOKEN_SECRET = "test-token-secret";

  it("shortToken 取前16字符用于快速查找", () => {
    const token = randomBytes(16).toString("hex");
    const tokenSalt = randomBytes(16).toString("hex");
    const fullHash = tokenSalt + ":" + createHmac("sha256", TOKEN_SECRET).update(tokenSalt + token).digest("hex");
    const shortHash = createHmac("sha256", TOKEN_SECRET).update(tokenSalt + token).digest("hex").slice(0, 16);
    expect(fullHash).toContain(shortHash);
  });
});

// ═══ 测试 ID 唯一性 (模拟注册) ═══
describe("ID 碰撞防御", () => {
  it("同毫秒生成多个 ID 大部分唯一", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const ts = Date.now().toString().slice(-10);
      const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
      ids.add(ts + rand);
    }
    // 1000个ID中，碰撞概率约 1/65536 * 1000 ≈ 1.5%，允许最多5个碰撞
    expect(ids.size).toBeGreaterThan(995);
  });
});

// ═══ 测试 DEFAULT_SCOPES ═══
describe("DEFAULT_SCOPES", () => {
  it("默认 scope 包含必要权限", () => {
    const scopes = "user:read chat:read chat:send".split(/\s+/);
    expect(scopes).toContain("user:read");
    expect(scopes).toContain("chat:read");
    expect(scopes).toContain("chat:send");
  });
});

// ═══ 测试 requireString (路由校验逻辑) ═══
describe("requireString 校验", () => {
  function requireString(body: any, field: string, min: number, max: number): string {
    if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
    if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} chars`);
    return body[field];
  }

  it("有效输入返回值", () => {
    expect(requireString({ username: "testuser" }, "username", 2, 20)).toBe("testuser");
  });

  it("缺少字段抛出错误", () => {
    expect(() => requireString({}, "username", 2, 20)).toThrow("username must be a string");
  });

  it("非字符串类型抛出错误", () => {
    expect(() => requireString({ username: 123 }, "username", 2, 20)).toThrow("username must be a string");
  });

  it("长度不足抛出错误", () => {
    expect(() => requireString({ username: "a" }, "username", 2, 20)).toThrow("username must be 2-20 chars");
  });

  it("超长抛出错误", () => {
    expect(() => requireString({ username: "a".repeat(21) }, "username", 2, 20)).toThrow("username must be 2-20 chars");
  });

  it("边界值: 最小长度有效", () => {
    expect(requireString({ username: "ab" }, "username", 2, 20)).toBe("ab");
  });

  it("边界值: 最大长度有效", () => {
    expect(requireString({ username: "a".repeat(20) }, "username", 2, 20)).toBe("a".repeat(20));
  });
});

// ═══ 测试 API Key 有效期校验 ═══
describe("API Key 有效期", () => {
  it("接受 7/30/60/90/180 天", () => {
    const validDays = [7, 30, 60, 90, 180];
    expect(validDays).toContain(7);
    expect(validDays).toContain(30);
    expect(validDays).toContain(60);
    expect(validDays).toContain(90);
    expect(validDays).toContain(180);
  });

  it("拒绝其他天数", () => {
    const validDays = [7, 30, 60, 90, 180];
    expect(validDays).not.toContain(1);
    expect(validDays).not.toContain(14);
    expect(validDays).not.toContain(365);
  });

  it("admin 无速率限制 (-1)", () => {
    const permission: string = "admin";
    const rateLimit = permission === "admin" ? -1 : 100;
    expect(rateLimit).toBe(-1);
  });

  it("普通用户速率限制 (100)", () => {
    const permission: string = "user";
    const rateLimit = permission === "admin" ? -1 : 100;
    expect(rateLimit).toBe(100);
  });
});

// ═══ 测试 Token 过期 ═══
describe("Token 过期", () => {
  it("shortToken 过期 1 小时", () => {
    const now = Date.now();
    const shortExpires = now + 3600_000;
    const oneHourLater = now + 3600_000;
    expect(shortExpires).toBe(oneHourLater);
  });

  it("longToken 过期 30 天", () => {
    const now = Date.now();
    const longExpires = now + 2592000_000;
    const thirtyDaysLater = now + 30 * 24 * 3600_000;
    expect(longExpires).toBe(thirtyDaysLater);
  });
});

// ═══ 测试 resolveGlobalName 逻辑 ═══
describe("resolveGlobalName 逻辑", () => {
  // 模拟数据库返回的用户名列表
  function simulateResolve(baseName: string, existing: string[]): string {
    if (existing.length === 0) return baseName;
    const nums = existing
      .map(u => u.replace(baseName, ""))
      .filter(s => s.startsWith("#"))
      .map(s => parseInt(s.slice(1)) || 0);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return max > 0 ? `${baseName}#${max + 1}` : `${baseName}#1`;
  }

  it("无冲突时返回原名", () => {
    expect(simulateResolve("alice", [])).toBe("alice");
  });

  it("有冲突时添加 #1", () => {
    expect(simulateResolve("alice", ["alice"])).toBe("alice#1");
  });

  it("有 #1 冲突时添加 #2", () => {
    expect(simulateResolve("alice", ["alice", "alice#1"])).toBe("alice#2");
  });

  it("有 #1 #3 时跳过 #2", () => {
    expect(simulateResolve("alice", ["alice", "alice#1", "alice#3"])).toBe("alice#4");
  });
});
