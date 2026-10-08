import * as React from "react"
import { AlertCircle, ArrowLeft, Download, History, Link2, LoaderCircle, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useAdminApi } from "@/lib/auth"
import { subscriptionTemplateCatalog } from "@/lib/subscription-template-catalog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ConfigEditor = React.lazy(() => import("@/components/ui/config-editor").then((module) => ({ default: module.ConfigEditor })))
const endpoint = "subscribe-template/remote"

type RemoteSettings = {
  name: string
  url: string
  auto_update: boolean
  interval_hours: number
  revision: string
  last_checked_at: string | null
  last_updated_at: string | null
  next_update_at: string | null
  last_error: string | null
}
type HistoryItem = { id: number; created_at: string; source: "manual" | "remote" | "automatic" | "restore"; bytes: number; current: boolean }
type HistoryPage = { items: HistoryItem[]; current_page: number; last_page: number; total: number }
type MutationResult = { settings: RemoteSettings; changed: boolean }
const sourceLabels = { manual: "手动编辑", remote: "远程拉取", automatic: "自动更新", restore: "历史恢复" }

export function RemoteTemplateDialog({ disabled, onApplied }: { disabled?: boolean; onApplied: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
    <DialogTrigger asChild><Button variant="outline" disabled={disabled}><Link2 data-icon="inline-start" aria-hidden="true" />远程模板</Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl" showCloseButton={!busy} onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }} onPointerDownOutside={(event) => event.preventDefault()}>
      <DialogHeader><DialogTitle>远程模板</DialogTitle><DialogDescription>按客户端设置远程来源，拉取后替换当前订阅模板。</DialogDescription></DialogHeader>
      {open ? <RemoteTemplatePanel onApplied={onApplied} onBusyChange={setBusy} /> : null}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>关闭</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function RemoteTemplatePanel({ onApplied, onBusyChange }: { onApplied: () => void; onBusyChange: (busy: boolean) => void }) {
  const api = useAdminApi()
  const [name, setName] = React.useState("singbox")
  const [tab, setTab] = React.useState("source")
  const [settings, setSettings] = React.useState<RemoteSettings | null>(null)
  const [url, setUrl] = React.useState("")
  const [automatic, setAutomatic] = React.useState(false)
  const [interval, setInterval] = React.useState("24")
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const sourceErrorRef = React.useRef<HTMLDivElement>(null)
  const [reload, setReload] = React.useState(0)
  const [history, setHistory] = React.useState<HistoryPage | null>(null)
  const [page, setPage] = React.useState(1)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyError, setHistoryError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<{ item: HistoryItem; content: string } | null>(null)
  const [action, setAction] = React.useState<{ kind: "restore" | "drop"; item: HistoryItem } | null>(null)
  const [pauseUpdates, setPauseUpdates] = React.useState(true)
  const client = subscriptionTemplateCatalog.find((item) => item.id === name)!
  const pauseOnly = !!settings?.auto_update && !automatic && url.trim() === settings.url
  const dirty = !!settings && (url !== settings.url || automatic !== settings.auto_update || interval !== String(settings.interval_hours))

  React.useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  React.useEffect(() => { if (error) sourceErrorRef.current?.scrollIntoView({ block: "nearest" }) }, [error])
  React.useEffect(() => {
    const controller = new AbortController()
    void api.get<RemoteSettings>(`${endpoint}/fetch`, { name }, controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setSettings(next); setUrl(next.url); setAutomatic(next.auto_update); setInterval(String(next.interval_hours))
    }).catch((reason) => { if (!controller.signal.aborted) setError(message(reason, "远程模板配置读取失败。")) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, name, reload])

  React.useEffect(() => {
    if (tab !== "history") return
    const controller = new AbortController()
    void api.get<HistoryPage>(`${endpoint}/history`, { name, page }, controller.signal).then((next) => {
      if (!controller.signal.aborted) setHistory(next)
    }).catch((reason) => { if (!controller.signal.aborted) setHistoryError(message(reason, "历史模板读取失败。")) })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false) })
    return () => controller.abort()
  }, [api, name, tab, page, reload])

  function resetLoading() { setLoading(true); setError(null); setSettings(null); setHistoryLoading(true); setHistoryError(null); setHistory(null); setPreview(null) }
  function reloadData() { resetLoading(); setReload((value) => value + 1) }
  function selectClient(next: string) { resetLoading(); setName(next); setPage(1) }
  function selectTab(next: string) { setTab(next); setPreview(null); if (next === "history") { setHistoryLoading(true); setHistoryError(null); setHistory(null) } }
  function selectPage(next: number) { setHistoryLoading(true); setHistoryError(null); setHistory(null); setPage(next) }
  async function applyRemote(kind: "save" | "refresh") {
    if (!settings || busy) return
    if (kind === "save") {
      try { const parsed = new URL(url.trim()); if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() }
      catch { setError("请输入有效的 HTTP 或 HTTPS 模板链接，不支持含用户名和密码的链接。"); return }
      if (!Number.isInteger(Number(interval)) || Number(interval) < 1 || Number(interval) > 720) { setError("更新间隔须为 1–720 小时的整数。"); return }
    }
    setBusy(true); setError(null)
    try {
      if (kind === "save" && pauseOnly) {
        const next = await api.post<RemoteSettings>(`${endpoint}/pause`, { name, expected_revision: settings.revision, interval_hours: Number(interval) })
        setSettings(next); setUrl(next.url); setAutomatic(next.auto_update); setInterval(String(next.interval_hours))
        toast.success("已关闭自动更新。")
        return
      }
      const result = await api.post<MutationResult>(`${endpoint}/${kind}`, {
        name, expected_revision: settings.revision,
        ...(kind === "save" ? { url: url.trim(), auto_update: automatic, interval_hours: Number(interval) } : {}),
      })
      setSettings(result.settings); setUrl(result.settings.url); setAutomatic(result.settings.auto_update); setInterval(String(result.settings.interval_hours))
      onApplied()
      toast.success(result.changed ? "已拉取并替换当前模板。" : "拉取完成，模板内容没有变化。")
    } catch (reason) { setError(message(reason, "未能确认拉取结果，请重新读取配置。")) }
    finally { setBusy(false) }
  }
  async function showHistory(item: HistoryItem) {
    setBusy(true); setHistoryError(null)
    try {
      const result = await api.get<{ content: string }>(`${endpoint}/history-detail`, { name, id: item.id })
      setPreview({ item, content: result.content })
    } catch (reason) { setHistoryError(message(reason, "无法读取这份历史模板。")) }
    finally { setBusy(false) }
  }
  async function confirmAction() {
    if (!action || !settings || busy) return
    setBusy(true); setHistoryError(null)
    try {
      await api.post(`${endpoint}/${action.kind}`, { name, id: action.item.id, expected_revision: settings.revision, ...(action.kind === "restore" ? { pause_auto_update: pauseUpdates } : {}) })
      if (action.kind === "restore") { onApplied(); toast.success("已恢复为当前模板。") }
      else toast.success("已删除历史模板。")
      setAction(null); setPage(1); reloadData()
    } catch (reason) { setHistoryError(message(reason, "操作失败，请重新读取后重试。")); setAction(null) }
    finally { setBusy(false) }
  }

  return <>
    <Field className="min-w-0"><FieldLabel htmlFor="remote-client">客户端格式</FieldLabel>
      <Select value={name} onValueChange={selectClient} disabled={busy || dirty}>
        <SelectTrigger id="remote-client" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
        <SelectContent>{subscriptionTemplateCatalog.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
      </Select>
      {dirty ? <FieldDescription>请先保存配置，或重置修改后切换客户端。</FieldDescription> : null}
    </Field>
    <Tabs orientation="vertical" value={tab} onValueChange={selectTab} className="grid min-w-0 gap-5 md:grid-cols-[10rem_minmax(0,1fr)]">
      <TabsList aria-label="远程模板菜单" className="h-auto w-full flex-col items-stretch justify-start gap-1 self-start rounded-xl border bg-transparent p-1.5">
        <TabsTrigger value="source" className="min-h-11 w-full flex-none justify-start" disabled={busy}><Link2 aria-hidden="true" />来源与更新</TabsTrigger>
        <TabsTrigger value="history" className="min-h-11 w-full flex-none justify-start" disabled={busy || dirty}><History aria-hidden="true" />历史模板</TabsTrigger>
      </TabsList>
      <TabsContent value="source" className="mt-0 min-w-0 space-y-5">
        {loading ? <p role="status" className="py-8 text-sm text-muted-foreground">正在读取远程模板配置…</p> : null}
        {error ? <div ref={sourceErrorRef}><ErrorNotice text={error} />{settings ? <Button className="mt-2" variant="outline" onClick={reloadData}>重新读取配置</Button> : null}</div> : null}
        {!loading && !settings ? <Button variant="outline" onClick={reloadData}>重新读取</Button> : null}
        {settings ? <>
          <FieldGroup className="gap-5">
            <Field><FieldLabel htmlFor="remote-template-url">远程模板链接</FieldLabel><Input id="remote-template-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/templates/clash.yaml" disabled={busy} autoComplete="off" spellCheck={false} aria-describedby="remote-url-help" /><FieldDescription id="remote-url-help">填写 {client.title} 模板的原始文件链接。保存时立即拉取，成功后替换当前模板并保留历史版本。</FieldDescription></Field>
            <Field orientation="horizontal" className="rounded-xl border p-4"><div><FieldLabel htmlFor="remote-auto-update">自动更新</FieldLabel><FieldDescription>定期拉取此链接；失败时保留当前模板。</FieldDescription></div><Switch id="remote-auto-update" checked={automatic} onCheckedChange={setAutomatic} disabled={busy} /></Field>
            <Field><FieldLabel htmlFor="remote-interval">更新间隔（小时）</FieldLabel><Input id="remote-interval" className="sm:max-w-48" type="number" min={1} max={720} step={1} value={interval} onChange={(event) => setInterval(event.target.value)} disabled={busy || !automatic} aria-describedby="remote-interval-help" /><FieldDescription id="remote-interval-help">启用自动更新后，每 {interval || "—"} 小时检查一次。可设置 1–720 小时。</FieldDescription></Field>
          </FieldGroup>
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">更新状态</h3><Badge variant="outline">{settings.auto_update ? "自动更新已开启" : "自动更新已关闭"}</Badge></div>
            <dl className="grid gap-3 text-xs sm:grid-cols-2">{[["最近检查", settings.last_checked_at], ["最近更新", settings.last_updated_at], ["下次检查", settings.auto_update ? settings.next_update_at : null]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-data">{date(value)}</dd></div>)}</dl>
            {settings.last_error ? <p className="break-words text-sm text-destructive">最近拉取失败：{settings.last_error}</p> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {dirty ? <Button variant="ghost" disabled={busy} onClick={() => { setUrl(settings.url); setAutomatic(settings.auto_update); setInterval(String(settings.interval_hours)); setError(null) }}>重置修改</Button> : null}
            <Button variant="outline" disabled={busy || dirty || !settings.url} onClick={() => void applyRemote("refresh")}><RefreshCw aria-hidden="true" />立即拉取</Button>
            <Button disabled={busy || !url.trim()} onClick={() => void applyRemote("save")}>{busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />}{busy ? "正在处理…" : pauseOnly ? "保存设置" : "保存并拉取"}</Button>
          </div>
        </> : null}
      </TabsContent>
      <TabsContent value="history" className="mt-0 min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="remote-history-heading" tabIndex={-1} className="text-sm font-medium">{client.title} 历史模板</h3><Button variant="ghost" size="sm" disabled={busy || historyLoading} onClick={reloadData}><RefreshCw aria-hidden="true" />刷新</Button></div>
        <p className="text-xs text-muted-foreground">查看历次保存的模板，或恢复为当前模板。当前版本不可删除。</p>
        {historyError ? <ErrorNotice text={historyError} /> : null}
        {historyLoading ? <p role="status" className="py-8 text-sm text-muted-foreground">正在读取历史模板…</p> : preview ? <>
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)}><ArrowLeft aria-hidden="true" />返回历史列表</Button>
          <p className="text-sm">{date(preview.item.created_at)} · {sourceLabels[preview.item.source]}</p>
          <React.Suspense fallback={<p role="status">正在加载模板预览…</p>}><ConfigEditor label="历史模板" value={preview.content} onChange={() => {}} language={name === "singbox" ? "json" : ["clash", "clashmeta", "stash"].includes(name) ? "yaml" : "text"} rows={12} preview /></React.Suspense>
        </> : history ? <>
          {history.items.length ? <div className="divide-y rounded-xl border px-4">{history.items.map((item) => <div key={item.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{date(item.created_at)}</span>{item.current ? <Badge variant="secondary">当前版本</Badge> : null}</div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="text-xs text-muted-foreground">{sourceLabels[item.source]} · {(item.bytes / 1024).toFixed(1)} KB</span><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={busy} onClick={() => void showHistory(item)}>查看</Button><Button variant="outline" size="sm" disabled={busy || item.current || !settings} onClick={() => { setPauseUpdates(true); setAction({ kind: "restore", item }) }}><RotateCcw aria-hidden="true" />恢复</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy || item.current || !settings} onClick={() => setAction({ kind: "drop", item })}><Trash2 aria-hidden="true" />删除</Button></div></div>
          </div>)}</div> : <div className="rounded-xl border border-dashed px-4 py-10 text-center"><History className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-medium">暂无历史模板</p><p className="mt-1 text-xs text-muted-foreground">保存或拉取模板后，可在这里管理历史版本。</p></div>}
          {history.total > 0 ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>共 {history.total} 份 · 第 {history.current_page} / {history.last_page} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || page <= 1} onClick={() => selectPage(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={busy || page >= history.last_page} onClick={() => selectPage(page + 1)}>下一页</Button></div></div> : null}
        </> : null}
      </TabsContent>
    </Tabs>
    <Dialog open={!!action} onOpenChange={(next) => { if (!next && !busy) setAction(null) }}>
      <DialogContent showCloseButton={!busy} onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }} onPointerDownOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("remote-history-heading")?.focus() }}>
        <DialogHeader><DialogTitle>{action?.kind === "restore" ? "恢复历史模板" : "删除历史模板"}</DialogTitle><DialogDescription>{action?.kind === "restore" ? "将这份历史内容设为当前模板，并保留替换前的版本。" : "删除后将无法从历史记录中恢复这份模板。"}</DialogDescription></DialogHeader>
        <p className="text-sm">{client.title} · {date(action?.item.created_at)}</p>
        {action?.kind === "restore" ? <Field orientation="horizontal"><FieldLabel htmlFor="restore-pause">恢复后暂停自动更新</FieldLabel><Switch id="restore-pause" checked={pauseUpdates} onCheckedChange={setPauseUpdates} disabled={busy} /></Field> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>取消</Button><Button variant={action?.kind === "drop" ? "destructive" : "default"} disabled={busy} onClick={() => void confirmAction()}>{busy ? "处理中…" : action?.kind === "restore" ? "确认恢复" : "确认删除"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function message(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback }
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—" }
function ErrorNotice({ text }: { text: string }) { return <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>操作未完成</AlertTitle><AlertDescription className="break-words">{text}</AlertDescription></Alert> }
