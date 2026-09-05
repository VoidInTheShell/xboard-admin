import * as React from "react"
import { ArrowDown, ArrowUp, Download, LoaderCircle, MoreHorizontal, Plus, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { ConfirmActionDialog } from "@/components/control-plane/confirm-action-dialog"
import { ResourceEmpty, ResourceError, ResourceTableLoading } from "@/components/control-plane/resource-states"
import { StatusBadge } from "@/components/data/status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getErrorMessage, useAdminQuery } from "@/hooks/use-admin-query"
import { ApiError } from "@/lib/api"
import { useAdminApi } from "@/lib/auth"

type Scope = { device_type: string; platform: string; sort_order?: number; is_default?: boolean }
type Client = { id: number; slug: string; name: string; description: string; logo_mode: "upload" | "url"; logo_url?: string | null; tags: string[]; download_url: string; docs_url?: string | null; quick_import_enabled: boolean; quick_import_url?: string | null; subscription_template: string; scopes: Scope[]; is_builtin: boolean; has_uploaded_logo: boolean; is_enabled?: boolean }
type PlatformDefault = { device_type: string; platform: string; client_app_id: number | null; client_slug?: string | null; client_name?: string | null; is_manual: boolean; is_fallback: boolean }
type ClientPayload = { clients: Client[]; platform_defaults?: PlatformDefault[]; templates: string[]; device_platforms: Record<string, string[]> }
type ClientForm = { id?: number; name: string; description: string; logoMode: "upload" | "url"; logoUrl: string; logoFile: File | null; tags: string; downloadUrl: string; docsUrl: string; quickImportEnabled: boolean; quickImportUrl: string; subscriptionTemplate: string; scopes: Scope[]; isEnabled: boolean }

const platformLabels: Record<string, string> = { desktop: "桌面端", mobile: "移动端", windows: "Windows", "mac-intel": "macOS Intel", "mac-apple-silicon": "macOS Apple Silicon", linux: "Linux", ios: "iOS", android: "Android" }

export function ClientsPage() {
  const api = useAdminApi()
  const load = React.useCallback((signal: AbortSignal) => api.get<ClientPayload>("client/fetch", undefined, signal), [api])
  const query = useAdminQuery(load)
  const [form, setForm] = React.useState<ClientForm | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [saving, setSaving] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<Client | null>(null)
  const [sortOpen, setSortOpen] = React.useState(false)
  const [sortDevice, setSortDevice] = React.useState("desktop")
  const [sortPlatform, setSortPlatform] = React.useState("windows")
  const [sortIds, setSortIds] = React.useState<number[]>([])
  const [defaultSavingKey, setDefaultSavingKey] = React.useState<string | null>(null)

  const clients = query.data?.clients ?? []
  const templates = query.data?.templates ?? []
  const devicePlatforms = query.data?.device_platforms ?? {}
  const platformDefaults = query.data?.platform_defaults ?? []

  function openCreate() {
    setErrors({})
    setForm({ name: "", description: "", logoMode: "url", logoUrl: "", logoFile: null, tags: "", downloadUrl: "", docsUrl: "", quickImportEnabled: false, quickImportUrl: "", subscriptionTemplate: templates[0] ?? "clashmeta", scopes: [], isEnabled: true })
  }

  function openEdit(client: Client) {
    setErrors({})
    setForm({ id: client.id, name: client.name, description: client.description, logoMode: client.logo_mode, logoUrl: client.logo_mode === "url" ? client.logo_url ?? "" : "", logoFile: null, tags: client.tags.join(", "), downloadUrl: client.download_url, docsUrl: client.docs_url ?? "", quickImportEnabled: client.quick_import_enabled, quickImportUrl: client.quick_import_url ?? "", subscriptionTemplate: client.subscription_template, scopes: client.scopes.map((scope) => ({ device_type: scope.device_type, platform: scope.platform })), isEnabled: client.is_enabled !== false })
  }

  async function saveClient() {
    if (!form) return
    setSaving(true)
    setErrors({})
    const body = new FormData()
    if (form.id) body.set("id", String(form.id))
    body.set("name", form.name.trim())
    body.set("description", form.description.trim())
    body.set("logo_mode", form.logoMode)
    if (form.logoMode === "url") body.set("logo_url", form.logoUrl.trim())
    if (form.logoFile) body.set("logo_file", form.logoFile)
    body.set("tags", JSON.stringify(splitTags(form.tags)))
    body.set("download_url", form.downloadUrl.trim())
    body.set("docs_url", form.docsUrl.trim())
    body.set("quick_import_enabled", form.quickImportEnabled ? "1" : "0")
    body.set("quick_import_url", form.quickImportEnabled ? form.quickImportUrl.trim() : "")
    body.set("subscription_template", form.subscriptionTemplate)
    body.set("scopes", JSON.stringify(form.scopes))
    body.set("is_enabled", form.isEnabled ? "1" : "0")
    try {
      await api.post<Client>("client/save", body)
      toast.success(form.id ? "客户端已更新" : "客户端已创建")
      setForm(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, "客户端保存失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function deleteClient() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await api.post<boolean>("client/drop", { id: deleteTarget.id })
      toast.success("客户端入口已删除")
      setDeleteTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "客户端删除失败。"))
    } finally {
      setSaving(false)
    }
  }

  function openSort() {
    const initialDevice = Object.keys(devicePlatforms)[0] ?? "desktop"
    const initialPlatform = devicePlatforms[initialDevice]?.[0] ?? "windows"
    setSortDevice(initialDevice)
    setSortPlatform(initialPlatform)
    setSortIds(idsForScope(clients, initialDevice, initialPlatform))
    setSortOpen(true)
  }

  function changeSortScope(device: string, platform: string) {
    setSortDevice(device)
    setSortPlatform(platform)
    setSortIds(idsForScope(clients, device, platform))
  }

  async function saveSort() {
    setSaving(true)
    try {
      await api.post<boolean>("client/sort", { device_type: sortDevice, platform: sortPlatform, ids: sortIds })
      toast.success("客户端顺序已更新")
      setSortOpen(false)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "客户端排序失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function savePlatformDefault(deviceType: string, platform: string, value: string) {
    const key = `${deviceType}:${platform}`
    setDefaultSavingKey(key)
    try {
      await api.post<PlatformDefault>("client/default", {
        device_type: deviceType,
        platform,
        client_app_id: value === "none" ? null : Number(value),
      })
      toast.success("平台默认推荐已更新")
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "平台默认推荐更新失败。"))
    } finally {
      setDefaultSavingKey(null)
    }
  }

  function clientsForPlatform(deviceType: string, platform: string) {
    return clients
      .filter((client) => client.is_enabled !== false && client.scopes.some((scope) => scope.device_type === deviceType && scope.platform === platform))
      .sort((a, b) => (a.scopes.find((scope) => scope.device_type === deviceType && scope.platform === platform)?.sort_order ?? 0) - (b.scopes.find((scope) => scope.device_type === deviceType && scope.platform === platform)?.sort_order ?? 0))
  }

  return <div className="mx-auto w-full max-w-[1600px]">
    <PageHeader title="客户端适配" description="维护用户端下载入口、订阅模板、快速导入 Scheme、平台展示范围及默认推荐客户端。" action={<div className="flex gap-2"><Button variant="outline" onClick={openSort}>调整顺序</Button><Button onClick={openCreate}><Plus data-icon="inline-start" aria-hidden="true" />新增客户端</Button></div>} />
    {query.error ? <ResourceError title="客户端适配读取失败" message={query.error} onRetry={query.reload} /> : null}
    {!query.loading && Object.keys(devicePlatforms).length ? (
      <Card className="mb-6 overflow-hidden shadow-none">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">平台默认推荐</h2>
            <p className="mt-1 text-sm text-muted-foreground">为每个设备与系统平台选择一个默认客户端；清除手动选择后自动按平台排序回退。</p>
          </div>
          <Badge variant="outline">每个平台最多一个</Badge>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(devicePlatforms).flatMap(([device, platforms]) => platforms.map((platform) => {
            const key = `${device}:${platform}`
            const options = clientsForPlatform(device, platform)
            const configured = platformDefaults.find((item) => item.device_type === device && item.platform === platform)
            const fallback = options[0]
            const selectedValue = configured?.is_manual && configured.client_app_id !== null ? String(configured.client_app_id) : "none"
            return (
              <div key={key} className="min-w-0 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{platformLabels[device] ?? device} · {platformLabels[platform] ?? platform}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">当前：{configured?.client_name ?? fallback?.name ?? "暂无可用客户端"}</div>
                  </div>
                  <StatusBadge label={configured?.is_fallback ? "自动回退" : configured ? "管理员设置" : "未配置"} tone={configured?.is_fallback ? "neutral" : configured ? "success" : "warning"} />
                </div>
                <div className="mt-3">
                  <Select value={selectedValue} disabled={!options.length || defaultSavingKey === key} onValueChange={(value) => void savePlatformDefault(device, platform, value)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择默认客户端" /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="none">按平台顺序自动回退</SelectItem>{options.map((client) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </div>
                {!options.length ? <p className="mt-2 text-xs text-muted-foreground">请先在客户端适配编辑中加入该平台并启用入口。</p> : null}
              </div>
            )
          }))}
        </div>
      </Card>
    ) : null}
    <Card className="gap-0 overflow-hidden py-0 shadow-none"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-4">客户端</TableHead><TableHead>订阅模板</TableHead><TableHead>设备平台</TableHead><TableHead>快速导入</TableHead><TableHead>下载 / 文档</TableHead><TableHead>来源</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>{query.loading ? <ResourceTableLoading columns={7} /> : clients.map((client) => <TableRow key={client.id}><TableCell className="max-w-md pl-4"><div className="flex items-center gap-3">{client.logo_url ? <img className="size-9 rounded-lg border object-cover" src={client.logo_url} alt="" /> : <span className="grid size-9 place-items-center rounded-lg border bg-muted"><Smartphone className="size-4" aria-hidden="true" /></span>}<div className="min-w-0"><div className="flex items-center gap-2"><div className="truncate font-medium">{client.name}</div><StatusBadge label={client.is_enabled === false ? "已停用" : "已启用"} tone={client.is_enabled === false ? "neutral" : "success"} /></div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{client.description}</div><div className="mt-2 flex flex-wrap gap-1">{client.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div></div></div></TableCell><TableCell><Badge variant="outline">{client.subscription_template}</Badge></TableCell><TableCell className="max-w-72"><div className="flex flex-wrap gap-1">{client.scopes.map((scope) => <Badge key={`${scope.device_type}:${scope.platform}`} variant="outline">{platformLabels[scope.platform] ?? scope.platform}</Badge>)}</div></TableCell><TableCell><StatusBadge label={client.quick_import_enabled ? "已启用" : "未启用"} tone={client.quick_import_enabled ? "success" : "neutral"} /></TableCell><TableCell><div className="flex flex-col items-start gap-1"><a className="text-sm underline-offset-4 hover:underline" href={client.download_url} target="_blank" rel="noreferrer"><Download className="mr-1 inline size-3.5" aria-hidden="true" />下载地址</a>{client.docs_url ? <a className="text-xs text-muted-foreground underline-offset-4 hover:underline" href={client.docs_url} target="_blank" rel="noreferrer">使用文档</a> : null}</div></TableCell><TableCell><Badge variant={client.is_builtin ? "secondary" : "outline"}>{client.is_builtin ? "内置" : "自定义"}</Badge></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${client.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => openEdit(client)}>编辑</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(client)}>删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>{!query.loading && !clients.length ? <ResourceEmpty title="还没有客户端入口" description="新增后可在用户端按设备平台展示下载和快速导入入口。" action={<Button size="sm" onClick={openCreate}><Plus data-icon="inline-start" aria-hidden="true" />新增客户端</Button>} /> : null}<div className="border-t px-4 py-3 text-xs text-muted-foreground">共 {clients.length} 个客户端 · 平台排序独立维护</div></Card>

    <ClientDialog form={form} setForm={setForm} errors={errors} templates={templates} devicePlatforms={devicePlatforms} saving={saving} onSave={saveClient} />
    <Dialog open={sortOpen} onOpenChange={(open) => !saving && setSortOpen(open)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>调整平台内客户端顺序</DialogTitle><DialogDescription>后端要求每次提交完整的平台客户端列表；不同设备与系统平台分别排序。</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="sort-device">设备类型</FieldLabel><Select value={sortDevice} onValueChange={(device) => changeSortScope(device, devicePlatforms[device]?.[0] ?? "")}><SelectTrigger id="sort-device" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.keys(devicePlatforms).map((device) => <SelectItem key={device} value={device}>{platformLabels[device] ?? device}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="sort-platform">系统平台</FieldLabel><Select value={sortPlatform} onValueChange={(platform) => changeSortScope(sortDevice, platform)}><SelectTrigger id="sort-platform" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(devicePlatforms[sortDevice] ?? []).map((platform) => <SelectItem key={platform} value={platform}>{platformLabels[platform] ?? platform}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div><div className="space-y-2">{sortIds.map((id, index) => { const client = clients.find((item) => item.id === id); if (!client) return null; return <div key={id} className="flex items-center gap-3 rounded-xl border p-3"><span className="font-data w-6 text-center text-xs text-muted-foreground">{index + 1}</span><span className="flex-1 font-medium">{client.name}</span><Button variant="ghost" size="icon-sm" aria-label={`上移 ${client.name}`} disabled={index === 0} onClick={() => setSortIds(move(sortIds, index, -1))}><ArrowUp aria-hidden="true" /></Button><Button variant="ghost" size="icon-sm" aria-label={`下移 ${client.name}`} disabled={index === sortIds.length - 1} onClick={() => setSortIds(move(sortIds, index, 1))}><ArrowDown aria-hidden="true" /></Button></div> })}{!sortIds.length ? <ResourceEmpty title="该平台没有客户端" description="先在客户端编辑中把入口加入这个平台。" /> : null}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setSortOpen(false)}>取消</Button><Button disabled={saving || !sortIds.length} onClick={() => void saveSort()}>{saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : null}{saving ? "保存中" : "保存顺序"}</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title={`删除客户端“${deleteTarget?.name ?? ""}”？`} description="该入口会从用户端所有设备平台移除；如果使用上传 Logo，后端也会删除对应文件。此操作不影响用户订阅本身。" confirmLabel="删除客户端" destructive busy={saving} onConfirm={deleteClient} />
  </div>
}

function ClientDialog({ form, setForm, errors, templates, devicePlatforms, saving, onSave }: { form: ClientForm | null; setForm: React.Dispatch<React.SetStateAction<ClientForm | null>>; errors: Record<string, string[]>; templates: string[]; devicePlatforms: Record<string, string[]>; saving: boolean; onSave: () => void }) {
  if (!form) return null
  const hasScope = (device: string, platform: string) => form.scopes.some((scope) => scope.device_type === device && scope.platform === platform)
  const toggleScope = (device: string, platform: string, checked: boolean) => setForm({ ...form, scopes: checked ? [...form.scopes, { device_type: device, platform }] : form.scopes.filter((scope) => scope.device_type !== device || scope.platform !== platform) })
  return <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{form.id ? "编辑客户端" : "新增客户端"}</DialogTitle><DialogDescription>下载与文档地址必须为 HTTP(S)；快速导入支持客户端 Scheme，但必须包含订阅地址占位符。</DialogDescription></DialogHeader><FieldGroup><div className="grid gap-4 sm:grid-cols-2"><TextField id="client-name" label="名称" value={form.name} errors={errors.name} onChange={(name) => setForm({ ...form, name })} /><Field><FieldLabel htmlFor="client-template">订阅模板</FieldLabel><Select value={form.subscriptionTemplate} onValueChange={(subscriptionTemplate) => setForm({ ...form, subscriptionTemplate })}><SelectTrigger id="client-template" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{templates.map((template) => <SelectItem key={template} value={template}>{template}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div><Field data-invalid={Boolean(errors.description)}><FieldLabel htmlFor="client-description">描述</FieldLabel><Textarea id="client-description" rows={4} value={form.description} aria-invalid={Boolean(errors.description)} onChange={(event) => setForm({ ...form, description: event.target.value })} /><FieldError errors={errors.description?.map((message) => ({ message }))} /></Field><div className="grid gap-4 sm:grid-cols-2"><TextField id="client-download" label="下载地址" value={form.downloadUrl} errors={errors.download_url} type="url" onChange={(downloadUrl) => setForm({ ...form, downloadUrl })} /><TextField id="client-docs" label="文档地址" value={form.docsUrl} errors={errors.docs_url} type="url" onChange={(docsUrl) => setForm({ ...form, docsUrl })} /></div><Field><FieldLabel htmlFor="client-tags">标签</FieldLabel><Input id="client-tags" value={form.tags} placeholder="推荐, Android" onChange={(event) => setForm({ ...form, tags: event.target.value })} /><FieldDescription>使用逗号或换行分隔，最多 12 个。</FieldDescription></Field><FieldSet className="rounded-2xl border p-4"><FieldLegend>Logo</FieldLegend><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="client-logo-mode">来源</FieldLabel><Select value={form.logoMode} onValueChange={(logoMode) => setForm({ ...form, logoMode: logoMode as "upload" | "url", logoFile: null })}><SelectTrigger id="client-logo-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="url">远程 URL</SelectItem><SelectItem value="upload">上传文件</SelectItem></SelectGroup></SelectContent></Select></Field>{form.logoMode === "url" ? <TextField id="client-logo-url" label="Logo URL" value={form.logoUrl} errors={errors.logo_url} type="url" onChange={(logoUrl) => setForm({ ...form, logoUrl })} /> : <Field data-invalid={Boolean(errors.logo_file)}><FieldLabel htmlFor="client-logo-file">图片文件</FieldLabel><Input id="client-logo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setForm({ ...form, logoFile: event.target.files?.[0] ?? null })} /><FieldDescription>PNG、JPG 或 WebP，最大 2 MiB；编辑时留空可保留已有上传文件。</FieldDescription><FieldError errors={errors.logo_file?.map((message) => ({ message }))} /></Field>}</div></FieldSet><Field orientation="horizontal" className="rounded-2xl border p-4"><span><FieldLabel htmlFor="client-enabled">客户端状态</FieldLabel><FieldDescription>停用后不会出现在用户端；平台默认会自动回退到其他已启用客户端。</FieldDescription></span><Switch id="client-enabled" checked={form.isEnabled} onCheckedChange={(isEnabled) => setForm({ ...form, isEnabled })} /></Field><Field orientation="horizontal" className="rounded-2xl border p-4"><span><FieldLabel htmlFor="client-quick">快速导入</FieldLabel><FieldDescription>启用后可从用户端拉起客户端并注入订阅地址。</FieldDescription></span><Switch id="client-quick" checked={form.quickImportEnabled} onCheckedChange={(quickImportEnabled) => setForm({ ...form, quickImportEnabled })} /></Field>{form.quickImportEnabled ? <TextField id="client-quick-url" label="快速导入 URL / Scheme" value={form.quickImportUrl} errors={errors.quick_import_url} description="必须包含 {url} 或 {base64url}，可选 {name}。" onChange={(quickImportUrl) => setForm({ ...form, quickImportUrl })} /> : null}<FieldSet className="rounded-2xl border p-4"><FieldLegend>设备平台</FieldLegend><FieldDescription>至少选择一个，且同一设备/平台不可重复。</FieldDescription><div className="grid gap-3 sm:grid-cols-2">{Object.entries(devicePlatforms).map(([device, platforms]) => <div key={device} className="rounded-xl border p-3"><div className="mb-2 text-sm font-medium">{platformLabels[device] ?? device}</div><div className="space-y-2">{platforms.map((platform) => <label key={platform} className="flex items-center gap-2 text-sm"><Checkbox checked={hasScope(device, platform)} onCheckedChange={(checked) => toggleScope(device, platform, checked === true)} /><span>{platformLabels[platform] ?? platform}</span></label>)}</div></div>)}</div><FieldError errors={errors.scopes?.map((message) => ({ message }))} /></FieldSet></FieldGroup><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setForm(null)}>取消</Button><Button disabled={saving || !form.name.trim() || !form.description.trim() || !form.downloadUrl.trim() || !form.scopes.length || (form.logoMode === "url" && !form.logoUrl.trim()) || (form.quickImportEnabled && !form.quickImportUrl.trim())} onClick={onSave}>{saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : null}{saving ? "保存中" : "保存客户端"}</Button></DialogFooter></DialogContent></Dialog>
}

function TextField({ id, label, value, onChange, errors, description, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; errors?: string[]; description?: string; type?: React.HTMLInputTypeAttribute }) { return <Field data-invalid={Boolean(errors)}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} aria-invalid={Boolean(errors)} onChange={(event) => onChange(event.target.value)} />{description ? <FieldDescription>{description}</FieldDescription> : null}<FieldError errors={errors?.map((message) => ({ message }))} /></Field> }
function splitTags(value: string) { return Array.from(new Set(value.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12) }
function idsForScope(clients: Client[], device: string, platform: string) { return clients.filter((client) => client.scopes.some((scope) => scope.device_type === device && scope.platform === platform)).sort((a, b) => (a.scopes.find((scope) => scope.device_type === device && scope.platform === platform)?.sort_order ?? 0) - (b.scopes.find((scope) => scope.device_type === device && scope.platform === platform)?.sort_order ?? 0)).map((client) => client.id) }
function move(ids: number[], index: number, offset: -1 | 1) { const target = index + offset; if (target < 0 || target >= ids.length) return ids; const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]; return next }
