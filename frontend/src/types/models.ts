export interface User {
  id: string
  globalName: string
  appNames: Record<string, string>
  permission: "admin" | "user"
  online: boolean
  createdAt: number
  lastOnlineAt: number
}

export interface Room {
  id: string
  type: "direct" | "group"
  name: string | null
  creatorId: string
  createdAt: number
  memberIds: string[]
  memberNames?: Record<string, string>
  note?: string
  lastMsgAt?: number
}

export interface Message {
  id: string
  roomId: string
  senderId: string
  senderName: string
  senderAppName: string
  content: string
  type: "text" | "image" | "file" | "system"
  sentAt: number
  recalled: boolean
  manuallyDeleted: boolean
  autoDeleted: boolean
  intervalSinceLast: number | null
  mediaId?: string | null
  mediaType?: string | null
}

export interface Media {
  id: string
  mimeType: string
  size: number
  sha256: string
  ownerId: string
  createdAt: number
  dataUrl?: string
}
