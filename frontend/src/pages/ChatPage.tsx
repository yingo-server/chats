import { useParams } from "react-router"
import { useEffect } from "react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { MessageList } from "@/components/chat/MessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import { EmptyState } from "@/components/shared/EmptyState"

export default function ChatPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { currentRoomId, setCurrentRoom, rooms } = useRoomStore()
  const { joinRoom, leaveRoom, connected } = useSocket()

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

  const room = rooms.find((r) => r.id === (roomId || currentRoomId))

  if (!room) {
    return <EmptyState />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <h2 className="font-semibold">{room.type === "group" && room.name ? room.name : "Direct Message"}</h2>
        <span className="text-xs text-muted-foreground">{room.memberIds.length} members</span>
        {connected && (
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
