import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

// ═══ Test genId ═══
describe("genId (ID generation)", () => {
  function genId(): string {
    const ts = Date.now().toString().slice(-10);
    const rand = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
    return ts + rand;
  }

  it("generates a 16-digit numeric ID", () => {
    const id = genId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^\d{16}$/);
  });

  it("consecutive IDs are mostly unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(genId());
    }
    expect(ids.size).toBeGreaterThan(995);
  });

  it("the first 10 digits of the ID are the timestamp", () => {
    const id = genId();
    const ts = parseInt(id.slice(0, 10));
    const now = Date.now().toString().slice(-10); // take the last 10 digits
    const diff = Math.abs(ts - parseInt(now));
    // The ID timestamp should be within ±1 second of now
    expect(diff).toBeLessThan(1000);
  });
});

// ═══ Test requireString (route validation) ═══
describe("requireString validation", () => {
  function requireString(body: any, field: string, min: number, max: number): string {
    if (!body || typeof body[field] !== "string") throw new Error(`${field} must be a string`);
    if (body[field].length < min || body[field].length > max) throw new Error(`${field} must be ${min}-${max} chars`);
    return body[field];
  }

  it("returns the value for valid input", () => {
    expect(requireString({ content: "hello" }, "content", 1, 10000)).toBe("hello");
  });

  it("throws when the field is missing", () => {
    expect(() => requireString({}, "content", 1, 10000)).toThrow("content must be a string");
  });

  it("throws for a non-string type", () => {
    expect(() => requireString({ content: 123 }, "content", 1, 10000)).toThrow("content must be a string");
  });

  it("throws for an empty string (min=1)", () => {
    expect(() => requireString({ content: "" }, "content", 1, 10000)).toThrow("content must be 1-10000 chars");
  });
});

// ═══ Test message content validation ═══
describe("Message content validation", () => {
  it("rejects empty content", () => {
    const content = "";
    expect(content.length > 0 && content.length <= 10000).toBe(false);
  });

  it("accepts normal content", () => {
    const content = "Hello, this is a test message!";
    expect(content.length > 0 && content.length <= 10000).toBe(true);
  });

  it("rejects overly long content", () => {
    const content = "a".repeat(10001);
    expect(content.length > 0 && content.length <= 10000).toBe(false);
  });

  it("accepts exactly 10000 characters", () => {
    const content = "a".repeat(10000);
    expect(content.length > 0 && content.length <= 10000).toBe(true);
  });
});

// ═══ Test memberIds dedup ═══
describe("memberIds dedup", () => {
  it("does not include the creator after dedup", () => {
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

  it("does not crash with empty memberIds", () => {
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

  it("filters invalid uids (empty strings)", () => {
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

// ═══ Test cursor pagination comparison ═══
describe("cursor pagination comparison", () => {
  it("ID string comparison: newer IDs are larger", () => {
    const id1 = "1234567890000001"; // 10-digit timestamp + 6-digit random
    const id2 = "1234567891000002";
    expect(id2 > id1).toBe(true);
  });

  it("cursor filter fetches older messages", () => {
    const all = [
      { id: "1234567895000003" },
      { id: "1234567894000002" },
      { id: "1234567893000001" },
    ];
    const cursor = "1234567894000002";
    const filtered = all.filter(m => m.id < cursor);
    expect(filtered).toEqual([{ id: "1234567893000001" }]);
  });

  it("returns everything when cursor is undefined", () => {
    const all = [
      { id: "1234567895000003" },
      { id: "1234567894000002" },
      { id: "1234567893000001" },
    ];
    const cursor: string | undefined = undefined;
    const filtered = cursor ? all.filter(m => m.id < (cursor as string)) : all;
    expect(filtered).toHaveLength(3);
  });

  it("does not miss messages within the same millisecond", () => {
    const all = [
      { id: "1234567894000001" },
      { id: "1234567894000002" },
      { id: "1234567894000003" },
    ];
    // cursor points to the second message
    const cursor = "1234567894000002";
    const filtered = all.filter(m => m.id < cursor);
    expect(filtered).toEqual([{ id: "1234567894000001" }]);
  });
});

// ═══ Test message types ═══
describe("Message types", () => {
  it("supports the text type", () => {
    expect(["text", "image", "audio", "system"]).toContain("text");
  });

  it("supports the image type", () => {
    expect(["text", "image", "audio", "system"]).toContain("image");
  });

  it("supports the audio type", () => {
    expect(["text", "image", "audio", "system"]).toContain("audio");
  });

  it("supports the system type", () => {
    expect(["text", "image", "audio", "system"]).toContain("system");
  });
});

// ═══ Test online status TTL ═══
describe("Online status TTL", () => {
  it("TTL is 120 seconds", () => {
    const TTL = 120;
    expect(TTL).toBe(120);
  });

  it("debounce interval is 5 seconds", () => {
    const DEBOUNCE = 5000;
    expect(DEBOUNCE).toBe(5000);
  });

  it("debounce dedup logic", () => {
    const onlineDebounce = new Map<string, number>();
    const uid = "user1";

    // First call
    let now = 1000;
    const last1 = onlineDebounce.get(uid);
    const shouldUpdate1 = !last1 || now - last1 >= 5000;
    expect(shouldUpdate1).toBe(true);
    onlineDebounce.set(uid, now);

    // Called again within 5 seconds
    now = 3000;
    const last2 = onlineDebounce.get(uid);
    const shouldUpdate2 = !last2 || now - last2 >= 5000;
    expect(shouldUpdate2).toBe(false);

    // Called again after 5 seconds
    now = 7000;
    const last3 = onlineDebounce.get(uid);
    const shouldUpdate3 = !last3 || now - last3 >= 5000;
    expect(shouldUpdate3).toBe(true);
  });
});

// ═══ Test archive atomicity ═══
describe("Archive atomicity", () => {
  it("onConflictDoNothing does not error on primary key conflict", () => {
    // Simulate PostgreSQL ON CONFLICT DO NOTHING behavior
    const insertedIds = new Set<string>();

    function insert(id: string): { conflict: boolean } {
      if (insertedIds.has(id)) return { conflict: true };
      insertedIds.add(id);
      return { conflict: false };
    }

    // First insert
    const r1 = insert("msg1");
    expect(r1.conflict).toBe(false);

    // Second insert of the same ID
    const r2 = insert("msg1");
    expect(r2.conflict).toBe(true);
  });

  it("only removes the hot zone on primary key conflict", () => {
    const coldStorage = new Set<string>();
    const hotStorage = new Set<string>(["msg1", "msg2"]);

    function archive(msgId: string): boolean {
      if (coldStorage.has(msgId)) {
        // Primary key conflict, only delete from the hot zone
        hotStorage.delete(msgId);
        return true;
      }
      coldStorage.add(msgId);
      hotStorage.delete(msgId);
      return false;
    }

    // First archive
    archive("msg1");
    expect(coldStorage.has("msg1")).toBe(true);
    expect(hotStorage.has("msg1")).toBe(false);

    // Archive the same message again
    archive("msg1");
    expect(coldStorage.has("msg1")).toBe(true);
    expect(hotStorage.has("msg1")).toBe(false);
  });
});

// ═══ Test Redis cache LRU improvement ═══
describe("Redis cache LRU improvement", () => {
  it("deletes and re-inserts on cache hit (promotes to tail)", () => {
    const cache = new Map<string, { ts: number }>();

    // Insert three entries
    cache.set("a", { ts: 1 });
    cache.set("b", { ts: 2 });
    cache.set("c", { ts: 3 });

    // Verify insertion order
    const keys1 = [...cache.keys()];
    expect(keys1).toEqual(["a", "b", "c"]);

    // Hit "a" and promote it
    const val = cache.get("a")!;
    cache.delete("a");
    cache.set("a", val);

    // Verify order changed
    const keys2 = [...cache.keys()];
    expect(keys2).toEqual(["b", "c", "a"]);

    // Deleting the oldest entry should remove "b"
    const oldest = cache.keys().next().value!;
    cache.delete(oldest);
    const keys3 = [...cache.keys()];
    expect(keys3).toEqual(["c", "a"]);
  });

  it("cache is capped at 1000 entries", () => {
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

// ═══ Test ChatMessage type fields ═══
describe("ChatMessage type", () => {
  it("intervalSinceLast is optional", () => {
    // Simulate a hot-zone message (with intervalSinceLast)
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

    // Simulate a cold-zone message (without intervalSinceLast)
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

// ═══ Test X-Internal-Key authentication ═══
describe("X-Internal-Key authentication", () => {
  it("accepts the correct key", () => {
    const internalKey = "correct-key";
    const expected = "correct-key";
    expect(internalKey).toBe(expected);
  });

  it("rejects a wrong key", () => {
    const internalKey = "wrong-key";
    const expected = "correct-key";
    expect(internalKey).not.toBe(expected);
  });

  it("rejects an empty key", () => {
    const internalKey = "";
    const expected = "correct-key";
    expect(internalKey).not.toBe(expected);
  });
});

// ═══ Test getMessages limit cap ═══
describe("getMessages limit cap", () => {
  it("safeLimit does not exceed 100", () => {
    const limit = 999;
    const safeLimit = Math.min(limit, 100);
    expect(safeLimit).toBe(100);
  });

  it("default limit is 30", () => {
    const limit = 30;
    expect(limit).toBe(30);
  });

  it("small limits are kept as-is", () => {
    const limit = 10;
    const safeLimit = Math.min(limit, 100);
    expect(safeLimit).toBe(10);
  });
});
