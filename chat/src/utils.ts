import { Buffer } from "node:buffer";

export function sanitizeMessage(msg: any) {
  const { senderIp, ...rest } = msg;
  return rest;
}

// ═══ Media (image/audio/video/file) helpers ═══

export const MAX_MEDIA_BYTES = 2 * 1024 * 1024; // 2MB binary payload
export const MEDIA_TYPES = ["image", "audio", "video", "file"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

const DATA_URL_RE = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;
const ALLOWED_MIME_PREFIX = /^(image|audio|video|application|text)\//;

/** Validate + decode a data URL into raw bytes. Throws on malformed / oversized / disallowed input. */
export function parseDataUrl(dataUrl: string): { mimeType: string; data: Buffer } {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) throw new Error("dataUrl must be a non-empty string");
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) throw new Error("invalid dataUrl, expected data:<mime>;base64,<data>");
  const mimeType = m[1].toLowerCase();
  if (!ALLOWED_MIME_PREFIX.test(mimeType)) throw new Error("unsupported mime type");
  if (m[2].length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 + 16) throw new Error(`media too large, max ${MAX_MEDIA_BYTES} bytes`);
  const data = Buffer.from(m[2], "base64");
  if (data.length === 0) throw new Error("media data is empty");
  if (data.length > MAX_MEDIA_BYTES) throw new Error(`media too large, max ${MAX_MEDIA_BYTES} bytes`);
  return { mimeType, data };
}

/** Coarse media category used for message-level filtering (stored on cold_messages.media_type). */
export function classifyMedia(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

/** Re-encode raw bytes as a data URL (what the client renders). */
export function mediaToDataUrl(m: { mimeType: string; data: Buffer | Uint8Array }): string {
  return `data:${m.mimeType};base64,${Buffer.from(m.data).toString("base64")}`;
}
