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
  const prevMsgCountRef = useRef(0)
  const fetchIdRef = useRef(0)

  useEffect(() => {
    if (!currentRoomId) return
    const fetchId = ++fetchIdRef.current
    useMessageStore.getState().reset()
    fetchMessages(currentRoomId).then(() => {
      if (fetchId === fetchIdRef.current) {
        bottomRef.current?.scrollIntoView()
      }
    })
  }, [currentRoomId, fetchMessages])

  useEffect(() => {
    const prevCount = prevMsgCountRef.current
    const newCount = messages.length
    prevMsgCountRef.current = newCount
    if (newCount > prevCount) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages.length])

  const handleLoadMore = useCallback(async () => {
    if (currentRoomId) await fetchMore(currentRoomId)
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
