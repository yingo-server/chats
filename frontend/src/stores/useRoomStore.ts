import { create } from "zustand"
import type { Room } from "@/types/models"
import * as chatApi from "@/api/chat"
import { getRoomNotes } from "@/api/user"

interface RoomState {
  rooms: Room[]
  currentRoomId: string | null
  loading: boolean
  fetchError: boolean
  fetchRooms: () => Promise<void>
  setCurrentRoom: (id: string | null) => void
  createDirect: (targetUserId: string) => Promise<Room>
  createGroup: (name?: string, memberIds?: string[]) => Promise<Room>
  upsertRoom: (room: Room) => void
  removeRoom: (id: string) => void
  setRoomNote: (roomId: string, note: string) => void
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  loading: false,
  fetchError: false,

  fetchRooms: async () => {
    set({ loading: true, fetchError: false })
    try {
      const res = await chatApi.getRooms()
      if (res.ok) {
        let noteMap: Record<string, string> = {}
        try {
          const notesRes = await getRoomNotes()
          if (notesRes.ok) {
            noteMap = Object.fromEntries(notesRes.notes.map((n) => [n.roomId, n.note]))
          }
        } catch {}
        set({ rooms: res.rooms.map((r) => ({ ...r, note: noteMap[r.id] ?? r.note })) })
      } else set({ fetchError: true })
    } catch {
      set({ fetchError: true })
    } finally {
      set({ loading: false })
    }
  },

  setCurrentRoom: (id) => set({ currentRoomId: id }),

  createDirect: async (targetUserId) => {
    const res = await chatApi.createDirectRoom({ targetUserId })
    if (!res.ok) throw new Error(res.error)
    if (res.room) get().upsertRoom(res.room)
    return res.room
  },

  createGroup: async (name, memberIds) => {
    const res = await chatApi.createGroupRoom({ name, memberIds })
    if (!res.ok) throw new Error(res.error)
    if (res.room) get().upsertRoom(res.room)
    return res.room
  },

  upsertRoom: (room) => {
    const safeRoom = {
      ...room,
      memberIds: room.memberIds ?? [],
      memberNames: room.memberNames ?? {},
    }
    set((state) => {
      const exists = state.rooms.find((r) => r.id === safeRoom.id)
      if (exists) {
        return { rooms: state.rooms.map((r) => (r.id === safeRoom.id ? safeRoom : r)) }
      }
      return { rooms: [safeRoom, ...state.rooms] }
    })
  },

  removeRoom: (id) => {
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== id),
      currentRoomId: state.currentRoomId === id ? null : state.currentRoomId,
    }))
  },

  setRoomNote: (roomId, note) => {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, note: note || undefined } : r
      ),
    }))
  },
}))
