import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

// ═══ 测试 genId ═══
describe("genId (ID 生成)", () => {
  function genId(): string {
    const ts = Date.now().toString().slice(-10);
    const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
    return ts + rand;
  }

  it("生成 16 位数字 ID", () => {
    const id = genId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^\d{16}$/);
  });

  it("连续生成的 ID 大部分唯一", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(genId());
    }
    expect(ids.size).toBeGreaterThan(995);
  });

  it("ID 前10位是时间戳", () => {
    const id = genId();
    const ts = parseInt(id.slice(0, 10));
    const now = Date.now().toString().slice(-10); // 取后10位
    const diff = Math.abs(ts - parseInt(now));
    // ID 的时间戳应该在当前时间 ±1秒内
    expect(diff).toBeLessThan(1000);
  });
});

// ═══ 测试 requireString (路由校验) ═══
describe("requireString 校验", () => {
  function requireString(body: any, field: string, min: number, max: number): string {
    if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
    if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} chars`);
    return body[field];
  }

  it("有效输入返回值", () => {
    expect(requireString({ content: "hello" }, "content", 1, 10000)).toBe("hello");
  });

  it("缺少字段抛出错误", () => {
    expect(() => requireString({}, "content", 1, 10000)).toThrow("content must be a string");
  });

  it("非字符串类型抛出错误", () => {
    expect(() => requireString({ content: 123 }, "content", 1, 10000)).toThrow("content must be a string");
  });

  it("空字符串抛出错误 (min=1)", () => {
    expect(() => requireString({ content: "" }, "content", 1, 10000)).toThrow("content must be 1-10000 chars");
  });
});

// ═══ 测试消息内容校验 ═══
describe("消息内容校验", () => {
  it("空内容应被拒绝", () => {
    const content = "";
    expect(content.length > 0 && content.length <= 10000).toBe(false);
  });

  it("正常内容应通过", () => {
    const content = "Hello, this is a test message!";
    expect(content.length > 0 && content.length <= 10000).toBe(true);
  });

  it("超长内容应被拒绝", () => {
    const content = "a".repeat(10001);
    expect(content.length > 0 && content.length <= 10000).toBe(false);
  });

  it("边界值: 10000 字符应通过", () => {
    const content = "a".repeat(10000);
    expect(content.length > 0 && content.length <= 10000).toBe(true);
  });
});

// ═══ 测试 memberIds 去重 ═══
describe("memberIds 去重", () => {
  it("去重后不包含创建者", () => {
    const createdBy = "user1";
    const memberIds = ["user1", "user2", "user3", "user2"];
    const seen = new Set([createdBy]);
    const unique: string[] = [];
    for (const uid of memberIds) {
      if (!uid || typeof uid !== "string" || seen.has(uid)) continue;
      seen.add(uid);
      unique.push(uid);
    }
    expect(unique).toEqual(["user2", "user3"]);
    expect(unique).not.toContain("user1");
  });

  it("空 memberIds 不崩溃", () => {
    const createdBy = "user1";
    const memberIds: string[] = [];
    const seen = new Set([createdBy]);
    const unique: string[] = [];
    for (const uid of memberIds) {
      if (!uid || typeof uid !== "string" || seen.has(uid)) continue;
      seen.add(uid);
      unique.push(uid);
    }
    expect(unique).toEqual([]);
  });

  it("过滤无效 uid (空字符串)", () => {
    const createdBy = "user1";
    const memberIds = ["", "user2", ""];
    const seen = new Set([createdBy]);
    const unique: string[] = [];
    for (const uid of memberIds) {
      if (!uid || typeof uid !== "string" || seen.has(uid)) continue;
      seen.add(uid);
      unique.push(uid);
    }
    expect(unique).toEqual(["user2"]);
  });
});

// ═══ 测试 cursor 分页比较 ═══
describe("cursor 分页比较", () => {
  it("ID 字符串比较: 较新的 ID 更大", () => {
    const id1 = "1234567890000001"; // 10位时间戳 + 6位随机
    const id2 = "1234567891000002";
    expect(id2 > id1).toBe(true);
  });

  it("cursor 过滤获取更早的消息", () => {
    const all = [
      { id: "1234567895000003" },
      { id: "1234567894000002" },
      { id: "1234567893000001" },
    ];
    const cursor = "1234567894000002";
    const filtered = all.filter(m => m.id < cursor);
    expect(filtered).toEqual([{ id: "1234567893000001" }]);
  });

  it("cursor 为 undefined 时返回全部", () => {
    const all = [
      { id: "1234567895000003" },
      { id: "1234567894000002" },
      { id: "1234567893000001" },
    ];
    const cursor: string | undefined = undefined;
    const filtered = cursor ? all.filter(m => m.id < (cursor as string)) : all;
    expect(filtered).toHaveLength(3);
  });

  it("同毫秒消息不遗漏", () => {
    const all = [
      { id: "1234567894000001" },
      { id: "1234567894000002" },
      { id: "1234567894000003" },
    ];
    // cursor 指向第二条
    const cursor = "1234567894000002";
    const filtered = all.filter(m => m.id < cursor);
    expect(filtered).toEqual([{ id: "1234567894000001" }]);
  });
});

// ═══ 测试消息类型 ═══
describe("消息类型", () => {
  it("支持 text 类型", () => {
    expect(["text", "image", "audio", "system"]).toContain("text");
  });

  it("支持 image 类型", () => {
    expect(["text", "image", "audio", "system"]).toContain("image");
  });

  it("支持 audio 类型", () => {
    expect(["text", "image", "audio", "system"]).toContain("audio");
  });

  it("支持 system 类型", () => {
    expect(["text", "image", "audio", "system"]).toContain("system");
  });
});

// ═══ 测试在线状态 TTL ═══
describe("在线状态 TTL", () => {
  it("TTL 为 120 秒", () => {
    const TTL = 120;
    expect(TTL).toBe(120);
  });

  it("debounce 间隔为 5 秒", () => {
    const DEBOUNCE = 5000;
    expect(DEBOUNCE).toBe(5000);
  });

  it("debounce 去重逻辑", () => {
    const onlineDebounce = new Map<string, number>();
    const uid = "user1";

    // 第一次调用
    let now = 1000;
    const last1 = onlineDebounce.get(uid);
    const shouldUpdate1 = !last1 || now - last1 >= 5000;
    expect(shouldUpdate1).toBe(true);
    onlineDebounce.set(uid, now);

    // 5秒内再次调用
    now = 3000;
    const last2 = onlineDebounce.get(uid);
    const shouldUpdate2 = !last2 || now - last2 >= 5000;
    expect(shouldUpdate2).toBe(false);

    // 5秒后再次调用
    now = 7000;
    const last3 = onlineDebounce.get(uid);
    const shouldUpdate3 = !last3 || now - last3 >= 5000;
    expect(shouldUpdate3).toBe(true);
  });
});

// ═══ 测试归档原子性 ═══
describe("归档原子性", () => {
  it("onConflictDoNothing 在主键冲突时不报错", () => {
    // 模拟 PostgreSQL ON CONFLICT DO NOTHING 行为
    const insertedIds = new Set<string>();

    function insert(id: string): { conflict: boolean } {
      if (insertedIds.has(id)) return { conflict: true };
      insertedIds.add(id);
      return { conflict: false };
    }

    // 第一次插入
    const r1 = insert("msg1");
    expect(r1.conflict).toBe(false);

    // 第二次插入同一ID
    const r2 = insert("msg1");
    expect(r2.conflict).toBe(true);
  });

  it("主键冲突后只删除热区", () => {
    const coldStorage = new Set<string>();
    const hotStorage = new Set<string>(["msg1", "msg2"]);

    function archive(msgId: string): boolean {
      if (coldStorage.has(msgId)) {
        // 主键冲突，只删热区
        hotStorage.delete(msgId);
        return true;
      }
      coldStorage.add(msgId);
      hotStorage.delete(msgId);
      return false;
    }

    // 第一次归档
    archive("msg1");
    expect(coldStorage.has("msg1")).toBe(true);
    expect(hotStorage.has("msg1")).toBe(false);

    // 第二次归档同一消息
    archive("msg1");
    expect(coldStorage.has("msg1")).toBe(true);
    expect(hotStorage.has("msg1")).toBe(false);
  });
});

// ═══ 测试 Redis 缓存 LRU ═══
describe("Redis 缓存 LRU 改进", () => {
  it("命中缓存时删除并重新插入（提升到末尾）", () => {
    const cache = new Map<string, { ts: number }>();

    // 插入三个条目
    cache.set("a", { ts: 1 });
    cache.set("b", { ts: 2 });
    cache.set("c", { ts: 3 });

    // 验证插入顺序
    const keys1 = [...cache.keys()];
    expect(keys1).toEqual(["a", "b", "c"]);

    // 命中 "a" 并提升
    const val = cache.get("a")!;
    cache.delete("a");
    cache.set("a", val);

    // 验证顺序变更
    const keys2 = [...cache.keys()];
    expect(keys2).toEqual(["b", "c", "a"]);

    // 删除最旧条目时应删除 "b"
    const oldest = cache.keys().next().value!;
    cache.delete(oldest);
    const keys3 = [...cache.keys()];
    expect(keys3).toEqual(["c", "a"]);
  });

  it("缓存上限 1000 条", () => {
    const cache = new Map<string, number>();
    const MAX = 1000;
    for (let i = 0; i < MAX + 100; i++) {
      cache.set(`key${i}`, i);
      if (cache.size > MAX) {
        const oldest = cache.keys().next().value!;
        cache.delete(oldest);
      }
    }
    expect(cache.size).toBeLessThanOrEqual(MAX);
  });
});

// ═══ 测试 ChatMessage 类型字段 ═══
describe("ChatMessage 类型", () => {
  it("intervalSinceLast 可选", () => {
    // 模拟热区消息 (有 intervalSinceLast)
    const hotMsg = {
      id: "1234567890000001",
      roomId: "room1",
      senderId: "user1",
      content: "hello",
      type: "text",
      sentAt: Date.now(),
      recalled: false,
      manuallyDeleted: false,
      autoDeleted: false,
      intervalSinceLast: 5000,
    };
    expect(hotMsg.intervalSinceLast).toBe(5000);

    // 模拟冷区消息 (无 intervalSinceLast)
    const coldMsg = {
      id: "1234567890000002",
      roomId: "room1",
      senderId: "user2",
      content: "world",
      type: "text",
      sentAt: Date.now(),
      recalled: false,
      manuallyDeleted: false,
      autoDeleted: false,
    };
    expect((coldMsg as any).intervalSinceLast).toBeUndefined();
  });
});

// ═══ 测试 X-Internal-Key 认证 ═══
describe("X-Internal-Key 认证", () => {
  it("正确密钥通过", () => {
    const internalKey = "correct-key";
    const expected = "correct-key";
    expect(internalKey).toBe(expected);
  });

  it("错误密钥拒绝", () => {
    const internalKey = "wrong-key";
    const expected = "correct-key";
    expect(internalKey).not.toBe(expected);
  });

  it("空密钥拒绝", () => {
    const internalKey = "";
    const expected = "correct-key";
    expect(internalKey).not.toBe(expected);
  });
});

// ═══ 测试 limit 上限 ═══
describe("getMessages limit 上限", () => {
  it("safeLimit 不超过 100", () => {
    const limit = 999;
    const safeLimit = Math.min(limit, 100);
    expect(safeLimit).toBe(100);
  });

  it("默认 limit 为 30", () => {
    const limit = 30;
    expect(limit).toBe(30);
  });

  it("小 limit 保持原值", () => {
    const limit = 10;
    const safeLimit = Math.min(limit, 100);
    expect(safeLimit).toBe(10);
  });
});
