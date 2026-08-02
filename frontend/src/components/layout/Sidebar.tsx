import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { MessageSquarePlus, Search } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { useUIStore } from "@/stores/useUIStore"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { RoomItem } from "@/components/rooms/RoomItem"
import { CreateRoom } from "@/components/rooms/CreateRoom"
import { RoomContextMenu } from "@/components/rooms/RoomContextMenu"
import { RoomDialogs } from "@/components/rooms/RoomDialogs"
import { cn } from "@/lib/utils"
import type { Room } from "@/types/models"

interface MenuState {
  room: Room
  x: number
  y: number
}

export function Sidebar() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { rooms, currentRoomId, fetchRooms, setCurrentRoom, fetchError } = useRoomStore()
  const user = useAuthStore((s) => s.user)
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null)
  const [noteTarget, setNoteTarget] = useState<Room | null>(null)
  const [infoTarget, setInfoTarget] = useState<Room | null>(null)

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const filtered = search
    ? rooms.filter((r) => {
        const name = r.type === "group" && r.name ? r.name : (r.memberIds ?? []).map((id) => id === user?.id ? null : r.memberNames?.[id] || id).filter(Boolean).join(", ")
        return name.toLowerCase().includes(search.toLowerCase())
      })
    : rooms

  const handleSelect = (id: string) => {
    setCurrentRoom(id)
    navigate(`/chat/${id}`)
    if (window.innerWidth < 768) {
      useUIStore.getState().setSidebarOpen(false)
    }
  }

  const closeDialogs = () => {
    setDeleteTarget(null)
    setNoteTarget(null)
    setInfoTarget(null)
  }

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/60 supports-[backdrop-filter]:backdrop-blur-sm md:hidden" onClick={() => useUIStore.getState().setSidebarOpen(false)} />}

      <aside
        className={cn(
          "flex h-full w-72 flex-col border-r",
          "bg-muted/95 supports-[backdrop-filter]:bg-muted/40 supports-[backdrop-filter]:backdrop-blur-xl",
          "fixed inset-y-0 left-0 z-30 shadow-2xl md:relative md:shadow-none",
          // One-shot animations: transform returns to none after play, so backdrop-filter
          // actually renders (Chromium drops the backdrop on composited/transformed layers)
          sidebarOpen ? "sidebar-in md:animate-none" : "sidebar-out md:animate-none"
        )}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreate(true)} aria-label="New conversation">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {fetchError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm">
              <p className="text-destructive">Failed to load conversations</p>
              <Button variant="outline" size="sm" onClick={() => fetchRooms()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-2">
              {filtered.map((room) => (
                <RoomItem
                  key={room.id}
                  room={room}
                  active={room.id === (roomId || currentRoomId)}
                  onClick={() => handleSelect(room.id)}
                  onOpenMenu={(r, x, y) => setMenu({ room: r, x, y })}
                />
              ))}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {search ? "No rooms found" : "No conversations yet"}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <CreateRoom open={showCreate} onOpenChange={setShowCreate} />
      </aside>

      {menu && (
        <RoomContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Rename Note",
              onClick: () => setNoteTarget(menu.room),
            },
            {
              label: "Properties",
              onClick: () => setInfoTarget(menu.room),
            },
            {
              label: menu.room.type === "direct" ? "Delete Conversation" : "Leave Group",
              danger: true,
              onClick: () => setDeleteTarget(menu.room),
            },
          ]}
        />
      )}

      <RoomDialogs
        deleteTarget={deleteTarget}
        noteTarget={noteTarget}
        infoTarget={infoTarget}
        onClose={closeDialogs}
      />
    </>
  )
}
