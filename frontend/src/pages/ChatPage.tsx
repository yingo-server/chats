import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { MessageList } from "@/components/chat/MessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/useAuthStore"

export default function ChatPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { currentRoomId, setCurrentRoom, rooms, loading, fetchError } = useRoomStore()
  const { joinRoom, leaveRoom, connected } = useSocket()
  const user = useAuthStore((s) => s.user)
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    if (roomId && roomId !== currentRoomId) {
      setCurrentRoom(roomId)
    }
  }, [roomId, currentRoomId, setCurrentRoom])

  useEffect(() => {
    if (currentRoomId) {
      joinRoom(currentRoomId)
      return () => leaveRoom(currentRoomId)
    }
  }, [currentRoomId, joinRoom, leaveRoom])

  useEffect(() => {
    if (!connected && currentRoomId) {
      setReconnecting(true)
      const timer = setTimeout(() => setReconnecting(false), 5000)
      return () => clearTimeout(timer)
    } else {
      setReconnecting(false)
    }
  }, [connected, currentRoomId])

  const room = rooms.find((r) => r.id === (roomId || currentRoomId))

  if (!room) {
    if (loading) {
      return (
        <div className="flex h-full flex-col gap-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )
    }
    if (fetchError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm text-destructive">Failed to load conversations</p>
          <Button variant="outline" size="sm" onClick={() => useRoomStore.getState().fetchRooms()}>
            Retry
          </Button>
        </div>
      )
    }
    if (rooms.length > 0) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Room not found or you don&apos;t have access</p>
        </div>
      )
    }
    return <EmptyState />
  }

  const memberIds = room.memberIds ?? []
  const dmPartner = room.type === "direct"
    ? memberIds.find((id) => id !== user?.id)
    : null
  const dmPartnerName = dmPartner ? room.memberNames?.[dmPartner] : null

  const baseTitle = room.type === "group" && room.name
    ? room.name
    : dmPartnerName
      ? dmPartnerName
      : dmPartner
        ? dmPartner
        : "Direct Message"

  const headerTitle = room.note || baseTitle
  const headerSubtitle =
    room.note && room.type === "group" && room.name && room.name !== room.note
      ? room.name
      : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{headerTitle}</h2>
          {headerSubtitle && <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>}
        </div>
        <span className="text-xs text-muted-foreground">{memberIds.length} members</span>
        {reconnecting && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-500">
            Reconnecting...
          </span>
        )}
        {connected && !reconnecting && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        )}
      </div>
      <MessageList />
      <MessageInput />
    </div>
  )
}
