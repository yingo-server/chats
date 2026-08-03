import { useEffect, useState } from "react"
import { FileText, Film } from "lucide-react"
import * as chatApi from "@/api/chat"
import type { Media } from "@/types/models"
import { cn } from "@/lib/utils"

const mediaCache = new Map<string, Media>()
const MAX_CACHE_ENTRIES = 100
const MAX_CACHE_BYTES = 128 * 1024 * 1024
let cacheBytes = 0

function cacheGet(id: string): Media | undefined {
  const media = mediaCache.get(id)
  if (media) {
    mediaCache.delete(id)
    mediaCache.set(id, media)
  }
  return media
}

function cacheSet(id: string, media: Media) {
  const prev = mediaCache.get(id)
  if (prev) cacheBytes -= prev.dataUrl?.length ?? 0
  mediaCache.delete(id)
  mediaCache.set(id, media)
  cacheBytes += media.dataUrl?.length ?? 0
  while (mediaCache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
    const oldestKey = mediaCache.keys().next().value as string | undefined
    if (!oldestKey) break
    const oldest = mediaCache.get(oldestKey)
    if (!oldest) break
    cacheBytes -= oldest.dataUrl?.length ?? 0
    mediaCache.delete(oldestKey)
  }
}

function useMedia(mediaId: string): { media: Media | null; error: boolean; loading: boolean } {
  const [state, setState] = useState<{ media: Media | null; error: boolean; loading: boolean }>(() => {
    const cached = cacheGet(mediaId)
    return cached ? { media: cached, error: false, loading: false } : { media: null, error: false, loading: true }
  })

  useEffect(() => {
    if (mediaCache.has(mediaId)) return
    let cancelled = false
    chatApi.getMedia(mediaId)
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          cacheSet(mediaId, res.media)
          setState({ media: res.media, error: false, loading: false })
        } else {
          setState({ media: null, error: true, loading: false })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ media: null, error: true, loading: false })
      })
    return () => { cancelled = true }
  }, [mediaId])

  return state
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Video shows a generic thumbnail and does not load the payload until the user clicks play. */
function VideoMedia({ media, compact }: { media: Media; compact: boolean }) {
  const [playing, setPlaying] = useState(false)
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className={cn(
          "flex max-w-full items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-left hover:bg-muted/60",
          compact ? "w-48" : "w-64",
        )}
      >
        <Film className="h-8 w-8 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium">Video · {formatSize(media.size)}</span>
          <span className="text-[10px] text-muted-foreground">Click to play</span>
        </span>
      </button>
    )
  }
  return <video controls autoPlay src={media.dataUrl} preload="auto" className={cn("max-w-full rounded-lg", compact ? "max-h-24" : "max-h-80")} />
}

export function MediaContent({ mediaId, mediaType, compact = false }: { mediaId: string; mediaType?: string | null; compact?: boolean }) {
  const { media, error, loading } = useMedia(mediaId)

  if (loading) {
    return <div className="h-24 w-48 animate-pulse rounded-lg bg-muted" />
  }

  if (error || !media?.dataUrl) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Media unavailable
      </div>
    )
  }

  const kind = mediaType || media.mimeType.split("/")[0]

  if (kind === "image") {
    return (
      <img
        src={media.dataUrl}
        alt=""
        loading="lazy"
        className={cn("max-w-full rounded-lg object-cover", compact ? "max-h-24" : "max-h-80")}
      />
    )
  }

  if (kind === "audio") {
    return (
      <div className="flex max-w-full flex-col gap-1">
        <audio controls src={media.dataUrl} className="max-w-full" preload="metadata" />
        <span className="text-[10px] text-muted-foreground">{media.mimeType} · {formatSize(media.size)}</span>
      </div>
    )
  }

  if (kind === "video") {
    return <VideoMedia media={media} compact={compact} />
  }

  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg border px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{media.mimeType}</span>
        <span className="text-[10px] text-muted-foreground">{formatSize(media.size)}</span>
      </div>
      <a href={media.dataUrl} download className="ml-auto shrink-0 text-xs text-primary hover:underline">
        Download
      </a>
    </div>
  )
}
