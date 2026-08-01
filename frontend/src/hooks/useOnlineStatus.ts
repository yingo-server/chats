import { useState, useEffect } from "react"

interface OnlineStatus {
  [userId: string]: boolean
}

const MAX_ENTRIES = 1000

export function useOnlineStatus() {
  const [onlineMap, setOnlineMap] = useState<OnlineStatus>({})

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string; online: boolean }
      setOnlineMap((prev) => {
        const next = { ...prev, [detail.userId]: detail.online }
        const keys = Object.keys(next)
        if (keys.length > MAX_ENTRIES) {
          for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
            delete next[keys[i]]
          }
        }
        return next
      })
    }

    window.addEventListener("yingo:online", handler)
    return () => window.removeEventListener("yingo:online", handler)
  }, [])

  return onlineMap
}
