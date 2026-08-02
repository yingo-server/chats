import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UIState {
  sidebarOpen: boolean
  theme: "light" | "dark" | "system"
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: "light" | "dark" | "system") => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      theme: "system",
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "yingo_ui",
      partialize: (state) => ({ theme: state.theme }),
      // Ignore any stale persisted sidebar state; mobile sidebar always starts closed
      merge: (persisted, current) => {
        const p = persisted as Partial<UIState> | undefined
        return { ...current, theme: p?.theme ?? current.theme }
      },
    }
  )
)
