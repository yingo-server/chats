import { useEffect, useRef, useCallback, useState } from "react"
import { io, Socket } from "socket.io-client"
import type { Message } from "@/types/models"
import type { SocketOnlinePayload, SocketErrorPayload } from "@/types/socket"
import { useAuthStore } from "@/stores/useAuthStore"
import { useMessageStore } from "@/stores/useMessageStore"

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const joinedRoomsRef = useRef<Set<string>>(new Set())
  const longToken = useAuthStore((s) => s.longToken)
  const chatApiUrl = import.meta.env.VITE_CHAT_API || window.location.origin

  useEffect(() => {
    if (!longToken) return

    const socket = io(chatApiUrl, {
      auth: { token: longToken },
      transports: ["websocket"],
      autoConnect: true,
    })

    socket.on("connect", () => {
      setConnected(true)
      for (const roomId of joinedRoomsRef.current) {
        socket.emit("v1:join", { roomId })
      }
    })
    socket.on("disconnect", () => setConnected(false))

    socket.on("v1:message", (msg: Message) => {
      useMessageStore.getState().prependMessage(msg)
    })

    socket.on("v1:online", (payload: SocketOnlinePayload) => {
      window.dispatchEvent(new CustomEvent("yingo:online", { detail: payload }))
    })

    socket.on("v1:error", (payload: SocketErrorPayload) => {
      console.error("[socket error]", payload.message)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [longToken, chatApiUrl])

  const joinRoom = useCallback((roomId: string) => {
    joinedRoomsRef.current.add(roomId)
    socketRef.current?.emit("v1:join", { roomId })
  }, [])

  const leaveRoom = useCallback((roomId: string) => {
    joinedRoomsRef.current.delete(roomId)
    socketRef.current?.emit("v1:leave", { roomId })
  }, [])

  const sendMessage = useCallback(
    (roomId: string, content: string, type = "text") => {
      return new Promise<Message>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket?.connected) {
          reject(new Error("not connected"))
          return
        }

        const timer = setTimeout(() => {
          reject(new Error("send timeout"))
        }, 10000)

        socket.emit("v1:message", { roomId, content, type }, (ack: { ok: boolean; msg?: Message; error?: string }) => {
          clearTimeout(timer)
          if (ack.ok && ack.msg) {
            resolve(ack.msg)
          } else {
            reject(new Error(ack.error || "send failed"))
          }
        })
      })
    },
    []
  )

  return { connected, joinRoom, leaveRoom, sendMessage }
}
