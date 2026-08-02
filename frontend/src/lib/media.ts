export type MediaType = "image" | "audio" | "video" | "file"
export const MEDIA_TYPES: MediaType[] = ["image", "audio", "video", "file"]

export const MAX_MEDIA_BYTES = 30 * 1024 * 1024

export function classifyDataUrl(dataUrl: string): MediaType | null {
  const m = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);/.exec(dataUrl)
  if (!m) return null
  const mt = m[1].toLowerCase()
  if (mt.startsWith("image/")) return "image"
  if (mt.startsWith("audio/")) return "audio"
  if (mt.startsWith("video/")) return "video"
  return "file"
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("failed to read file"))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("invalid image"))
    img.src = src
  })
}

/** Convert a file to a data URL for upload. Images are downscaled (max 1280px, q0.8). */
export async function fileToUploadDataUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    const out = await compressImage(file)
    if (out.length > MAX_MEDIA_BYTES * 4 / 3 + 128) throw new Error("image too large")
    return out
  }
  const raw = await fileToDataUrl(file)
  if (raw.length > MAX_MEDIA_BYTES * 4 / 3 + 128) throw new Error("file too large")
  return raw
}

async function compressImage(file: File): Promise<string> {
  const raw = await fileToDataUrl(file)
  // Keep GIF animation intact
  if (file.type === "image/gif") return raw
  const img = await loadImage(raw)
  const maxDim = 1280
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas unsupported")
  ctx.drawImage(img, 0, 0, w, h)
  const isPng = file.type === "image/png"
  const maxLen = Math.floor((MAX_MEDIA_BYTES * 4 / 3))
  let out = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.8)
  if (out.length > maxLen && !isPng) out = canvas.toDataURL("image/jpeg", 0.6)
  if (out.length > maxLen && !isPng) out = canvas.toDataURL("image/jpeg", 0.4)
  if (out.length > maxLen) {
    // Fall back to the raw file when it fits, otherwise fail loudly
    if (raw.length <= maxLen) return raw
    throw new Error("image too large")
  }
  return out
}
