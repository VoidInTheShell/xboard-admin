import * as React from "react"
import { AdminApiClient, ApiError, apiRequest } from "@/lib/api"

type AuthPayload = {
  auth_data: string
  is_admin: boolean | number
  token?: string
}

export type AdminSession = {
  authData: string
  email: string
  isAdmin: true
}

type AuthContextValue = {
  client: AdminApiClient | null
  session: AdminSession | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const sessionStorageKey = "xboard-admin-session-v1"
const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AdminSession | null>(readStoredSession)

  const logout = React.useCallback(() => {
    sessionStorage.removeItem(sessionStorageKey)
    setSession(null)
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    const payload = await apiRequest<AuthPayload>("/api/v1/passport/auth/login", {
      method: "POST",
      body: { email, password },
    })

    if (!payload?.auth_data || !payload.is_admin) {
      throw new ApiError("该账号没有管理后台权限。", 403, payload)
    }

    const nextSession: AdminSession = {
      authData: payload.auth_data,
      email,
      isAdmin: true,
    }
    sessionStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
    setSession(nextSession)
  }, [])

  const client = React.useMemo(
    () => session ? new AdminApiClient(session.authData, logout) : null,
    [logout, session],
  )

  return (
    <AuthContext.Provider value={{ client, session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error("useAuth 必须在 AuthProvider 中使用")
  return context
}

export function useAdminApi() {
  const { client } = useAuth()
  if (!client) throw new Error("管理 API 需要有效的管理员会话")
  return client
}

function readStoredSession(): AdminSession | null {
  const serialized = sessionStorage.getItem(sessionStorageKey)
  if (!serialized) return null

  try {
    const parsed = JSON.parse(serialized) as Partial<AdminSession>
    if (parsed.isAdmin === true && typeof parsed.authData === "string" && typeof parsed.email === "string") {
      return parsed as AdminSession
    }
  } catch {
    sessionStorage.removeItem(sessionStorageKey)
  }

  return null
}
