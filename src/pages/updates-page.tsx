import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowUpCircle, Monitor, RefreshCw, Search, Server } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { ResourcePagination } from "@/components/control-plane/resource-pagination"
import { CatalogNavigation } from "@/components/control-plane/catalog-navigation"
import { StatusBadge } from "@/components/data/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAdminApi } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { certificatePreviewEnabled } from "@/lib/control-plane/certificate-types"
import { newestRelease, versionChannel, updateError, updateStatusLabels, type UpdateChannel, type UpdateOverview, type UpdateRelease, type UpdateTarget } from "@/lib/updates"

const sections = [
  { id: "panel", title: "面板更新", description: "用户后台、管理后台与后端", icon: Monitor },
  { id: "servers", title: "节点客户端更新", description: "按实例管理客户端版本", icon: Server },
] as const
const channelNames = { stable: "主线（正式版）", dev: "Dev（开发版）" }

function previewUpdateOverview(): UpdateOverview {
  return {
    panel: {
      name: "JPGREEN 面板",
      updater_ready: true,
      updater_version: "v2.4.0",
      update_protocol: 2,
      handoff_status: "可升级",
      components: [
        { component: "xboard-admin", name: "Xboard Admin", version: "v2.4.0" },
        { component: "xboard-backend", name: "Xboard 后端", version: "v2.4.0" },
      ],
    },
    machines: [
      {
        id: "1",
        name: "GJHK 预览服务器",
        online: true,
        architecture: "amd64",
        updater_version: "v2.4.0",
        updater_protocol: 2,
        instances: [
          { id: "101", name: "主节点实例", version: "v2.4.0", installation_method: "compose", updater_ready: true, updater_version: "v2.4.0" },
          { id: "102", name: "备用节点实例", version: "v2.3.1", installation_method: "systemd", updater_ready: false, updater_version: "v2.3.1", reason: "等待一次性注册完成" },
        ],
      },
    ],
    tasks: [],
  }
}

function previewStalledTask(): UpdateTask {
  return {
    task_id: "preview-stalled",
    target_name: "GJHK 预览服务器 / 备用节点实例",
    target_version: "v9.9.9",
    status: "preparing",
    created_at: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
    stalled: true,
  }
}

export function UpdatesPage() {
  const [params, setParams] = useSearchParams()
  const section = params.get("section") === "servers" ? "servers" : "panel"
  return <div className="mx-auto w-full max-w-[1600px]">
    <PageHeader title="版本更新" description="管理面板组件与节点客户端的运行版本。" />
    <Card className="gap-0 py-0 shadow-none"><CardContent className="p-4 sm:p-5">
    <Tabs value={section} onValueChange={value => setParams({ section: value })} orientation="vertical" className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 overflow-visible lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6">
      <CatalogNavigation items={[...sections]} label="更新分类" appearance="cards" stickyScope="page" />
      <TabsContent value={section} className="min-w-0">
        <UpdateWorkspace key={section} panelMode={section === "panel"} />
      </TabsContent>
    </Tabs>
    </CardContent></Card>
  </div>
}

function UpdateWorkspace({ panelMode }: { panelMode: boolean }) {
  const api = useAdminApi()
  const [overview, setOverview] = useState<UpdateOverview | null>(() => certificatePreviewEnabled ? { ...previewUpdateOverview(), tasks: [previewStalledTask()] } : null)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(!certificatePreviewEnabled)
  const [error, setError] = useState("")
  const [abortingId, setAbortingId] = useState<string | null>(null)
  useEffect(() => {
    if (certificatePreviewEnabled) return
    const controller = new AbortController()
    api.get<UpdateOverview>("update/overview", { target_kind: panelMode ? "panel" : "node" }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setOverview(data); setError(""); setLoading(false) } })
      .catch(reason => { if (!controller.signal.aborted) { setError(updateError(reason)); setLoading(false) } })
    return () => controller.abort()
  }, [api, panelMode, refresh])
  function reload() {
    if (certificatePreviewEnabled) {
      setOverview({ ...previewUpdateOverview(), tasks: [previewStalledTask()] })
      setError("")
      setLoading(false)
      return
    }
    setLoading(true)
    setRefresh(value => value + 1)
  }
  async function abortTask(taskId: string) {
    setAbortingId(taskId)
    try {
      await api.post("update/tasks/abort", { task_id: taskId })
      toast.success("已中止任务；执行器未完成的动作以其本地恢复结果为准。")
      reload()
    } catch (reason) {
      toast.error(updateError(reason))
    } finally {
      setAbortingId(null)
    }
  }
  const targets: UpdateTarget[] = !overview ? [] : panelMode
    ? overview.panel.components.map(item => ({ id: item.component, component: item.component, name: item.name, version: item.version, server: overview.panel.name, ready: overview.panel.updater_ready, reason: overview.panel.reason, updaterVersion: overview.panel.updater_version }))
    : overview.machines.flatMap(machine => machine.instances.map(instance => ({
      id: `${machine.id}/${instance.id}`, component: "xboard-node", name: instance.name, version: instance.version,
      server: machine.name, machineId: machine.id, instanceId: instance.id, method: instance.installation_method,
      ready: machine.online && instance.updater_ready, updaterVersion: instance.updater_version ?? machine.updater_version, reason: !machine.online ? "服务器离线" : instance.reason,
    })))
  return <div className="flex min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{panelMode ? "面板更新" : "节点客户端更新"}</h2><p className="mt-1 text-sm text-muted-foreground">{panelMode ? "分别选择用户后台、管理后台或后端更新。" : "以实例为单位更新，同一实例承载的入站会一起重启。"}</p></div>
      <Button variant="outline" onClick={reload} disabled={loading}><RefreshCw data-icon="inline-start" />{loading ? "正在检查" : "检查更新"}</Button>
    </div>
    {overview && panelMode && <Card><CardHeader><CardTitle>Admin 更新包</CardTitle><CardDescription>Admin 与 Updater 使用同一个 Release 版本，不能分别选择。</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Admin 版本</p><p className="mt-1 font-data text-sm">{overview.panel.components.find(item => item.component === "xboard-admin")?.version || "尚未上报"}</p></div><div><p className="text-xs text-muted-foreground">Updater 版本</p><p className="mt-1 font-data text-sm">{overview.panel.updater_version || "尚未上报"}</p></div><div><p className="text-xs text-muted-foreground">更新器状态</p><Badge className="mt-1" variant={overview.panel.updater_ready ? "secondary" : "outline"}>{overview.panel.handoff_status || (overview.panel.updater_ready ? "Updater 就绪" : "等待 Updater 心跳")}</Badge></div></div>{overview.panel.updater_version && overview.panel.components.find(item => item.component === "xboard-admin")?.version !== overview.panel.updater_version && <p className="mt-3 text-sm text-destructive">Admin 与 Updater 版本不一致，已暂停面板升级入口。</p>}</CardContent></Card>}
    {error && <Alert variant="destructive"><AlertTitle>无法读取更新信息</AlertTitle><AlertDescription>{error} 请稍后重新检查更新。</AlertDescription></Alert>}
    {loading ? <Skeleton className="h-64 w-full" role="status" aria-label="正在读取版本" /> : !error && <UpdateTable targets={targets} panelMode={panelMode} onCreated={reload} />}
    {overview && <Card><CardHeader><CardTitle>更新记录</CardTitle><CardDescription>查看更新结果，执行中的任务可通过检查更新刷新。</CardDescription></CardHeader><CardContent>
      {!overview.tasks.length ? <Empty><EmptyHeader><EmptyTitle>暂无更新记录</EmptyTitle><EmptyDescription>创建更新任务后，可在这里查看进度和结果。</EmptyDescription></EmptyHeader></Empty> : <Table><TableHeader><TableRow><TableHead className="min-w-40">更新对象</TableHead><TableHead className="whitespace-nowrap">目标版本</TableHead><TableHead>状态</TableHead><TableHead className="whitespace-nowrap">创建时间</TableHead><TableHead className="w-16">操作</TableHead></TableRow></TableHeader><TableBody>
        {overview.tasks.map(task => <TableRow key={task.task_id}><TableCell className="max-w-64">{task.target_name}{task.message && <p className="mt-1 whitespace-normal text-xs text-muted-foreground">{task.message}</p>}</TableCell><TableCell className="whitespace-nowrap font-data">{task.target_version}</TableCell><TableCell><Badge variant={task.status === "failed" || task.status === "rollback_failed" ? "destructive" : "secondary"}>{updateStatusLabels[task.status] || task.status}</Badge>{task.stalled && <p className="mt-1 max-w-48 whitespace-normal text-xs text-amber-700 dark:text-amber-300">长时间无进展，可中止后重新发起更新。</p>}</TableCell><TableCell className="whitespace-nowrap font-data">{new Date(task.created_at).toLocaleString("zh-CN")}</TableCell><TableCell>{["succeeded", "failed", "rolled_back", "rollback_failed"].includes(task.status) ? null : <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" disabled={abortingId === task.task_id} onClick={() => void abortTask(task.task_id)}>{abortingId === task.task_id ? "中止中…" : "中止"}</Button>}</TableCell></TableRow>)}
      </TableBody></Table>}
    </CardContent></Card>}
  </div>
}

type ReleaseState = { releases: UpdateRelease[]; error?: string }

function previewChecks(targets: UpdateTarget[]): Record<string, ReleaseState> {
  return Object.fromEntries(targets.map(target => {
    const channel = versionChannel(target.version) || "stable"
    const version = channel === "dev" ? "v9.9.9-dev.1.0" : "v9.9.9"
    return [target.id, {
      releases: [{
        component: target.component,
        version,
        channel,
        published_at: "2026-09-17T08:00:00Z",
        notes: "预览发布：Admin 与 Updater 使用同一 Release 版本。",
        compatible: true,
        components: [],
      }],
    }]
  }))
}

function UpdateTable({ targets, panelMode, onCreated }: { targets: UpdateTarget[]; panelMode: boolean; onCreated: () => void }) {
  const api = useAdminApi()
  const [checks, setChecks] = useState<Record<string, ReleaseState>>(() => certificatePreviewEnabled ? previewChecks(targets) : {})
  const [selected, setSelected] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<UpdateTarget[]>([])
  const filtered = targets.filter(target => `${target.name} ${target.server} ${target.instanceId || ""}`.toLowerCase().includes(search.toLowerCase()))
  const visible = filtered.slice((page - 1) * 10, page * 10)
  const eligible = visible.filter(target => target.ready)
  const selectedTargets = targets.filter(target => target.ready && selected.includes(target.id))
  useEffect(() => {
    if (certificatePreviewEnabled) return
    const controller = new AbortController()
    targets.forEach(target => {
      const channel = versionChannel(target.version)
      if (!channel) return
      api.get<UpdateRelease[]>("update/releases", {
        target_kind: panelMode ? "panel" : "node", component: target.component, channel,
        machine_id: target.machineId, instance_id: target.instanceId,
      }, controller.signal).then(releases => {
        if (!controller.signal.aborted) setChecks(previous => ({ ...previous, [target.id]: { releases: releases.filter(item => item.component === target.component) } }))
      }).catch(reason => {
        if (!controller.signal.aborted) setChecks(previous => ({ ...previous, [target.id]: { releases: [], error: updateError(reason) } }))
      })
    })
    return () => controller.abort()
  }, [api, targets, panelMode])
  return <>
    <div className="min-w-0 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {panelMode ? <p className="text-sm text-muted-foreground">各组件独立升级，默认检查当前分支的更新。</p> :
          <form className="flex w-full min-w-0 items-center gap-2 sm:max-w-md sm:flex-1" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setSelected([]); setPage(1) }}>
            <Input aria-label="搜索实例或服务器" placeholder="搜索实例或服务器" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
            <Button variant="outline" type="submit"><Search data-icon="inline-start" />搜索</Button>
          </form>}
        {!panelMode && <Button variant="outline" disabled={!selectedTargets.length} onClick={() => setEditing(selectedTargets)}><ArrowUpCircle data-icon="inline-start" />批量升级{selectedTargets.length ? `（${selectedTargets.length}）` : ""}</Button>}
      </div>
      <Table>
        <TableHeader><TableRow>
          {!panelMode && <TableHead className="w-10 pl-4"><Checkbox aria-label="全选本页可升级实例" disabled={!eligible.length} checked={eligible.length > 0 && eligible.every(target => selected.includes(target.id)) ? true : eligible.some(target => selected.includes(target.id)) ? "indeterminate" : false} onCheckedChange={checked => setSelected(previous => checked === true ? [...new Set([...previous, ...eligible.map(target => target.id)])] : previous.filter(id => !eligible.some(target => target.id === id)))} /></TableHead>}
          <TableHead className={cn(panelMode && "pl-4")}>{panelMode ? "组件" : "实例"}</TableHead>
          {!panelMode && <TableHead>所属服务器</TableHead>}
          <TableHead>当前版本</TableHead><TableHead>检测到的版本</TableHead><TableHead>状态</TableHead><TableHead className="pr-4 text-right">操作</TableHead>
        </TableRow></TableHeader>
        <TableBody>{visible.map(target => {
          const channel = versionChannel(target.version)
          const check = checks[target.id]
          const latest = newestRelease(check?.releases || [], channel)
          const newer = latest && newestRelease([...check.releases, { ...latest, version: target.version! }], channel)?.version !== target.version
          const statusBadge = !target.ready
            ? <StatusBadge tone="neutral" label="不可升级" />
            : !channel
              ? <StatusBadge tone="neutral" label="分支未知" />
              : !check
                ? <StatusBadge tone="neutral" label="检测中" />
                : check.error
                  ? <StatusBadge tone="neutral" label="检测失败" />
                  : newer
                    ? <StatusBadge tone="success" label="可更新" />
                    : <StatusBadge tone="neutral" label="已是最新" />
          return <TableRow key={target.id} data-state={selected.includes(target.id) ? "selected" : undefined}>
            {!panelMode && <TableCell className="pl-4"><Checkbox aria-label={`选择 ${target.name}`} disabled={!target.ready} checked={selected.includes(target.id)} onCheckedChange={checked => setSelected(previous => checked === true ? [...new Set([...previous, target.id])] : previous.filter(id => id !== target.id))} /></TableCell>}
            <TableCell className={cn("py-4", panelMode && "pl-4")}><div className="font-medium">{target.name}</div><div className="mt-1 text-xs text-muted-foreground">{panelMode ? target.component : `ID ${target.instanceId} · ${target.method}`}</div>{target.updaterVersion && <div className="mt-1 font-data text-[11px] text-muted-foreground">Updater {target.updaterVersion}</div>}</TableCell>
            {!panelMode && <TableCell>{target.server}</TableCell>}
            <TableCell><div className="font-data text-xs">{target.version || "尚未上报"}</div><div className="mt-1 text-xs text-muted-foreground">{channel ? channelNames[channel] : "分支未知"}</div></TableCell>
            <TableCell><div className="font-data text-xs">{!channel ? "请选择升级版本" : !check ? "检测中…" : check.error ? "检测失败" : latest?.version || "暂无发布"}</div><div className="mt-1 max-w-56 whitespace-normal text-xs text-muted-foreground">{check?.error || (latest ? newer ? "有新版本" : latest.version === target.version ? "已是最新版本" : "当前版本高于已发布版本" : "")}</div></TableCell>
            <TableCell>{statusBadge}{!target.ready && <p className="mt-1 max-w-40 whitespace-normal text-xs text-muted-foreground">{target.reason || "更新器未就绪"}</p>}</TableCell>
            <TableCell className="pr-4 text-right"><Button variant="outline" aria-label={`升级 ${target.name}`} disabled={!target.ready} onClick={() => setEditing([target])}><ArrowUpCircle data-icon="inline-start" />升级</Button></TableCell>
          </TableRow>
        })}</TableBody>
      </Table>
      {!visible.length && <Empty><EmptyHeader><EmptyTitle>{search ? "没有匹配的实例" : "暂无版本信息"}</EmptyTitle><EmptyDescription>{search ? "请更换实例或服务器关键字。" : "请确认更新器已连接并上报运行版本。"}</EmptyDescription></EmptyHeader></Empty>}
      <ResourcePagination page={page} pageSize={10} total={filtered.length} onPageChange={setPage} />
    </div>
    {editing.length > 0 && <UpgradeDialog targets={editing} panelMode={panelMode} onClose={() => setEditing([])} onCreated={onCreated} />}
  </>
}

function UpgradeDialog({ targets, panelMode, onClose, onCreated }: { targets: UpdateTarget[]; panelMode: boolean; onClose: () => void; onCreated: () => void }) {
  const api = useAdminApi()
  const [channel, setChannel] = useState<UpdateChannel>(() => versionChannel(targets[0].version) || "stable")
  const [version, setVersion] = useState("")
  const [catalog, setCatalog] = useState<Record<string, UpdateRelease[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string[]>([])
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [requestIds] = useState(() => Object.fromEntries(targets.map(target => [target.id, crypto.randomUUID()])))
  const choices = (catalog[targets[0].id] || []).filter(release => targets.every(target => catalog[target.id]?.some(item => item.version === release.version)))
  const release = choices.find(item => item.version === version)
  const pending = targets.filter(target => target.version !== version && !done.includes(target.id))
  const compatible = (value: string) => targets.every(target => catalog[target.id]?.some(item => item.version === value && item.compatible))
  const canSubmit = !!release && compatible(version) && pending.length > 0 && !loading && !error && !submitting
  useEffect(() => {
    const controller = new AbortController()
    Promise.all(targets.map(async target => {
      const releases = await api.get<UpdateRelease[]>("update/releases", { target_kind: panelMode ? "panel" : "node", component: target.component, channel, machine_id: target.machineId, instance_id: target.instanceId }, controller.signal)
      return [target.id, releases.filter(item => item.component === target.component && item.channel === channel && versionChannel(item.version) === channel)] as const
    })).then(entries => {
      if (!controller.signal.aborted) { setCatalog(Object.fromEntries(entries)); setLoading(false) }
    }).catch(reason => { if (!controller.signal.aborted) { setError(updateError(reason)); setLoading(false) } })
    return () => controller.abort()
  }, [api, targets, panelMode, channel])
  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    const results = await Promise.allSettled(pending.map(target => api.post("update/tasks", {
      target_kind: panelMode ? "panel" : "node", component: target.component, machine_id: target.machineId, instance_id: target.instanceId,
      channel, target_version: version, idempotency_key: `${requestIds[target.id]}:${channel}:${version}`,
    })))
    const succeeded = pending.filter((_, index) => results[index].status === "fulfilled").map(target => target.id)
    const errors: Record<string, string> = {}
    results.forEach((result, index) => { if (result.status === "rejected") errors[pending[index].id] = updateError(result.reason) })
    setDone(previous => [...previous, ...succeeded]); setFailures(errors); setSubmitting(false)
    if (succeeded.length) toast.success(`已创建 ${succeeded.length} 个升级任务。`)
    if (!Object.keys(errors).length) { onClose(); onCreated() }
  }
  const locked = submitting || done.length > 0
  return <Dialog open onOpenChange={open => { if (!open && !submitting) { onClose(); if (done.length) onCreated() } }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader><DialogTitle>{targets.length > 1 ? `批量升级 ${targets.length} 个实例` : `升级 ${targets[0].name}`}</DialogTitle><DialogDescription>{panelMode ? "选择此组件要升级到的分支和版本。" : "选择目标版本，所选实例将分别创建升级任务。"}</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
        <div className="max-h-40 overflow-y-auto rounded-xl border p-3">{targets.map(target => <div key={target.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"><span className="text-sm font-medium">{target.name}</span><span className="text-xs text-muted-foreground">{target.server} · <span className="font-data">{target.version || "尚未上报"}</span>{done.includes(target.id) ? " · 已创建任务" : version === target.version ? " · 已是目标版本，将跳过" : ""}</span>{failures[target.id] && <p className="text-xs text-destructive">{failures[target.id]}</p>}</div>)}</div>
        <FieldGroup>
          <Field><FieldLabel htmlFor="upgrade-channel">目标分支</FieldLabel><Select value={channel} disabled={locked} onValueChange={value => { setChannel(value as UpdateChannel); setVersion(""); setCatalog({}); setLoading(true); setError(""); setFailures({}) }}><SelectTrigger id="upgrade-channel" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="stable">{channelNames.stable}</SelectItem><SelectItem value="dev">{channelNames.dev}</SelectItem></SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="upgrade-version">目标版本</FieldLabel><Select value={version} disabled={loading || !!error || locked || !choices.length} onValueChange={value => { setVersion(value); setFailures({}) }}><SelectTrigger id="upgrade-version" className="w-full min-w-0"><SelectValue placeholder={loading ? "正在读取版本…" : choices.length ? "选择升级版本" : "暂无共同可用版本"} /></SelectTrigger><SelectContent><SelectGroup>{choices.map(item => <SelectItem key={item.version} value={item.version} disabled={!compatible(item.version) || targets.every(target => target.version === item.version)}>{item.version}{!compatible(item.version) ? " · 不兼容" : targets.every(target => target.version === item.version) ? " · 当前版本" : ""}</SelectItem>)}</SelectGroup></SelectContent></Select>
          {error && <FieldDescription>{error} 请关闭窗口后重试。</FieldDescription>}
          {choices.filter(item => !compatible(item.version)).map(item => <FieldDescription key={item.version}>{item.version}：{targets.filter(target => !catalog[target.id]?.find(candidate => candidate.version === item.version)?.compatible).map(target => `${target.name}（${catalog[target.id]?.find(candidate => candidate.version === item.version)?.reason || "当前环境不兼容"}）`).join("、")}</FieldDescription>)}
          </Field>
        </FieldGroup>
        {release && <div className="flex flex-col gap-2 text-sm"><span className="text-xs text-muted-foreground">发布于 {new Date(release.published_at).toLocaleString("zh-CN")}</span><p className="whitespace-pre-wrap break-words">{release.notes || "此版本未提供更新说明。"}</p></div>}
        <p className="text-sm text-muted-foreground">{panelMode ? "Admin 与 Updater 会作为同一版本包交接；升级期间管理后台可能短暂不可用。" : "升级会重启所选实例，其承载的入站连接将短暂中断。"}</p>
      </div>
      <DialogFooter><Button variant="outline" disabled={submitting} onClick={() => { onClose(); if (done.length) onCreated() }}>取消</Button><Button disabled={!canSubmit} onClick={() => void submit()}>{submitting ? "正在提交" : Object.keys(failures).length ? "重试失败实例" : targets.length > 1 ? `确认升级（${pending.length}）` : "确认升级"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
