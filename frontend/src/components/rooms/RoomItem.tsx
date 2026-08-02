import { useRef } from "react"
import type { Room } from "@/types/models"
import { useAuthStore } from "@/stores/useAuthStore"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/utils"

interface RoomItemProps {
  room: Room
  active: boolean
  onClick: () => void
  onOpenMenu: (room: Room, x: number, y: number) => void
}

export function RoomItem({ room, active, onClick, onOpenMenu }: RoomItemProps) {
  const user = useAuthStore((s) => s.user)
  const onlineMap = useOnlineStatus()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)

  const memberIds = room.memberIds ?? []
  const otherUserId = room.type === "direct" ? memberIds.find((id) => id !== user?.id) : null
  const otherName = otherUserId ? room.memberNames?.[otherUserId] : null

  const baseName =
    room.type === "group" && room.name
      ? room.name
      : room.type === "direct" && otherName
        ? otherName
        : room.type === "direct"
          ? memberIds.filter((id) => id !== user?.id).join(", ")
          : room.id

  const displayName = room.note || baseName
  const showOriginal = room.note && room.type === "group" && baseName !== room.note

  const isOnline = otherUserId ? onlineMap[otherUserId] : false

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const startLongPress = (x: number, y: number) => {
    cancelLongPress()
    longPressTimer.current = setTimeout(() => {
      suppressClickRef.current = true
      onOpenMenu(room, x, y)
    }, 700)
  }

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onClick()
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        cancelLongPress()
        onOpenMenu(room, e.clientX, e.clientY)
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (t) startLongPress(t.clientX, t.clientY)
      }}
      onTouchMove={cancelLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      className={cn(
        "flex w-full select-none items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
    >
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {baseName.slice(0, 2).toUpperCase()}
        </div>
        {room.type === "direct" && (
          <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background", isOnline ? "bg-green-500" : "bg-gray-400")} />
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="truncate font-medium">
          {displayName}
          {room.type === "direct" && room.note && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">({baseName})</span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {showOriginal && <span className="mr-1 inline">original: {baseName}</span>}
          {room.type === "group" ? `${memberIds.length} members` : isOnline ? "Online" : "Offline"}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">{timeAgo(room.createdAt)}</div>
    </button>
  )
}