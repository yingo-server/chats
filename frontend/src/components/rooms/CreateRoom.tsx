import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { searchUsers } from "@/api/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface CreateRoomProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateRoom({ open, onOpenChange }: CreateRoomProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { createDirect, createGroup } = useRoomStore()
  const [tab, setTab] = useState("direct")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ id: string; globalName: string }[]>([])
  const [selectedUser, setSelectedUser] = useState<{ id: string; globalName: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState("")
  const [groupSearchQuery, setGroupSearchQuery] = useState("")
  const [groupSearchResults, setGroupSearchResults] = useState<{ id: string; globalName: string }[]>([])
  const [groupSearching, setGroupSearching] = useState(false)
  const [groupSelected, setGroupSelected] = useState<{ id: string; globalName: string }[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.length < 1) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchUsers(searchQuery)
        setSearchResults(res.ok ? res.users.filter((u) => u.id !== user?.id) : [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, user?.id])

  useEffect(() => {
    if (groupDebounceRef.current) clearTimeout(groupDebounceRef.current)
    if (groupSearchQuery.length < 1) {
      setGroupSearchResults([])
      setGroupSearching(false)
      return
    }
    setGroupSearching(true)
    groupDebounceRef.current = setTimeout(async () => {
      try {
        const res = await searchUsers(groupSearchQuery)
        setGroupSearchResults(
          res.ok
            ? res.users.filter((u) => u.id !== user?.id && !groupSelected.some((s) => s.id === u.id))
            : []
        )
      } catch {
        setGroupSearchResults([])
      } finally {
        setGroupSearching(false)
      }
    }, 300)
    return () => {
      if (groupDebounceRef.current) clearTimeout(groupDebounceRef.current)
    }
  }, [groupSearchQuery, user?.id, groupSelected])

  const handleSelectUser = (u: { id: string; globalName: string }) => {
    setSelectedUser(u)
    setSearchQuery(u.globalName)
    setSearchResults([])
  }

  const handleAddGroupMember = (u: { id: string; globalName: string }) => {
    setGroupSelected((prev) => [...prev, u])
    setGroupSearchQuery("")
    setGroupSearchResults([])
  }

  const handleRemoveGroupMember = (id: string) => {
    setGroupSelected((prev) => prev.filter((u) => u.id !== id))
  }

  const handleCreateDirect = async () => {
    const targetId = selectedUser?.id || searchQuery.trim()
    if (!targetId) {
      setError("Please search and select a user")
      return
    }
    setLoading(true)
    setError("")
    try {
      const room = await createDirect(targetId)
      useRoomStore.getState().setCurrentRoom(room.id)
      onOpenChange(false)
      setSearchQuery("")
      setSelectedUser(null)
      navigate(`/chat/${room.id}`)
    } catch (err: any) {
      setError(err?.message || "Failed to create room")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    const manualIds = groupMembers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const memberIds = [...groupSelected.map((u) => u.id), ...manualIds].filter(
      (id, i, arr) => arr.indexOf(id) === i
    )
    setLoading(true)
    setError("")
    try {
      const room = await createGroup(groupName || undefined, memberIds.length > 0 ? memberIds : undefined)
      useRoomStore.getState().setCurrentRoom(room.id)
      onOpenChange(false)
      setGroupName("")
      setGroupMembers("")
      setGroupSelected([])
      navigate(`/chat/${room.id}`)
    } catch (err: any) {
      setError(err?.message || "Failed to create room")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>Create a direct or group chat</DialogDescription>
        </DialogHeader>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">
              Direct
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1">
              Group
            </TabsTrigger>
          </TabsList>
          <TabsContent value="direct" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Search User</Label>
              <div className="relative">
                <Input
                  placeholder="Type username to search..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(null) }}
                />
                {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>}
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => handleSelectUser(u)}
                    >
                      <span className="font-medium">{u.globalName}</span>
                      <span className="text-xs text-muted-foreground">{u.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && searchQuery.length >= 1 && searchResults.length === 0 && !selectedUser && (
                <p className="text-xs text-muted-foreground">No users found</p>
              )}
              {selectedUser && (
                <p className="text-xs text-green-600">Selected: {selectedUser.globalName}</p>
              )}
            </div>
            <Button className="w-full" onClick={handleCreateDirect} disabled={loading}>
              {loading ? "Creating..." : "Start Conversation"}
            </Button>
          </TabsContent>
          <TabsContent value="group" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Group Name (optional)</Label>
              <Input placeholder="Enter group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Add Members</Label>
              <Input
                placeholder="Search users..."
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
              />
              {groupSearching && <span className="text-xs text-muted-foreground">...</span>}
              {groupSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                  {groupSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => handleAddGroupMember(u)}
                    >
                      <span className="font-medium">{u.globalName}</span>
                      <span className="text-xs text-muted-foreground">{u.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {groupSelected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groupSelected.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs"
                      onClick={() => handleRemoveGroupMember(u.id)}
                    >
                      {u.globalName}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>More Member IDs (comma-separated)</Label>
              <Input placeholder="user1, user2, user3" value={groupMembers} onChange={(e) => setGroupMembers(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleCreateGroup} disabled={loading}>
              {loading ? "Creating..." : "Create Group"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
