import { userApi, chatApi } from "./client"
import type { RegisterReq, RegisterRes, LoginReq, LoginRes } from "@/types/api"

export async function register(data: RegisterReq): Promise<RegisterRes> {
  return userApi.post<RegisterRes>("/api/v1/register", data)
}

export async function login(data: LoginReq): Promise<LoginRes> {
  return chatApi.post<LoginRes>("/api/v1/login", data)
}
