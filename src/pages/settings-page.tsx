import * as React from "react"
import { AlertCircle, Check, LoaderCircle, RefreshCw, Save, Globe2, ShieldCheck, PlugZap, FileCode2, Gift, Server, Send, Palette, UserRound, Monitor, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { CatalogForm, type CatalogFieldErrors, type CatalogValues } from "@/components/control-plane/catalog-form"
import { SiteLogoField } from "@/components/control-plane/site-logo-field"
import { refreshSiteBranding } from "@/lib/site-branding"
import { McpSettingsPanel } from "@/components/control-plane/mcp-settings-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { standaloneAdminUrl, waitForStandaloneAdmin } from "@/lib/admin-entry"
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
import type { CatalogTab } from "@/lib/control-plane/catalog-types"

const mcpTab: CatalogTab = {
  id: "mcp",
  title: "MCP 服务",
  description: "管理 Agent 访问、导入配置和前端同步状态。",
  sections: [],
}

const systemNavigation: Record<string, { icon: LucideIcon; description: string }> = {
  site: { icon: Globe2, description: "站点信息与注册" },
  safe: { icon: ShieldCheck, description: "入口与访问保护" },
  mcp: { icon: PlugZap, description: "Agent 接入与授权" },
  subscribe: { icon: FileCode2, description: "订阅与流量重置" },
  invite: { icon: Gift, description: "邀请、返佣与提现" },
  server: { icon: Server, description: "令牌与通信频率" },
  telegram: { icon: Send, description: "机器人与群组" },
  frontend: { icon: Palette, description: "主题与页面外观" },
}
const navigationDescriptions = Object.fromEntries(Object.entries(systemNavigation).map(([id, item]) => [id, item.description]))
const frontendIcons: Record<string, LucideIcon> = { user: UserRound, admin: Monitor, original: Palette }

function withMcpTab(tabs: CatalogTab[]) {
  const safeIndex = tabs.findIndex((tab) => tab.id === "safe")
  const insertAt = safeIndex >= 0 ? safeIndex + 1 : tabs.length
  return [...tabs.slice(0, insertAt), mcpTab, ...tabs.slice(insertAt)].map((tab) => ({ ...tab, icon: systemNavigation[tab.id]?.icon ?? tab.icon }))
}

export function SettingsPage() {
  const api = useAdminApi()
  const [logoFile, setLogoFile] = React.useState<File | null>(null)
  const [supportedKeys, setSupportedKeys] = React.useState<string[]>([])
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
        setSupportedKeys(Object.values(groups).flatMap(group => Object.keys(group)))
        const activeTheme = getActiveTheme(themePayload) ?? String(groups.frontend?.frontend_theme ?? "")
        const nextCatalog = withMcpTab(withThemeOptions(systemSettingsCatalog, getThemeNames(themePayload), activeTheme))
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
  const dirtyCount = Object.keys(payload).length + (logoFile ? 1 : 0)

  async function saveSettings() {
    if (!baseline || !dirtyCount) return
    setSaving(true)
    setFieldErrors({})

    try {
      for (const [key, value] of Object.entries(payload)) {
        if ((key === "logo" || key.endsWith("_support_telegram_url") || key.endsWith("_support_group_url")) && String(value ?? "").trim()) {
          try {
            const url = key === "logo" ? new URL(String(value), window.location.origin) : new URL(String(value))
            if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol")
          } catch { throw new Error("请填写有效的 HTTP 或 HTTPS 图片、支持链接。") }
        }
      }
      const unsupported = Object.keys(payload).filter(key => (key.startsWith("user_") || key === "admin_hidden_menus") && !supportedKeys.includes(key))
      if (unsupported.length) throw new Error("当前服务尚不支持保存新增主题选项，请升级服务后重试。")
      let nextPayload = payload
      if (logoFile) {
        const data = new FormData()
        data.append("file", logoFile)
        const uploaded = await api.post<{ url: string }>("config/uploadLogo", data)
        if (!uploaded?.url) throw new Error("图片上传未返回地址，请重试。")
        nextPayload = { ...payload, logo: uploaded.url }
      }
      await api.post<boolean>("config/save", nextPayload)
      setLogoFile(null)
      await refreshSiteBranding()
      const securePathChanged = Object.hasOwn(payload, "secure_path")
      if (securePathChanged) {
        setBaseline(values)
        const nextPath = String(payload.secure_path ?? "").trim()
        const toastId = toast.loading("后台路径已保存，正在切换到新的 Xboard Admin 入口…")
        const standaloneReady = await waitForStandaloneAdmin(nextPath)

        if (standaloneReady) {
          toast.success("独立 Xboard Admin 已就绪，正在进入新入口。", { id: toastId })
          window.location.assign(standaloneAdminUrl(nextPath))
          return
        }

        toast.error("后台路径已保存，但独立管理端尚未切换完成。请稍候从新入口重试；不会自动回退到原版面板。", { id: toastId })
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
        description="管理通用站点信息、访问安全及各前端的主题配置。"
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
                if (next["site.logo"] !== values["site.logo"]) setLogoFile(null)
                setValues(next)
                if (Object.keys(fieldErrors).length) setFieldErrors({})
              }}
              navigationStyle="sidebar"
              navigationLabel="配置分类"
              navigationAppearance="cards"
              navigationDescriptions={navigationDescriptions}
              sidebarStickyOffset="page"
              fieldControls={{ "site.logo": <SiteLogoField value={String(values["site.logo"] ?? "")} file={logoFile} disabled={saving || loading} onFileChange={setLogoFile} onValueChange={logo => { setLogoFile(null); setValues(current => ({ ...current, "site.logo": logo })) }} /> }}
              tabContent={{ mcp: <McpSettingsPanel />, frontend: <CatalogForm tabs={(catalog.find(tab => tab.id === "frontend")?.sections ?? []).map(section => ({ id: section.id, title: section.title, icon: frontendIcons[section.id], sections: [section] }))} ariaLabel="主题控制" navigationStyle="underline" navigationLabel="前端分类" navigationAppearance="cards" sidebarStickyOffset="page" values={values} errors={fieldErrors} disabled={saving || loading} onValuesChange={setValues} /> }}
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
