import { useEffect } from "react"
import { useRoomStore } from "@/stores/useRoomStore"
import { setupAudioUnlock } from "@/lib/notify"

const BASE_TITLE = "Yingo"

function totalUnread(unread: Record<string, number>) {
  return Object.values(unread).reduce((a, b) => a + b, 0)
}

/** Mount once at app root: unlocks audio on first gesture and keeps the
 *  document.title in sync with unread counts (blinking while unread > 0). */
export function useMessageNotify() {
  useEffect(() => {
    setupAudioUnlock()

    let timer: ReturnType<typeof setInterval> | null = null
    const updateTitle = (total: number) => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (total === 0) {
        document.title = BASE_TITLE
        return
      }
      let on = false
      document.title = `(${total}) ${BASE_TITLE}`
      timer = setInterval(() => {
        on = !on
        document.title = on ? `● (${total}) ${BASE_TITLE}` : `(${total}) ${BASE_TITLE}`
      }, 1000)
    }

    updateTitle(totalUnread(useRoomStore.getState().unread))
    const unsub = useRoomStore.subscribe((state) => updateTitle(totalUnread(state.unread)))

    return () => {
      unsub()
      if (timer) clearInterval(timer)
      document.title = BASE_TITLE
    }
  }, [])
}
