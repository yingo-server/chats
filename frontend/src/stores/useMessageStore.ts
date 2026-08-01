import { create } from "zustand"
import type { Message } from "@/types/models"
import * as chatApi from "@/api/chat"

interface MessageState {
  messages: Message[]
  hasMore: boolean
  cursor: string | null
  loading: boolean
  lastRoomId: string | null
  fetchMessages: (roomId: string, reset?: boolean) => Promise<void>
  fetchMore: (roomId: string) => Promise<void>
  prependMessage: (msg: Message) => void
  reset: () => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  hasMore: false,
  cursor: null,
  loading: false,
  lastRoomId: null,

  fetchMessages: async (roomId, reset = true) => {
    set({ loading: true })
    try {
      const res = await chatApi.getMessages(roomId, undefined, 30)
      if (res.ok && get().lastRoomId === roomId) {
        set({
          messages: reset ? res.items : [...get().messages, ...res.items],
          hasMore: res.hasMore,
          cursor: res.cursor,
        })
      }
    } finally {
      set({ loading: false, lastRoomId: roomId })
    }
  },

  fetchMore: async (roomId) => {
    const { cursor, loading, hasMore } = get()
    if (loading || !hasMore || !cursor) return
    set({ loading: true })
    try {
      const res = await chatApi.getMessages(roomId, cursor, 30)
      if (res.ok && get().lastRoomId === roomId) {
        set((state) => ({
          messages: [...state.messages, ...res.items],
          hasMore: res.hasMore,
          cursor: res.cursor,
        }))
      }
    } finally {
      set({ loading: false })
    }
  },

  prependMessage: (msg) => {
    set((state) => {
      if (state.lastRoomId !== msg.roomId) return state
      return { messages: [msg, ...state.messages] }
    })
  },

  reset: () => set({ messages: [], hasMore: false, cursor: null, loading: false, lastRoomId: null }),
}))
