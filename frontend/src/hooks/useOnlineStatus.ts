import { useState, useEffect, useRef } from "react"

interface OnlineStatus {
  [userId: string]: boolean
}

const MAX_ENTRIES = 1000

export function useOnlineStatus() {
  const [onlineMap, setOnlineMap] = useState<OnlineStatus>({})
  const orderRef = useRef<string[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string; online: boolean }
      setOnlineMap((prev) => {
        const next = { ...prev, [detail.userId]: detail.online }
        const idx = orderRef.current.indexOf(detail.userId)
        if (idx !== -1) {
          orderRef.current.splice(idx, 1)
        }
        orderRef.current.push(detail.userId)
        if (orderRef.current.length > MAX_ENTRIES) {
          const removed = orderRef.current.splice(0, orderRef.current.length - MAX_ENTRIES)
          for (const key of removed) {
            delete next[key]
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
