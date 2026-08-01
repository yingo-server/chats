import type { Message } from "./models"

export interface SocketJoinPayload {
  roomId: string
}

export interface SocketLeavePayload {
  roomId: string
}

export interface SocketMessagePayload {
  roomId: string
  content: string
  type?: string
}

export interface SocketOnlinePayload {
  userId: string
  online: boolean
}

export interface SocketErrorPayload {
  message: string
}

export type SocketMessageAck =
  | { ok: true; msg: Message }
  | { ok: false; error: string }

export interface SocketEvents {
  "v1:join": (payload: SocketJoinPayload) => void
  "v1:leave": (payload: SocketLeavePayload) => void
  "v1:message": (payload: SocketMessagePayload, ack?: (res: SocketMessageAck) => void) => void
}

export interface ServerEvents {
  "v1:message": (msg: Message) => void
  "v1:online": (payload: SocketOnlinePayload) => void
  "v1:error": (payload: SocketErrorPayload) => void
}
