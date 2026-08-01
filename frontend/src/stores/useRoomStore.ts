import { create } from "zustand"
import type { Room } from "@/types/models"
import * as chatApi from "@/api/chat"

interface RoomState {
  rooms: Room[]
  currentRoomId: string | null
  loading: boolean
  fetchRooms: () => Promise<void>
  setCurrentRoom: (id: string | null) => void
  createDirect: (targetUserId: string) => Promise<Room>
  createGroup: (name?: string, memberIds?: string[]) => Promise<Room>
  upsertRoom: (room: Room) => void
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  loading: false,

  fetchRooms: async () => {
    set({ loading: true })
    try {
      const res = await chatApi.getRooms()
      if (res.ok) set({ rooms: res.rooms })
    } finally {
      set({ loading: false })
    }
  },

  setCurrentRoom: (id) => set({ currentRoomId: id }),

  createDirect: async (targetUserId) => {
    const res = await chatApi.createDirectRoom({ targetUserId })
    if (!res.ok) throw new Error(res.error)
    get().upsertRoom(res.room)
    return res.room
  },

  createGroup: async (name, memberIds) => {
    const res = await chatApi.createGroupRoom({ name, memberIds })
    if (!res.ok) throw new Error(res.error)
    get().upsertRoom(res.room)
    return res.room
  },

  upsertRoom: (room) => {
    set((state) => {
      const exists = state.rooms.find((r) => r.id === room.id)
      if (exists) {
        return { rooms: state.rooms.map((r) => (r.id === room.id ? room : r)) }
      }
      return { rooms: [room, ...state.rooms] }
    })
  },
}))
