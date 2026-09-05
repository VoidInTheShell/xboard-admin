import * as React from "react"
import { AlertCircle, Check, LoaderCircle, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { CatalogForm, type CatalogFieldErrors, type CatalogValues } from "@/components/control-plane/catalog-form"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { useAdminApi } from "@/lib/auth"
import {
  createConfigPayload,
  createConfigValues,
  getActiveTheme,
  getThemeNames,
  mapConfigFieldErrors,
  withThemeOptions,
  type ConfigGroups,
} from "@/lib/config-settings"
import { systemSettingsCatalog } from "@/lib/system-settings-catalog"

export function SettingsPage() {
  const api = useAdminApi()
  const [catalog, setCatalog] = React.useState(systemSettingsCatalog)
  const [values, setValues] = React.useState<CatalogValues>({})
  const [baseline, setBaseline] = React.useState<CatalogValues | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<CatalogFieldErrors>({})
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [reloadVersion, setReloadVersion] = React.useState(0)

  React.useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setLoadError(null)
      setFieldErrors({})

      try {
        const [groups, themePayload] = await Promise.all([
          api.get<ConfigGroups>("config/fetch", undefined, controller.signal),
          api.get<unknown>("theme/getThemes", undefined, controller.signal).catch(() => null),
        ])
        const activeTheme = getActiveTheme(themePayload) ?? String(groups.frontend?.frontend_theme ?? "")
        const nextCatalog = withThemeOptions(systemSettingsCatalog, getThemeNames(themePayload), activeTheme)
        const nextValues = createConfigValues(nextCatalog, groups)
        setCatalog(nextCatalog)
        setValues(nextValues)
        setBaseline(nextValues)
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadError(getErrorMessage(error, "无法读取系统配置。"))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [api, reloadVersion])

  const payload = React.useMemo(
    () => baseline ? createConfigPayload(catalog, values, baseline) : {},
    [baseline, catalog, values],
  )
  const dirtyCount = Object.keys(payload).length

  async function saveSettings() {
    if (!baseline || !dirtyCount) return
    setSaving(true)
    setFieldErrors({})

    try {
      await api.post<boolean>("config/save", payload)
      const securePathChanged = Object.hasOwn(payload, "secure_path")
      if (securePathChanged) {
        setBaseline(values)
        toast.success("后台路径已保存。请同步更新 VITE_ADMIN_API_PATH 后重新登录。")
      } else {
        toast.success(`已保存 ${dirtyCount} 项配置，正在重新读取确认。`)
        setReloadVersion((current) => current + 1)
      }
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(mapConfigFieldErrors(catalog, error.fieldErrors))
      toast.error(getErrorMessage(error, "系统配置保存失败。"))
    } finally {
      setSaving(false)
    }
  }

  const action = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge variant={dirtyCount ? "outline" : "secondary"} className="font-data text-[10px]">
        {dirtyCount ? `${dirtyCount} 项待保存` : "已与后端同步"}
      </Badge>
      <Button disabled={!baseline || !dirtyCount || saving || loading} onClick={() => void saveSettings()}>
        {saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : dirtyCount ? <Save data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
        {saving ? "保存中" : "保存配置"}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="系统配置"
        description="字段和值域与当前 XBoard 后端对齐；敏感值不会回显，只有实际修改的项目才会提交。"
        action={action}
      />

      {loadError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>系统配置读取失败</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => setReloadVersion((current) => current + 1)}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" />重新读取
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="p-4 sm:p-5">
          {loading && !baseline ? (
            <SettingsSkeleton />
          ) : baseline ? (
            <CatalogForm
              tabs={catalog}
              ariaLabel="系统配置分组"
              values={values}
              errors={fieldErrors}
              disabled={saving || loading}
              onValuesChange={(next) => {
                setValues(next)
                if (Object.keys(fieldErrors).length) setFieldErrors({})
              }}
              navigationStyle="sidebar"
              navigationLabel="配置分类"
              sidebarStickyOffset="page"
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6" aria-label="正在读取系统配置">
      <div className="space-y-2 rounded-2xl border p-3">
        {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-10 rounded-xl" />)}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
