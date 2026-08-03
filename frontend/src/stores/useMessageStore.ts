import { create } from "zustand"
import type { Message } from "@/types/models"
import type { MediaType } from "@/lib/media"
import * as chatApi from "@/api/chat"

export interface PendingMessage {
  id: string
  roomId: string
  fileName: string
  size: number
  kind: MediaType
}

interface MessageState {
  messages: Message[]
  hasMore: boolean
  cursor: string | null
  loading: boolean
  lastRoomId: string | null
  mediaType: MediaType | null
  pendingMessages: PendingMessage[]
  setMediaType: (t: MediaType | null) => void
  _fetchGen: number
  fetchMessages: (roomId: string, reset?: boolean) => Promise<void>
  fetchMore: (roomId: string) => Promise<void>
  prependMessage: (msg: Message) => void
  addPending: (p: PendingMessage) => void
  removePending: (id: string) => void
  reset: () => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  hasMore: false,
  cursor: null,
  loading: false,
  lastRoomId: null,
  mediaType: null,
  _fetchGen: 0,
  pendingMessages: [],

  setMediaType: (t) => set({ mediaType: t }),

  fetchMessages: async (roomId, reset = true) => {
    const gen = get()._fetchGen + 1
    const mediaType = get().mediaType
    set({ loading: true, lastRoomId: roomId, _fetchGen: gen })
    try {
      const res = await chatApi.getMessages(roomId, undefined, 30, mediaType ?? undefined)
      if (get()._fetchGen !== gen) return
      if (res.ok) {
        set((state) => {
          if (state._fetchGen !== gen || state.lastRoomId !== roomId) return state
          return {
            messages: reset ? res.items : [...state.messages, ...res.items],
            hasMore: res.hasMore,
            cursor: res.cursor,
          }
        })
      }
    } finally {
      if (get()._fetchGen === gen) {
        set({ loading: false })
      }
    }
  },

  fetchMore: async (roomId) => {
    const { cursor, loading, hasMore, mediaType } = get()
    if (loading || !hasMore || !cursor) return
    const gen = get()._fetchGen + 1
    set({ loading: true, _fetchGen: gen })
    try {
      const res = await chatApi.getMessages(roomId, cursor, 30, mediaType ?? undefined)
      if (get()._fetchGen !== gen) return
      if (res.ok) {
        set((state) => {
          if (state._fetchGen !== gen || state.lastRoomId !== roomId) return state
          return {
            messages: [...state.messages, ...res.items],
            hasMore: res.hasMore,
            cursor: res.cursor,
          }
        })
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
      if (state.mediaType && msg.mediaType !== state.mediaType) return state
      if (state.messages.some((m) => m.id === msg.id)) return state
      return { messages: [msg, ...state.messages] }
    })
  },

  addPending: (p) => {
    set((state) => {
      if (state.pendingMessages.some((x) => x.id === p.id)) return state
      return { pendingMessages: [...state.pendingMessages, p] }
    })
  },

  removePending: (id) => {
    set((state) => ({ pendingMessages: state.pendingMessages.filter((p) => p.id !== id) }))
  },

  reset: () => set({ messages: [], hasMore: false, cursor: null, loading: false, lastRoomId: null, _fetchGen: 0, pendingMessages: [] }),
}))
