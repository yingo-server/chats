import type { User, Token, Room, Message, Stats, RoomMember } from "./models"

export interface ApiErr {
  ok: false
  error: string
}

export interface RegisterReq {
  username: string
  password: string
  app_id?: string
}

export interface RegisterOkRes {
  ok: true
  user: User
}

export type RegisterRes = RegisterOkRes | ApiErr

export interface LoginReq {
  username: string
  password: string
}

export interface LoginOkRes {
  ok: true
  user_id: string
  short_token: string
  long_token: string
  expires_in: number
  permission: "admin" | "user"
}

export type LoginRes = LoginOkRes | ApiErr

export interface VerifyOkRes {
  ok: true
  user_id: string
  scopes: string[]
  permission: "admin" | "user"
}

export type VerifyRes = VerifyOkRes | ApiErr

export interface UsersMeOkRes {
  ok: true
  user: User
}

export type UsersMeRes = UsersMeOkRes | ApiErr

export interface TokensMeOkRes {
  ok: true
  tokens: Token[]
  total: number
}

export type TokensMeRes = TokensMeOkRes | ApiErr

export interface CreateApiKeyReq {
  name: string
  scopes: string[]
  expires_days: 7 | 30 | 60 | 90 | 180
}

export interface CreateApiKeyOkRes {
  ok: true
  key: string
  name: string
  expiresDays: number
  rateLimit: number
  prefix: string
}

export type CreateApiKeyRes = CreateApiKeyOkRes | ApiErr

export interface AdminUsersOkRes {
  ok: true
  users: User[]
  total: number
}

export type AdminUsersRes = AdminUsersOkRes | ApiErr

export interface AdminTokensOkRes {
  ok: true
  tokens: Token[]
  total: number
}

export type AdminTokensRes = AdminTokensOkRes | ApiErr

export interface RoomsOkRes {
  ok: true
  rooms: Room[]
}

export type RoomsRes = RoomsOkRes | ApiErr

export interface RoomOkRes {
  ok: true
  room: Room
}

export type RoomRes = RoomOkRes | ApiErr

export interface RoomMembersOkRes {
  ok: true
  members: string[]
  total: number
}

export type RoomMembersRes = RoomMembersOkRes | ApiErr

export interface RoomMembersDetailOkRes {
  ok: true
  members: RoomMember[]
  total: number
}

export type RoomMembersDetailRes = RoomMembersDetailOkRes | ApiErr

export interface MessagesOkRes {
  ok: true
  items: Message[]
  cursor: string | null
  hasMore: boolean
}

export type MessagesRes = MessagesOkRes | ApiErr

export interface SendMessageReq {
  content: string
  type?: string
}

export interface SendMessageOkRes {
  ok: true
  message: Message
}

export type SendMessageRes = SendMessageOkRes | ApiErr

export interface CreateDirectReq {
  targetUserId: string
}

export interface CreateGroupReq {
  name?: string
  memberIds?: string[]
}

export interface AdminStatsOkRes {
  ok: true
  stats: Stats
}

export type AdminStatsRes = AdminStatsOkRes | ApiErr

export interface AdminSendMessageReq {
  senderId: string
  content: string
  type?: string
}

export interface AdminCreateDirectReq {
  userA: string
  userB: string
}

export interface AdminCreateGroupReq {
  name: string
  creatorId: string
  memberIds?: string[]
}

export interface AdminAddMemberReq {
  userId: string
}

export interface AdminPermissionReq {
  permission: "admin" | "user"
}

export interface AdminDeleteOkRes {
  ok: true
  deleted: string
}

export type AdminDeleteRes = AdminDeleteOkRes | ApiErr

export interface AdminRevokeOkRes {
  ok: true
  revoked: string
}

export type AdminRevokeRes = AdminRevokeOkRes | ApiErr

export interface AdminPermissionOkRes {
  ok: true
  userId: string
  permission: string
}

export type AdminPermissionRes = AdminPermissionOkRes | ApiErr

export interface AdminAddMemberOkRes {
  ok: true
  roomId: string
  userId: string
}

export type AdminAddMemberRes = AdminAddMemberOkRes | ApiErr

export interface AdminRemoveMemberOkRes {
  ok: true
  roomId: string
  userId: string
}

export type AdminRemoveMemberRes = AdminRemoveMemberOkRes | ApiErr

export interface RoomNote {
  roomId: string
  note: string
}

export interface RoomNotesOkRes {
  ok: true
  notes: RoomNote[]
}

export type RoomNotesRes = RoomNotesOkRes | ApiErr

export interface SetRoomNoteOkRes {
  ok: true
  roomId: string
  note: string | null
}

export type SetRoomNoteRes = SetRoomNoteOkRes | ApiErr

export interface DeleteRoomOkRes {
  ok: true
  action: "deleted" | "left"
}

export type DeleteRoomRes = DeleteRoomOkRes | ApiErr
