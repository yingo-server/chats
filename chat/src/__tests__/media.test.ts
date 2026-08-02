import { describe, it, expect } from "vitest";
import { parseDataUrl, classifyMedia, mediaToDataUrl, MEDIA_TYPES, MAX_MEDIA_BYTES } from "../utils.js";
import { Buffer } from "node:buffer";

// ═══ Test parseDataUrl (data URL validation + decode) ═══
describe("parseDataUrl", () => {
  it("decodes a valid image data URL", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const { mimeType, data } = parseDataUrl(`data:image/png;base64,${png}`);
    expect(mimeType).toBe("image/png");
    expect(data).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("decodes an audio data URL", () => {
    const { mimeType } = parseDataUrl(`data:audio/mpeg;base64,${Buffer.from("abc").toString("base64")}`);
    expect(mimeType).toBe("audio/mpeg");
  });

  it("rejects non-data-URL strings", () => {
    expect(() => parseDataUrl("https://example.com/a.png")).toThrow("invalid dataUrl");
    expect(() => parseDataUrl("not a url")).toThrow("invalid dataUrl");
    expect(() => parseDataUrl("")).toThrow("dataUrl must be a non-empty string");
  });

  it("rejects data URLs without base64 payload", () => {
    expect(() => parseDataUrl("data:image/png;base64,")).toThrow("invalid dataUrl");
  });

  it("rejects disallowed mime types", () => {
    const b64 = Buffer.from("x").toString("base64");
    expect(() => parseDataUrl(`data:font/woff2;base64,${b64}`)).toThrow("unsupported mime type");
    expect(() => parseDataUrl(`data:model/gltf-binary;base64,${b64}`)).toThrow("unsupported mime type");
  });

  it("accepts text/* attachments (classified as file)", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const { mimeType } = parseDataUrl(`data:text/plain;base64,${b64}`);
    expect(mimeType).toBe("text/plain");
    expect(classifyMedia(mimeType)).toBe("file");
  });

  it("rejects oversized media", () => {
    const big = Buffer.alloc(MAX_MEDIA_BYTES + 1).toString("base64");
    expect(() => parseDataUrl(`data:image/png;base64,${big}`)).toThrow("media too large");
  });

  it("rejects empty binary payload (zero bytes)", () => {
    expect(() => parseDataUrl("data:image/png;base64,A")).toThrow("media data is empty");
  });
});

// ═══ Test classifyMedia (coarse media category) ═══
describe("classifyMedia", () => {
  it("classifies image mime types", () => {
    expect(classifyMedia("image/png")).toBe("image");
    expect(classifyMedia("image/jpeg")).toBe("image");
    expect(classifyMedia("image/webp")).toBe("image");
  });

  it("classifies audio mime types", () => {
    expect(classifyMedia("audio/mpeg")).toBe("audio");
    expect(classifyMedia("audio/ogg")).toBe("audio");
    expect(classifyMedia("audio/webm")).toBe("audio");
  });

  it("classifies video mime types", () => {
    expect(classifyMedia("video/mp4")).toBe("video");
    expect(classifyMedia("video/webm")).toBe("video");
  });

  it("falls back to file for everything else", () => {
    expect(classifyMedia("application/pdf")).toBe("file");
    expect(classifyMedia("application/zip")).toBe("file");
  });
});

// ═══ Test mediaToDataUrl (binary -> data URL round trip) ═══
describe("mediaToDataUrl", () => {
  it("re-encodes raw bytes as a data URL", () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const url = mediaToDataUrl({ mimeType: "image/png", data });
    expect(url).toBe(`data:image/png;base64,${data.toString("base64")}`);
  });

  it("round-trips through parseDataUrl", () => {
    const data = Buffer.from("hello media", "utf-8");
    const url = mediaToDataUrl({ mimeType: "application/octet-stream", data });
    const parsed = parseDataUrl(url);
    expect(parsed.data).toEqual(data);
    expect(parsed.mimeType).toBe("application/octet-stream");
  });
});

// ═══ Test MEDIA_TYPES contract ═══
describe("MEDIA_TYPES", () => {
  it("contains the four coarse categories", () => {
    expect([...MEDIA_TYPES]).toEqual(["image", "audio", "video", "file"]);
  });
});
