import { chatApi } from "./client"
import type {
  RoomsRes, RoomRes, MessagesRes,
  CreateDirectReq, CreateGroupReq,
  UploadMediaReq, UploadMediaRes, MediaRes, DeleteRoomRes,
} from "@/types/api"
import type { MediaType } from "@/lib/media"

export async function getRooms() {
  return chatApi.get<RoomsRes>("/api/v1/rooms")
}

export async function getMessages(roomId: string, cursor?: string, limit = 30, mediaType?: MediaType) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  if (mediaType) params.set("mediaType", mediaType)
  return chatApi.get<MessagesRes>(`/api/v1/rooms/${roomId}/messages?${params}`)
}

export async function uploadMedia(data: UploadMediaReq) {
  return chatApi.post<UploadMediaRes>("/api/v1/media", data)
}

export async function getMedia(id: string) {
  return chatApi.get<MediaRes>(`/api/v1/media/${id}`)
}

export async function createDirectRoom(data: CreateDirectReq) {
  return chatApi.post<RoomRes>("/api/v1/rooms/direct", data)
}

export async function createGroupRoom(data: CreateGroupReq) {
  return chatApi.post<RoomRes>("/api/v1/rooms/group", data)
}

export async function searchUsers(query: string) {
  return chatApi.get<{ ok: boolean; users: { id: string; globalName: string; appNames: Record<string, string> }[] }>(`/api/v1/users/search?query=${encodeURIComponent(query)}`)
}

export async function deleteRoom(id: string) {
  return chatApi.delete<DeleteRoomRes>(`/api/v1/rooms/${id}`)
}
