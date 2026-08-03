import { useSyncExternalStore } from "react"

interface OnlineStatus {
  [userId: string]: boolean
}

const MAX_ENTRIES = 1000

let onlineMap: OnlineStatus = {}
const order: string[] = []
const listeners = new Set<() => void>()
let started = false

function notify() {
  for (const listener of listeners) listener()
}

function handleOnlineEvent(e: Event) {
  const detail = (e as CustomEvent).detail as { userId: string; online: boolean }
  const next = { ...onlineMap, [detail.userId]: detail.online }
  const idx = order.indexOf(detail.userId)
  if (idx !== -1) order.splice(idx, 1)
  order.push(detail.userId)
  if (order.length > MAX_ENTRIES) {
    const removed = order.splice(0, order.length - MAX_ENTRIES)
    for (const key of removed) {
      delete next[key]
    }
  }
  onlineMap = next
  notify()
}

function reset() {
  onlineMap = {}
  order.length = 0
  notify()
}

function handleLogout() {
  reset()
}

function subscribe(listener: () => void) {
  if (!started) {
    started = true
    window.addEventListener("yingo:online", handleOnlineEvent)
    window.addEventListener("yingo:logout", handleLogout)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => onlineMap)
}
