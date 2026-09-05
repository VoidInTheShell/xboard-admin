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
import { createConfigPayload, createConfigValues, mapConfigFieldErrors, type ConfigGroups } from "@/lib/config-settings"
import { subscriptionTemplateCatalog } from "@/lib/subscription-template-catalog"

const singboxFieldKey = "subscribe_template.singbox"

export function SubscriptionManagementPage() {
  const api = useAdminApi()
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
        const groups = await api.get<ConfigGroups>("config/fetch", { key: "subscribe_template" }, controller.signal)
        const nextValues = createConfigValues(subscriptionTemplateCatalog, groups)
        setValues(nextValues)
        setBaseline(nextValues)
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(error, "无法读取订阅模板。"))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [api, reloadVersion])

  const payload = React.useMemo(() => baseline ? createConfigPayload(subscriptionTemplateCatalog, values, baseline) : {}, [baseline, values])
  const dirtyCount = Object.keys(payload).length

  async function saveTemplates() {
    if (!baseline || !dirtyCount) return
    const singboxError = validateSingbox(values[singboxFieldKey])
    if (singboxError) {
      setFieldErrors({ [singboxFieldKey]: [singboxError] })
      toast.error(singboxError)
      return
    }
    setSaving(true)
    setFieldErrors({})
    try {
      await api.post<boolean>("config/save", payload)
      toast.success(`已保存 ${dirtyCount} 份模板，正在重新读取确认。`)
      setReloadVersion((current) => current + 1)
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(mapConfigFieldErrors(subscriptionTemplateCatalog, error.fieldErrors))
      toast.error(getErrorMessage(error, "订阅模板保存失败。"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="订阅管理" description="集中维护六种客户端模板；Sing-box 使用 JSON 校验，其余模板按原格式保留。" action={<div className="flex flex-wrap items-center justify-end gap-2"><Badge variant={dirtyCount ? "outline" : "secondary"} className="font-data text-[10px]">{dirtyCount ? `${dirtyCount} 份待保存` : "已与后端同步"}</Badge><Button disabled={!baseline || !dirtyCount || saving || loading} onClick={() => void saveTemplates()}>{saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : dirtyCount ? <Save data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}{saving ? "保存中" : "保存模板"}</Button></div>} />
      {loadError ? <Alert variant="destructive" className="mb-4"><AlertCircle aria-hidden="true" /><AlertTitle>订阅模板读取失败</AlertTitle><AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => setReloadVersion((current) => current + 1)}><RefreshCw data-icon="inline-start" aria-hidden="true" />重新读取</Button></AlertDescription></Alert> : null}
      <Card className="gap-0 py-0 shadow-none"><CardContent className="p-4 sm:p-5">{loading && !baseline ? <TemplateSkeleton /> : baseline ? <CatalogForm tabs={subscriptionTemplateCatalog} ariaLabel="订阅模板格式" values={values} errors={fieldErrors} disabled={saving || loading} onValuesChange={(next) => { setValues(next); if (Object.keys(fieldErrors).length) setFieldErrors({}) }} navigationStyle="sidebar" navigationLabel="客户端格式" sidebarStickyOffset="page" /> : null}</CardContent></Card>
    </div>
  )
}

function validateSingbox(value: CatalogValues[string]) {
  const source = String(value ?? "").trim()
  if (!source) return null
  try { JSON.parse(source); return null } catch { return "Sing-box 模板不是有效 JSON，请修正后再保存。" }
}

function TemplateSkeleton() {
  return <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6" aria-label="正在读取订阅模板"><div className="space-y-2 rounded-2xl border p-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10 rounded-xl" />)}</div><Skeleton className="h-[32rem] rounded-2xl" /></div>
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
