import { useState } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import { useRoomStore } from "@/stores/useRoomStore"
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
  const [targetId, setTargetId] = useState("")
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreateDirect = async () => {
    if (!targetId.trim()) {
      setError("Target user ID is required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const room = await createDirect(targetId.trim())
      useRoomStore.getState().setCurrentRoom(room.id)
      onOpenChange(false)
      setTargetId("")
      navigate(`/chat/${room.id}`)
    } catch (err: any) {
      setError(err?.message || "Failed to create room")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    const memberIds = groupMembers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setLoading(true)
    setError("")
    try {
      const room = await createGroup(groupName || undefined, memberIds.length > 0 ? memberIds : undefined)
      useRoomStore.getState().setCurrentRoom(room.id)
      onOpenChange(false)
      setGroupName("")
      setGroupMembers("")
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
              <Label>Target User ID</Label>
              <Input placeholder="Enter user ID" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
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
              <Label>Member IDs (comma-separated)</Label>
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
