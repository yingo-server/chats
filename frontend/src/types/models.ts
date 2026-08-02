export interface User {
  id: string
  globalName: string
  appNames: Record<string, string>
  permission: "admin" | "user"
  online: boolean
  createdAt: number
  lastOnlineAt: number
}

export interface Token {
  id: string
  userId: string
  scopes: string
  shortExpires: number
  longExpires: number
  createdAt: number
  revokedAt: number | null
  lastUsedAt: number | null
}

export interface ApiKey {
  id: string
  userId: string
  prefix: string
  name: string
  scopes: string
  rateLimit: number
  expiresAt: number
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
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
  senderIp: string
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

export interface RoomMember {
  id: string
  roomId: string
  userId: string
  joinedAt: number
}

export interface Stats {
  rooms: number
  members: number
  coldMessages: number
  onlineUsers: number
}
