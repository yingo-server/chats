import type { Room } from "@/types/models"
import { useAuthStore } from "@/stores/useAuthStore"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/utils"

interface RoomItemProps {
  room: Room
  active: boolean
  onClick: () => void
}

export function RoomItem({ room, active, onClick }: RoomItemProps) {
  const user = useAuthStore((s) => s.user)
  const onlineMap = useOnlineStatus()

  const displayName =
    room.type === "group" && room.name
      ? room.name
      : room.type === "direct"
        ? `DM ${room.memberIds.filter((id) => id !== user?.id).join(", ")}`
        : room.id

  const otherUserId = room.type === "direct" ? room.memberIds.find((id) => id !== user?.id) : null
  const isOnline = otherUserId ? onlineMap[otherUserId] : false

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
    >
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        {room.type === "direct" && (
          <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background", isOnline ? "bg-green-500" : "bg-gray-400")} />
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="truncate font-medium">{displayName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {room.type === "group" ? `${room.memberIds.length} members` : isOnline ? "Online" : "Offline"}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">{timeAgo(room.createdAt)}</div>
    </button>
  )
}
