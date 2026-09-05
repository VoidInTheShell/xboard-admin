import * as React from "react"

export type AdminQueryState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  refreshing: boolean
  reload: () => void
}

export function useAdminQuery<T>(query: (signal: AbortSignal) => Promise<T>): AdminQueryState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [version, setVersion] = React.useState(0)
  const hasData = React.useRef(false)

  React.useEffect(() => {
    const controller = new AbortController()

    async function run() {
      if (!hasData.current) setLoading(true)
      else setRefreshing(true)
      setError(null)

      try {
        setData(await query(controller.signal))
        hasData.current = true
      } catch (cause) {
        if (!controller.signal.aborted) setError(getErrorMessage(cause))
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void run()
    return () => controller.abort()
  }, [query, version])

  return {
    data,
    error,
    loading,
    refreshing,
    reload: React.useCallback(() => setVersion((current) => current + 1), []),
  }
}

export function getErrorMessage(error: unknown, fallback = "请求失败，请稍后重试。") {
  return error instanceof Error && error.message ? error.message : fallback
}
