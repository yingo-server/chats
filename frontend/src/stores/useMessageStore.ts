import { create } from "zustand"
import type { Message } from "@/types/models"
import * as chatApi from "@/api/chat"

interface MessageState {
  messages: Message[]
  hasMore: boolean
  cursor: string | null
  loading: boolean
  lastRoomId: string | null
  _fetchGen: number
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
  _fetchGen: 0,

  fetchMessages: async (roomId, reset = true) => {
    const gen = get()._fetchGen + 1
    set({ loading: true, lastRoomId: roomId, _fetchGen: gen })
    try {
      const res = await chatApi.getMessages(roomId, undefined, 30)
      if (get()._fetchGen !== gen) return
      if (res.ok) {
        set({
          messages: reset ? res.items : [...get().messages, ...res.items],
          hasMore: res.hasMore,
          cursor: res.cursor,
        })
      }
    } finally {
      if (get()._fetchGen === gen) {
        set({ loading: false })
      }
    }
  },

  fetchMore: async (roomId) => {
    const { cursor, loading, hasMore } = get()
    if (loading || !hasMore || !cursor) return
    const gen = get()._fetchGen + 1
    set({ loading: true, _fetchGen: gen })
    try {
      const res = await chatApi.getMessages(roomId, cursor, 30)
      if (get()._fetchGen !== gen) return
      if (res.ok) {
        set((state) => ({
          messages: [...state.messages, ...res.items],
          hasMore: res.hasMore,
          cursor: res.cursor,
        }))
      }
    } finally {
      if (get()._fetchGen === gen) {
        set({ loading: false })
      }
    }
  },

  prependMessage: (msg) => {
    set((state) => {
      if (state.lastRoomId !== msg.roomId) return state
      if (state.messages.some((m) => m.id === msg.id)) return state
      return { messages: [msg, ...state.messages] }
    })
  },

  reset: () => set({ messages: [], hasMore: false, cursor: null, loading: false, lastRoomId: null, _fetchGen: 0 }),
}))
