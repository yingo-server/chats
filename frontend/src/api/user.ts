import { userApi } from "./client"
import type { UsersMeRes, RoomNotesRes, SetRoomNoteRes } from "@/types/api"

export async function getMe() {
  return userApi.get<UsersMeRes>("/api/v1/users/me")
}

export async function getUser(id: string) {
  return userApi.get<UsersMeRes>(`/api/v1/users/${id}`)
}

export async function getRoomNotes() {
  return userApi.get<RoomNotesRes>("/api/v1/me/room-notes")
}

export async function setRoomNote(roomId: string, note: string) {
  return userApi.put<SetRoomNoteRes>(`/api/v1/me/room-notes/${roomId}`, { note })
}
