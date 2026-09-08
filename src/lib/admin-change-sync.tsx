import * as React from "react"
import { toast } from "sonner"
import { useAdminApi } from "@/lib/auth"

export type AdminChangeEvent = {
  version: number
  domain: string
  resource: string
  resource_id: string | null
  action: string
  actor_type: "admin" | "mcp"
  actor_id: number | null
  client_id: string | null
  request_id: string
  created_at: string | null
}

type VersionPayload = {
  version: number
  events: AdminChangeEvent[]
}

type SyncStatus = "connecting" | "connected" | "reconnecting"

type AdminChangeSyncValue = {
  status: SyncStatus
  version: number | null
  lastSyncedAt: string | null
  lastEvent: AdminChangeEvent | null
  refreshToken: number
  refreshNow: () => Promise<void>
}

const AdminChangeSyncContext = React.createContext<AdminChangeSyncValue | null>(null)

export function AdminChangeSyncProvider({ children }: { children: React.ReactNode }) {
  const api = useAdminApi()
  const [status, setStatus] = React.useState<SyncStatus>("connecting")
  const [version, setVersion] = React.useState<number | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null)
  const [lastEvent, setLastEvent] = React.useState<AdminChangeEvent | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const versionRef = React.useRef(0)
  const baselineReady = React.useRef(false)
  const refreshTimer = React.useRef<number | null>(null)

  const schedulePageRefresh = React.useCallback((event?: AdminChangeEvent) => {
    if (refreshTimer.current !== null) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      setRefreshToken((current) => current + 1)
      toast.success(event?.actor_type === "mcp" ? "Agent 修改已同步，当前页面已刷新。" : "后台数据已更新，当前页面已刷新。")
    }, 150)
  }, [])

  const acceptEvent = React.useCallback((event: AdminChangeEvent) => {
    if (!Number.isInteger(event.version) || event.version <= versionRef.current) return
    versionRef.current = event.version
    setVersion(event.version)
    setLastEvent(event)
    setLastSyncedAt(new Date().toISOString())

    const fromThisTab = event.actor_type === "admin" && event.client_id === api.clientId
    if (!fromThisTab) schedulePageRefresh(event)
  }, [api.clientId, schedulePageRefresh])

  const reconcile = React.useCallback(async () => {
    let cursor = versionRef.current
    let latestVersion = cursor
    let pages = 0

    while (pages < 50) {
      const payload = await api.get<VersionPayload>("mcp/version", { since: cursor })
      latestVersion = Math.max(latestVersion, payload.version)

      if (!baselineReady.current) {
        versionRef.current = payload.version
        baselineReady.current = true
        setVersion(payload.version)
        setLastSyncedAt(new Date().toISOString())
        return
      }

      if (payload.events.length === 0) {
        if (payload.version > cursor) {
          versionRef.current = payload.version
          setVersion(payload.version)
          setLastSyncedAt(new Date().toISOString())
          schedulePageRefresh()
        }
        return
      }

      payload.events.forEach(acceptEvent)
      cursor = versionRef.current
      if (cursor >= payload.version) return
      pages += 1
    }

    if (latestVersion > versionRef.current) {
      versionRef.current = latestVersion
      setVersion(latestVersion)
      setLastSyncedAt(new Date().toISOString())
      schedulePageRefresh()
    }
  }, [acceptEvent, api, schedulePageRefresh])

  React.useEffect(() => {
    let disposed = false
    let controller: AbortController | null = null
    let retryTimer: number | null = null

    async function connect() {
      try {
        setStatus(baselineReady.current ? "reconnecting" : "connecting")
        await reconcile()
        if (disposed) return

        controller = new AbortController()
        const response = await api.stream("mcp/events", { since: versionRef.current }, controller.signal)
        if (!response.body) throw new Error("浏览器不支持流式响应。")
        setStatus("connected")

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (!disposed) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n")
          const frames = buffer.split("\n\n")
          buffer = frames.pop() ?? ""
          frames.forEach((frame) => {
            const parsed = parseSseFrame(frame)
            if (parsed.event !== "change" || !parsed.data) return
            try {
              acceptEvent(JSON.parse(parsed.data) as AdminChangeEvent)
            } catch {
              // A malformed event is recovered by the version check after reconnect.
            }
          })
        }

        if (!disposed) await reconcile()
      } catch {
        if (disposed || controller?.signal.aborted) return
        setStatus("reconnecting")
      }

      if (!disposed) retryTimer = window.setTimeout(() => void connect(), 1000)
    }

    function onFocus() {
      if (!disposed) void reconcile()
    }

    function onVisibilityChange() {
      if (!document.hidden && !disposed) void reconcile()
    }

    void connect()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      disposed = true
      controller?.abort()
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [acceptEvent, api, reconcile, refreshTimer])

  const value = React.useMemo<AdminChangeSyncValue>(() => ({
    status,
    version,
    lastSyncedAt,
    lastEvent,
    refreshToken,
    refreshNow: reconcile,
  }), [lastEvent, lastSyncedAt, reconcile, refreshToken, status, version])

  return <AdminChangeSyncContext.Provider value={value}>{children}</AdminChangeSyncContext.Provider>
}

export function useAdminChangeSync() {
  const context = React.useContext(AdminChangeSyncContext)
  if (!context) throw new Error("useAdminChangeSync 必须在 AdminChangeSyncProvider 中使用")
  return context
}

function parseSseFrame(frame: string) {
  let event = "message"
  const data: string[] = []
  frame.split("\n").forEach((line) => {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  })
  return { event, data: data.length ? data.join("\n") : null }
}
