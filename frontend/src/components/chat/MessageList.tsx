import { useEffect, useRef, useCallback } from "react"
import { useMessageStore } from "@/stores/useMessageStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { MessageItem } from "./MessageItem"
import { Skeleton } from "@/components/ui/skeleton"

export function MessageList() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const { messages, hasMore, loading, fetchMessages, fetchMore } = useMessageStore()
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
      }
    })
  }, [currentRoomId, fetchMessages])

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
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {hasMore && <div ref={setObserver} className="h-1" />}
      <div className="flex flex-col">
        {messages
          .slice()
          .reverse()
          .map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
