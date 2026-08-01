import { io, Socket } from "socket.io-client"
import type { Message } from "@/types/models"
import type { SocketOnlinePayload, SocketErrorPayload } from "@/types/socket"
import { useMessageStore } from "@/stores/useMessageStore"

let socket: Socket | null = null
let connected = false
const joinedRooms = new Set<string>()
const listeners = new Set<(connected: boolean) => void>()

function notifyListeners() {
  for (const fn of listeners) fn(connected)
}

export function getSocket() {
  return socket
}

export function isConnected() {
  return connected
}

export function subscribeConnection(fn: (connected: boolean) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function connectSocket(longToken: string) {
  if (socket?.connected) return
  if (socket) socket.disconnect()

  const chatApiUrl = import.meta.env.VITE_CHAT_API || window.location.origin

  socket = io(chatApiUrl, {
    auth: { token: longToken },
    transports: ["websocket"],
    autoConnect: true,
  })

  socket.on("connect", () => {
    connected = true
    notifyListeners()
    for (const roomId of joinedRooms) {
      socket!.emit("v1:join", { roomId })
    }
  })

  socket.on("disconnect", () => {
    connected = false
    notifyListeners()
  })

  socket.on("v1:message", (msg: Message) => {
    useMessageStore.getState().prependMessage(msg)
  })

  socket.on("v1:online", (payload: SocketOnlinePayload) => {
    window.dispatchEvent(new CustomEvent("yingo:online", { detail: payload }))
  })

  socket.on("v1:error", (payload: SocketErrorPayload) => {
    console.error("[socket error]", payload.message)
  })
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  connected = false
  joinedRooms.clear()
  notifyListeners()
}

export function joinRoom(roomId: string) {
  joinedRooms.add(roomId)
  socket?.emit("v1:join", { roomId })
}

export function leaveRoom(roomId: string) {
  joinedRooms.delete(roomId)
  socket?.emit("v1:leave", { roomId })
}

export function sendMessage(roomId: string, content: string, type = "text"): Promise<Message> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("not connected"))
      return
    }
    const timer = setTimeout(() => reject(new Error("send timeout")), 10000)
    socket.emit("v1:message", { roomId, content, type }, (ack: { ok: boolean; msg?: Message; error?: string }) => {
      clearTimeout(timer)
      if (ack.ok && ack.msg) {
        resolve(ack.msg)
      } else {
        reject(new Error(ack.error || "send failed"))
      }
    })
  })
}
