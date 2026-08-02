import { chatApi } from "./client"
import type {
  RoomsRes, RoomRes, RoomMembersRes, MessagesRes,
  SendMessageReq, SendMessageRes, CreateDirectReq, CreateGroupReq,
  AdminStatsRes, AdminSendMessageReq, AdminCreateDirectReq,
  AdminCreateGroupReq, AdminAddMemberReq, RoomMembersDetailRes,
  AdminDeleteRes, AdminAddMemberRes, AdminRemoveMemberRes, DeleteRoomRes,
  UploadMediaReq, UploadMediaRes, MediaRes, MediaListRes, DeleteMediaRes,
} from "@/types/api"
import type { MediaType } from "@/lib/media"

export async function getRooms() {
  return chatApi.get<RoomsRes>("/api/v1/rooms")
}

export async function getRoom(id: string) {
  return chatApi.get<RoomRes>(`/api/v1/rooms/${id}`)
}

export async function getRoomMembers(id: string) {
  return chatApi.get<RoomMembersRes>(`/api/v1/rooms/${id}/members`)
}

export async function getMessages(roomId: string, cursor?: string, limit = 30, mediaType?: MediaType) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  if (mediaType) params.set("mediaType", mediaType)
  return chatApi.get<MessagesRes>(`/api/v1/rooms/${roomId}/messages?${params}`)
}

export async function sendMessage(roomId: string, data: SendMessageReq) {
  return chatApi.post<SendMessageRes>(`/api/v1/rooms/${roomId}/messages`, data)
}

export async function uploadMedia(data: UploadMediaReq) {
  return chatApi.post<UploadMediaRes>("/api/v1/media", data)
}

export async function getMedia(id: string) {
  return chatApi.get<MediaRes>(`/api/v1/media/${id}`)
}

export async function listMyMedia(cursor?: string, limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return chatApi.get<MediaListRes>(`/api/v1/media?${params}`)
}

export async function deleteMedia(id: string) {
  return chatApi.delete<DeleteMediaRes>(`/api/v1/media/${id}`)
}

export async function createDirectRoom(data: CreateDirectReq) {
  return chatApi.post<RoomRes>("/api/v1/rooms/direct", data)
}

export async function createGroupRoom(data: CreateGroupReq) {
  return chatApi.post<RoomRes>("/api/v1/rooms/group", data)
}

export async function adminGetRooms() {
  return chatApi.get<RoomsRes>("/api/v1/admin/rooms")
}

export async function adminGetStats() {
  return chatApi.get<AdminStatsRes>("/api/v1/admin/stats")
}

export async function adminGetRoomMembers(id: string) {
  return chatApi.get<RoomMembersDetailRes>(`/api/v1/admin/rooms/${id}/members`)
}

export async function adminGetMessages(roomId: string, cursor?: string, limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return chatApi.get<MessagesRes>(`/api/v1/admin/rooms/${roomId}/messages?${params}`)
}

export async function adminSendMessage(roomId: string, data: AdminSendMessageReq) {
  return chatApi.post<SendMessageRes>(`/api/v1/admin/rooms/${roomId}/messages`, data)
}

export async function adminCreateDirect(data: AdminCreateDirectReq) {
  return chatApi.post<RoomRes>("/api/v1/admin/rooms/direct", data)
}

export async function adminCreateGroup(data: AdminCreateGroupReq) {
  return chatApi.post<RoomRes>("/api/v1/admin/rooms/group", data)
}

export async function adminAddMember(roomId: string, data: AdminAddMemberReq) {
  return chatApi.post<AdminAddMemberRes>(`/api/v1/admin/rooms/${roomId}/members`, data)
}

export async function adminRemoveMember(roomId: string, userId: string) {
  return chatApi.delete<AdminRemoveMemberRes>(`/api/v1/admin/rooms/${roomId}/members/${userId}`)
}

export async function adminDeleteRoom(id: string) {
  return chatApi.delete<AdminDeleteRes>(`/api/v1/admin/rooms/${id}`)
}

export async function searchUsers(query: string) {
  return chatApi.get<{ ok: boolean; users: { id: string; globalName: string; appNames: Record<string, string> }[] }>(`/api/v1/users/search?query=${encodeURIComponent(query)}`)
}

export async function deleteRoom(id: string) {
  return chatApi.delete<DeleteRoomRes>(`/api/v1/rooms/${id}`)
}
