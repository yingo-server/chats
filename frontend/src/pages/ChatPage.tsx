import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { MessageList } from "@/components/chat/MessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/useAuthStore"
import { useToast } from "@/components/ui/toast"

export default function ChatPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { currentRoomId, setCurrentRoom, rooms, loading } = useRoomStore()
  const { joinRoom, leaveRoom, connected } = useSocket()
  const user = useAuthStore((s) => s.user)
  const { addToast } = useToast()
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
    return <EmptyState />
  }

  const memberIds = room.memberIds ?? []
  const dmPartner = room.type === "direct"
    ? memberIds.find((id) => id !== user?.id)
    : null

  const headerTitle = room.type === "group" && room.name
    ? room.name
    : dmPartner
      ? `DM with ${dmPartner}`
      : "Direct Message"

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <h2 className="font-semibold">{headerTitle}</h2>
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
