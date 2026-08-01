import { userApi, chatApi } from "./client"
import type { RegisterReq, RegisterRes, LoginReq, LoginRes, VerifyRes } from "@/types/api"

export async function register(data: RegisterReq): Promise<RegisterRes> {
  return userApi.post<RegisterRes>("/api/v1/register", data)
}

export async function login(data: LoginReq): Promise<LoginRes> {
  return chatApi.post<LoginRes>("/api/v1/login", data)
}

export async function verify(token: string): Promise<VerifyRes> {
  const chatBaseUrl = import.meta.env.VITE_CHAT_API || window.location.origin
  const res = await fetch(`${chatBaseUrl}/api/v1/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}
