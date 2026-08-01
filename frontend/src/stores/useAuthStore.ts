import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "@/types/models"
import * as authApi from "@/api/auth"
import { getMe } from "@/api/user"

interface AuthState {
  shortToken: string | null
  longToken: string | null
  userId: string | null
  permission: "admin" | "user" | null
  user: User | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      shortToken: null,
      longToken: null,
      userId: null,
      permission: null,
      user: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const res = await authApi.login({ username, password })
        if (!res.ok) throw new Error(res.error)
        set({
          shortToken: res.short_token,
          longToken: res.long_token,
          userId: res.user_id,
          permission: res.permission,
          isAuthenticated: true,
        })
        setTimeout(() => get().fetchMe(), 0)
      },

      register: async (username, password) => {
        const res = await authApi.register({ username, password })
        if (!res.ok) throw new Error(res.error)
        const loginRes = await authApi.login({ username, password })
        if (!loginRes.ok) throw new Error(loginRes.error)
        set({
          shortToken: loginRes.short_token,
          longToken: loginRes.long_token,
          userId: loginRes.user_id,
          permission: loginRes.permission,
          isAuthenticated: true,
        })
        setTimeout(() => get().fetchMe(), 0)
      },

      logout: () => {
        set({
          shortToken: null,
          longToken: null,
          userId: null,
          permission: null,
          user: null,
          isAuthenticated: false,
        })
      },

      fetchMe: async () => {
        try {
          const res = await getMe()
          if (res.ok) set({ user: res.user })
        } catch {
          void 0
        }
      },
    }),
    {
      name: "yingo_auth",
      partialize: (state) => ({
        shortToken: state.shortToken,
        longToken: state.longToken,
        userId: state.userId,
        permission: state.permission,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
