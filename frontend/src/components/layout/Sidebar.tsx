import { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import { MessageSquarePlus, Search } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { useUIStore } from "@/stores/useUIStore"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RoomItem } from "@/components/rooms/RoomItem"
import { CreateRoom } from "@/components/rooms/CreateRoom"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { rooms, currentRoomId, fetchRooms, setCurrentRoom } = useRoomStore()
  const user = useAuthStore((s) => s.user)
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const filtered = search
    ? rooms.filter((r) => {
        const name = r.type === "group" && r.name ? r.name : r.memberIds.filter((id) => id !== user?.id).join(", ")
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

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => useUIStore.getState().setSidebarOpen(false)} />}

      <aside
        className={cn(
          "flex h-full w-72 flex-col border-r bg-muted/40 transition-transform duration-200",
          "fixed inset-y-0 left-0 z-30 md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreate(true)}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {filtered.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                active={room.id === (roomId || currentRoomId)}
                onClick={() => handleSelect(room.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {search ? "No rooms found" : "No conversations yet"}
              </div>
            )}
          </div>
        </ScrollArea>

        <CreateRoom open={showCreate} onOpenChange={setShowCreate} />
      </aside>
    </>
  )
}
