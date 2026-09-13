import * as React from "react"
import { LoaderCircle, RefreshCw, RotateCcw, Search } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ConfirmActionDialog } from "@/components/control-plane/confirm-action-dialog"
import { ResourceEmpty, ResourceError, ResourceTableLoading } from "@/components/control-plane/resource-states"
import { ResourcePagination } from "@/components/control-plane/resource-pagination"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { useAdminApi } from "@/lib/auth"
import { getErrorMessage, useAdminQuery } from "@/hooks/use-admin-query"

type TrafficValue = { formatted?: string; total?: number }
type ResetLog = { id: number; user_id: number; user_email: string; reset_type: string; reset_type_name: string; reset_time: string; old_traffic: TrafficValue; new_traffic: TrafficValue; trigger_source: string; trigger_source_name: string }
type LogsResponse = { data: ResetLog[]; pagination: { current_page: number; last_page: number; per_page: number; total: number } }
type StatsResponse = { data: { total_resets: number; auto_resets: number; manual_resets: number; cron_resets: number } }
type Filters = { userId: string; email: string; resetType: string; source: string; startDate: string; endDate: string }

const emptyFilters: Filters = { userId: "", email: "", resetType: "all", source: "all", startDate: "", endDate: "" }

export function TrafficResetLogsPage({ embedded = false }: { embedded?: boolean }) {
  const api = useAdminApi()
  const [searchParams] = useSearchParams()
  const routeUserId = searchParams.get("user_id")?.trim() ?? ""
  const [page, setPage] = React.useState(1)
  const [draftFilters, setDraftFilters] = React.useState<Filters>(() => ({ ...emptyFilters, userId: /^\d+$/.test(routeUserId) ? routeUserId : "" }))
  const [filters, setFilters] = React.useState<Filters>(() => ({ ...emptyFilters, userId: /^\d+$/.test(routeUserId) ? routeUserId : "" }))
  const [resetOpen, setResetOpen] = React.useState(false)
  const [userId, setUserId] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [resetErrors, setResetErrors] = React.useState<Record<string, string[]>>({})
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const pageSize = 20

  const query = React.useCallback(async (signal: AbortSignal) => {
    const queryParams = {
      page,
      per_page: pageSize,
      user_id: filters.userId || undefined,
      user_email: filters.email,
      reset_type: filters.resetType === "all" ? undefined : filters.resetType,
      trigger_source: filters.source === "all" ? undefined : filters.source,
      start_date: filters.startDate,
      end_date: filters.endDate,
    }
    const [logs, stats] = await Promise.all([
      api.get<LogsResponse>("traffic-reset/logs", queryParams, signal),
      api.get<StatsResponse>("traffic-reset/stats", { days: 30 }, signal),
    ])
    return { logs, stats: stats.data }
  }, [api, filters, page])
  const resetQuery = useAdminQuery(query)

  function applyFilters(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setFilters(draftFilters)
  }

  async function resetUser() {
    setResetting(true)
    setResetErrors({})
    try {
      await api.post<unknown>("traffic-reset/reset-user", { user_id: Number(userId), reason: reason.trim() || null })
      toast.success("用户流量已重置")
      setConfirmOpen(false)
      setResetOpen(false)
      setUserId("")
      setReason("")
      resetQuery.reload()
    } catch (error) {
      if (error instanceof ApiError) setResetErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, "流量重置失败。"))
    } finally {
      setResetting(false)
    }
  }

  const stats = resetQuery.data?.stats
  const logs = resetQuery.data?.logs.data ?? []
  const total = resetQuery.data?.logs.pagination.total ?? 0

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader embedded={embedded} title="流量重置日志" description="审计自动、定时、API 与手动重置；手动重置需要用户 ID、原因和二次确认。" action={<div className="flex gap-2"><Button variant="outline" disabled={resetQuery.refreshing} onClick={resetQuery.reload}><RefreshCw className={resetQuery.refreshing ? "animate-spin motion-reduce:animate-none" : undefined} data-icon="inline-start" aria-hidden="true" />刷新</Button><Button onClick={() => { setResetErrors({}); setResetOpen(true) }}><RotateCcw data-icon="inline-start" aria-hidden="true" />手动重置</Button></div>} />
      {resetQuery.error ? <ResourceError title="流量重置日志读取失败" message={resetQuery.error} onRetry={resetQuery.reload} /> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="近 30 天总重置" value={stats?.total_resets} /><StatCard label="自动触发" value={stats?.auto_resets} /><StatCard label="定时任务" value={stats?.cron_resets} /><StatCard label="管理员手动" value={stats?.manual_resets} /></div>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <form className="grid gap-2 border-b p-3 md:grid-cols-2 xl:grid-cols-[minmax(120px,0.55fr)_minmax(180px,1fr)_repeat(4,minmax(130px,0.7fr))_auto]" onSubmit={applyFilters}>
          <Input type="number" min="1" value={draftFilters.userId} onChange={(event) => setDraftFilters({ ...draftFilters, userId: event.target.value })} placeholder="用户 ID" aria-label="筛选用户 ID" />
          <Input value={draftFilters.email} onChange={(event) => setDraftFilters({ ...draftFilters, email: event.target.value })} placeholder="用户邮箱" aria-label="筛选用户邮箱" />
          <Select value={draftFilters.resetType} onValueChange={(resetType) => setDraftFilters({ ...draftFilters, resetType })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部重置类型</SelectItem><SelectItem value="monthly">按月重置</SelectItem><SelectItem value="first_day_month">每月首日</SelectItem><SelectItem value="yearly">按年重置</SelectItem><SelectItem value="first_day_year">每年首日</SelectItem><SelectItem value="manual">手动</SelectItem><SelectItem value="purchase">购买触发</SelectItem></SelectGroup></SelectContent></Select>
          <Select value={draftFilters.source} onValueChange={(source) => setDraftFilters({ ...draftFilters, source })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部触发来源</SelectItem><SelectItem value="auto">自动</SelectItem><SelectItem value="manual">管理员手动</SelectItem><SelectItem value="api">API</SelectItem><SelectItem value="cron">定时任务</SelectItem><SelectItem value="user_access">用户访问</SelectItem></SelectGroup></SelectContent></Select>
          <Input type="date" value={draftFilters.startDate} onChange={(event) => setDraftFilters({ ...draftFilters, startDate: event.target.value })} aria-label="开始日期" />
          <Input type="date" value={draftFilters.endDate} onChange={(event) => setDraftFilters({ ...draftFilters, endDate: event.target.value })} aria-label="结束日期" />
          <Button variant="outline" type="submit"><Search data-icon="inline-start" aria-hidden="true" />筛选</Button>
        </form>
        <Table><TableHeader><TableRow><TableHead className="pl-4">用户</TableHead><TableHead>重置方式</TableHead><TableHead>触发来源</TableHead><TableHead>重置前</TableHead><TableHead>重置后</TableHead><TableHead>时间</TableHead></TableRow></TableHeader><TableBody>{resetQuery.loading ? <ResourceTableLoading columns={6} /> : logs.map((log) => <TableRow key={log.id}><TableCell className="pl-4"><div className="font-medium">{log.user_email}</div><span className="font-data text-[11px] text-muted-foreground">用户 #{log.user_id}</span></TableCell><TableCell><Badge variant="secondary">{log.reset_type_name || log.reset_type}</Badge></TableCell><TableCell>{log.trigger_source_name || log.trigger_source}</TableCell><TableCell className="font-data text-xs">{log.old_traffic.formatted ?? formatBytes(log.old_traffic.total)}</TableCell><TableCell className="font-data text-xs">{log.new_traffic.formatted ?? formatBytes(log.new_traffic.total)}</TableCell><TableCell className="font-data text-xs text-muted-foreground">{formatTime(log.reset_time)}</TableCell></TableRow>)}</TableBody></Table>
        {!resetQuery.loading && !logs.length ? <ResourceEmpty title="没有符合条件的重置记录" description="可以调整筛选条件后重新查询，或等待下一次自动、定时或手动重置。" /> : null}
        <ResourcePagination page={page} pageSize={pageSize} total={total} disabled={resetQuery.loading || resetQuery.refreshing} loading={resetQuery.loading} onPageChange={setPage} />
      </Card>

      <Dialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>手动重置用户流量</DialogTitle><DialogDescription>此操作会修改用户当前已用流量并写入审计日志。请输入明确原因后继续。</DialogDescription></DialogHeader><FieldGroup><Field data-invalid={Boolean(resetErrors.user_id)}><FieldLabel htmlFor="reset-user-id">用户 ID<span aria-hidden="true" className="text-destructive">*</span></FieldLabel><Input id="reset-user-id" type="number" min="1" value={userId} aria-invalid={Boolean(resetErrors.user_id)} onChange={(event) => setUserId(event.target.value)} /><FieldError errors={resetErrors.user_id?.map((message) => ({ message }))} /></Field><Field data-invalid={Boolean(resetErrors.reason)}><FieldLabel htmlFor="reset-reason">原因</FieldLabel><Textarea id="reset-reason" maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：测试用户请求重新开始计量" /><FieldDescription>{reason.length} / 255；原因会进入重置 metadata。</FieldDescription><FieldError errors={resetErrors.reason?.map((message) => ({ message }))} /></Field></FieldGroup><DialogFooter><Button variant="outline" disabled={resetting} onClick={() => setResetOpen(false)}>取消</Button><Button variant="destructive" disabled={!userId || resetting} onClick={() => setConfirmOpen(true)}>{resetting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : null}继续确认</Button></DialogFooter></DialogContent></Dialog>
      <ConfirmActionDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`重置用户 #${userId} 的流量？`} description={`用户当前上下行用量将被清零。原因：${reason.trim() || "未填写"}。该操作只应对已核对身份的测试或目标用户执行。`} confirmLabel="确认重置" destructive busy={resetting} onConfirm={resetUser} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return <Card className="gap-2 py-4 shadow-none"><CardHeader className="px-4"><CardDescription>{label}</CardDescription></CardHeader><CardContent className="px-4"><CardTitle className="font-data text-2xl">{value ?? "—"}</CardTitle></CardContent></Card>
}

function formatBytes(value?: number) {
  if (!value) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(2)} ${units[index]}`
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(date)
}
