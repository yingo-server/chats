import { useState, useEffect } from "react"

interface OnlineStatus {
  [userId: string]: boolean
}

export function useOnlineStatus() {
  const [onlineMap, setOnlineMap] = useState<OnlineStatus>({})

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string; online: boolean }
      setOnlineMap((prev) => ({ ...prev, [detail.userId]: detail.online }))
    }

    window.addEventListener("yingo:online", handler)
    return () => window.removeEventListener("yingo:online", handler)
  }, [])

  return onlineMap
}
