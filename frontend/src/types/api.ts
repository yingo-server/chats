import type { User, Room, Message, Media } from "./models"

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

export interface UsersMeOkRes {
  ok: true
  user: User
}

export type UsersMeRes = UsersMeOkRes | ApiErr

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

export interface MessagesOkRes {
  ok: true
  items: Message[]
  cursor: string | null
  hasMore: boolean
}

export type MessagesRes = MessagesOkRes | ApiErr

export interface UploadMediaReq {
  dataUrl: string
}

export interface UploadMediaOkRes {
  ok: true
  media: Media
}

export type UploadMediaRes = UploadMediaOkRes | ApiErr

export interface MediaRes {
  ok: true
  media: Media
}

export interface CreateDirectReq {
  targetUserId: string
}

export interface CreateGroupReq {
  name?: string
  memberIds?: string[]
}

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
