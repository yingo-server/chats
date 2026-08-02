import { useEffect, useRef, useCallback } from "react"
import { useMessageStore } from "@/stores/useMessageStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { MessageItem } from "./MessageItem"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { MediaType } from "@/lib/media"

const FILTERS: { key: MediaType | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "image", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "file", label: "Files" },
]

export function MessageList() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const { messages, hasMore, loading, fetchMessages, fetchMore, mediaType, setMediaType } = useMessageStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchIdRef = useRef(0)
  const prevHeadIdRef = useRef<string | null>(null)

  const scrollToBottom = () => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const isNearBottom = () => {
    const el = containerRef.current
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : false
  }

  useEffect(() => {
    if (!currentRoomId) return
    const fetchId = ++fetchIdRef.current
    useMessageStore.getState().reset()
    fetchMessages(currentRoomId).then(() => {
      if (fetchId === fetchIdRef.current) {
        scrollToBottom()
        useRoomStore.getState().clearUnread(currentRoomId)
      }
    })
  }, [currentRoomId, fetchMessages, mediaType])

  useEffect(() => {
    const headId = messages[0]?.id ?? null
    if (headId !== null && headId !== prevHeadIdRef.current) {
      prevHeadIdRef.current = headId
      // Only auto-scroll when the user is already near the bottom; reading history stays put
      if (isNearBottom()) scrollToBottom()
    }
  }, [messages])

  const handleLoadMore = useCallback(async () => {
    const el = containerRef.current
    const prevHeight = el ? el.scrollHeight : 0
    const prevScrollTop = el ? el.scrollTop : 0
    if (currentRoomId) await fetchMore(currentRoomId)
    if (el && prevHeight > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight + prevScrollTop
      })
    }
  }, [currentRoomId, fetchMore])

  const { setObserver } = useInfiniteScroll(handleLoadMore, hasMore)

  if (!currentRoomId) return null

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-48" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-4 py-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key ?? "all"}
            onClick={() => setMediaType(f.key)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs transition-colors",
              mediaType === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {hasMore && <div ref={setObserver} className="h-1" />}
        <div className="flex flex-col">
          {messages
            .slice()
            .reverse()
            .map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
          {messages.length === 0 && !loading && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {mediaType ? `No ${mediaType} messages yet` : "No messages yet"}
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
