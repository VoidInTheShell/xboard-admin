import * as React from "react"
import { toast } from "sonner"
import { useAdminApi } from "@/lib/auth"
import { refreshSiteBranding } from "@/lib/site-branding"
import { getOpenModalCount, subscribeModalActivity } from "@/lib/modal-activity"

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
  autoRefresh: boolean
  setAutoRefresh: (next: boolean) => void
  refreshNow: () => Promise<void>
}

const AUTO_REFRESH_STORAGE_KEY = "xboard-admin-auto-refresh"
const PAUSED_SYNC_TOAST_ID = "admin-change-sync-paused"

function readStoredAutoRefresh(): boolean {
  try {
    return window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

const AdminChangeSyncContext = React.createContext<AdminChangeSyncValue | null>(null)

export function AdminChangeSyncProvider({ children }: { children: React.ReactNode }) {
  const api = useAdminApi()
  const [status, setStatus] = React.useState<SyncStatus>("connecting")
  const [version, setVersion] = React.useState<number | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null)
  const [lastEvent, setLastEvent] = React.useState<AdminChangeEvent | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const [autoRefresh, setAutoRefreshState] = React.useState<boolean>(readStoredAutoRefresh)
  const versionRef = React.useRef(0)
  const baselineReady = React.useRef(false)
  const refreshTimer = React.useRef<number | null>(null)
  const autoRefreshRef = React.useRef(autoRefresh)
  const deferredEventRef = React.useRef<AdminChangeEvent | null | undefined>(undefined)
  const pausedDirtyRef = React.useRef(false)

  const triggerPageRefresh = React.useCallback((event?: AdminChangeEvent) => {
    if (refreshTimer.current !== null) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      setRefreshToken((current) => current + 1)
      toast.success(event?.actor_type === "mcp" ? "Agent 修改已同步，当前页面已刷新。" : "后台数据已更新，当前页面已刷新。")
    }, 150)
  }, [])

  const schedulePageRefresh = React.useCallback((event?: AdminChangeEvent) => {
    // Branding metadata (site name/logo/favicon) follows every accepted change
    // immediately - even while page refresh is paused - because updating the
    // store and favicon never remounts anything or interrupts open dialogs.
    void refreshSiteBranding()
    if (!autoRefreshRef.current) {
      pausedDirtyRef.current = true
      toast.info("后台数据已更新，自动刷新已暂停。", { id: PAUSED_SYNC_TOAST_ID })
      return
    }
    // Defer the remount while any modal dialog is open so in-progress edits are
    // never interrupted; the refresh flushes as soon as all dialogs close.
    if (getOpenModalCount() > 0) {
      deferredEventRef.current = event ?? null
      return
    }
    triggerPageRefresh(event)
  }, [triggerPageRefresh])

  const setAutoRefresh = React.useCallback((next: boolean) => {
    autoRefreshRef.current = next
    setAutoRefreshState(next)
    try {
      if (next) window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, "true")
      else window.localStorage.removeItem(AUTO_REFRESH_STORAGE_KEY)
    } catch {
      // Storage may be unavailable (private mode); the toggle still works for this session.
    }
    if (next && pausedDirtyRef.current) {
      pausedDirtyRef.current = false
      deferredEventRef.current = undefined
      triggerPageRefresh()
    }
  }, [triggerPageRefresh])

  React.useEffect(() => {
    return subscribeModalActivity(() => {
      if (getOpenModalCount() > 0) return
      if (deferredEventRef.current === undefined) return
      const event = deferredEventRef.current
      deferredEventRef.current = undefined
      triggerPageRefresh(event ?? undefined)
    })
  }, [triggerPageRefresh])

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
    autoRefresh,
    setAutoRefresh,
    refreshNow: reconcile,
  }), [autoRefresh, lastEvent, lastSyncedAt, reconcile, refreshToken, setAutoRefresh, status, version])

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
