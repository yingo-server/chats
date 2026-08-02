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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("request timeout")
      }
      throw e
    }
    clearTimeout(timer)

    if (res.status === 401) {
      const path = window.location.pathname
      if (path !== "/login" && path !== "/register") {
        localStorage.removeItem("yingo_auth")
        window.dispatchEvent(new CustomEvent("yingo:toast", { detail: { message: "Session expired, please log in again", type: "error" } }))
        window.location.replace("/login")
      }
      throw new Error("unauthorized")
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      if (!res.ok) {
        throw new Error(`http ${res.status}: ${res.statusText}`)
      }
      return {} as T
    }

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || `http ${res.status}`)
    }

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
