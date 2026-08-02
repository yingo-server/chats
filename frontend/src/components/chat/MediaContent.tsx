import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import * as chatApi from "@/api/chat"
import type { Media } from "@/types/models"
import { cn } from "@/lib/utils"

const mediaCache = new Map<string, Media>()

function useMedia(mediaId: string): { media: Media | null; error: boolean; loading: boolean } {
  const [state, setState] = useState<{ media: Media | null; error: boolean; loading: boolean }>(() => {
    const cached = mediaCache.get(mediaId)
    return cached ? { media: cached, error: false, loading: false } : { media: null, error: false, loading: true }
  })

  useEffect(() => {
    if (mediaCache.has(mediaId)) return
    let cancelled = false
    chatApi.getMedia(mediaId)
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          mediaCache.set(mediaId, res.media)
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
    return (
      <video controls src={media.dataUrl} preload="metadata" className={cn("max-w-full rounded-lg", compact ? "max-h-24" : "max-h-80")} />
    )
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
