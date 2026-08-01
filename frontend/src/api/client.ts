type Method = "GET" | "POST" | "PUT" | "DELETE"

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getToken(): string | null {
    try {
      const raw = localStorage.getItem("yingo_auth")
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.state?.longToken || parsed?.state?.shortToken || null
    } catch {
      return null
    }
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) {
      localStorage.removeItem("yingo_auth")
      window.location.href = "/login"
      throw new Error("unauthorized")
    }

    const data = await res.json()
    return data as T
  }

  get<T>(path: string) {
    return this.request<T>("GET", path)
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body)
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body)
  }

  delete<T>(path: string) {
    return this.request<T>("DELETE", path)
  }
}

export const userApi = new ApiClient(import.meta.env.VITE_USER_API || "")
export const chatApi = new ApiClient(import.meta.env.VITE_CHAT_API || "")

export { ApiClient }
