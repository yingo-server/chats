import { useState } from "react"
import { useNavigate } from "react-router"
import type { Room } from "@/types/models"
import { useRoomStore } from "@/stores/useRoomStore"
import { deleteRoom } from "@/api/chat"
import { setRoomNote } from "@/api/user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

interface RoomDialogsProps {
  deleteTarget: Room | null
  noteTarget: Room | null
  infoTarget: Room | null
  onClose: () => void
}

export function RoomDialogs({ deleteTarget, noteTarget, infoTarget, onClose }: RoomDialogsProps) {
  const navigate = useNavigate()
  const { removeRoom, setRoomNote: setNote } = useRoomStore()
  const [note, setNoteText] = useState(noteTarget?.note ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError("")
    try {
      const res = await deleteRoom(deleteTarget.id)
      if (!res.ok) throw new Error(res.error || "delete failed")
      removeRoom(deleteTarget.id)
      onClose()
      navigate("/")
    } catch (err: any) {
      setError(err?.message || "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveNote = async () => {
    if (!noteTarget) return
    setSaving(true)
    setError("")
    try {
      const trimmed = note.trim()
      await setRoomNote(noteTarget.id, trimmed)
      setNote(noteTarget.id, trimmed)
      onClose()
      setNoteText("")
    } catch (err: any) {
      setError(err?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleClearNote = async () => {
    if (!noteTarget) return
    setSaving(true)
    setError("")
    try {
      await setRoomNote(noteTarget.id, "")
      setNote(noteTarget.id, "")
      onClose()
      setNoteText("")
    } catch (err: any) {
      setError(err?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "direct"
                ? "This permanently deletes the entire conversation for both sides. This cannot be undone."
                : "You will be removed from this group. If you are the last member, the group will be deleted."}
            </DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : deleteTarget?.type === "direct" ? "Delete" : "Leave & Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog key={noteTarget?.id ?? "note-none"} open={!!noteTarget} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Note</DialogTitle>
            <DialogDescription>
              The note is only visible to you. Group conversations keep the original name in small text below.
            </DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <Input
            autoFocus
            maxLength={64}
            placeholder="note name..."
            defaultValue={noteTarget?.note ?? ""}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={handleClearNote} disabled={saving}>
              Clear
            </Button>
            <Button onClick={handleSaveNote} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!infoTarget} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Room Properties</DialogTitle>
          </DialogHeader>
          {infoTarget && (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Name</span>
                <span className="truncate">
                  {infoTarget.note || (infoTarget.type === "direct" ? "Direct Message" : infoTarget.name) || infoTarget.id}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Type</span>
                <span>{infoTarget.type === "direct" ? "Direct" : "Group"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Members</span>
                <span>{infoTarget.memberIds.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(infoTarget.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Room ID</span>
                <span className="font-mono text-xs">{infoTarget.id}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}