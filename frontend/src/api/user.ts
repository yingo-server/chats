import { userApi } from "./client"
import type {
  UsersMeRes, TokensMeRes, CreateApiKeyReq, CreateApiKeyRes,
  AdminUsersRes, AdminTokensRes, AdminPermissionReq, AdminPermissionRes,
  AdminDeleteRes, AdminRevokeRes,
} from "@/types/api"

export async function getMe() {
  return userApi.get<UsersMeRes>("/api/v1/users/me")
}

export async function getUser(id: string) {
  return userApi.get<UsersMeRes>(`/api/v1/users/${id}`)
}

export async function getMyTokens() {
  return userApi.get<TokensMeRes>("/api/v1/tokens/me")
}

export async function createApiKey(data: CreateApiKeyReq) {
  return userApi.post<CreateApiKeyRes>("/api/v1/api-keys", data)
}

export async function adminGetUsers() {
  return userApi.get<AdminUsersRes>("/api/v1/admin/users")
}

export async function adminGetUser(id: string) {
  return userApi.get<UsersMeRes>(`/api/v1/admin/users/${id}`)
}

export async function adminDeleteUser(id: string) {
  return userApi.delete<AdminDeleteRes>(`/api/v1/admin/users/${id}`)
}

export async function adminSetPermission(id: string, data: AdminPermissionReq) {
  return userApi.put<AdminPermissionRes>(`/api/v1/admin/users/${id}/permission`, data)
}

export async function adminGetTokens() {
  return userApi.get<AdminTokensRes>("/api/v1/admin/tokens")
}

export async function adminRevokeToken(id: string) {
  return userApi.delete<AdminRevokeRes>(`/api/v1/admin/tokens/${id}`)
}
