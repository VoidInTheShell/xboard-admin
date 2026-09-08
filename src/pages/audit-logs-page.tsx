import * as React from "react"
import { Eye, RefreshCw, Search } from "lucide-react"
import { ResourceError, ResourceTableLoading } from "@/components/control-plane/resource-states"
import { ResourcePagination } from "@/components/control-plane/resource-pagination"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAdminApi } from "@/lib/auth"
import { useAdminQuery } from "@/hooks/use-admin-query"

type AuditEntry = {
  id: number
  admin_id?: number
  actor_type?: "admin" | "mcp"
  mcp_key_id?: number | null
  request_id?: string | null
  client_id?: string | null
  action?: string
  method?: string
  uri?: string
  request_data?: unknown
  ip?: string
  created_at?: number | string
  admin?: { id?: number; email?: string } | null
  mcp_key?: { id?: number; name?: string; token_suffix?: string } | null
}

type AuditResponse = { data: AuditEntry[]; total: number }

export function AuditLogsPage() {
  const api = useAdminApi()
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [keyword, setKeyword] = React.useState("")
  const [selected, setSelected] = React.useState<AuditEntry | null>(null)
  const pageSize = 20
  const query = React.useCallback((signal: AbortSignal) => api.get<AuditResponse>("system/getAuditLog", { current: page, page_size: pageSize, keyword }, signal), [api, keyword, page])
  const logs = useAdminQuery(query)

  function applySearch(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setKeyword(search.trim())
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="审计日志" description="查看管理员和 MCP Agent 的操作身份、路由、来源和时间；请求内容默认只展示字段名，避免再次暴露密码、Token 或订阅地址。" action={<Button variant="outline" disabled={logs.refreshing} onClick={logs.reload}><RefreshCw className={logs.refreshing ? "animate-spin motion-reduce:animate-none" : undefined} data-icon="inline-start" aria-hidden="true" />刷新</Button>} />
      {logs.error ? <ResourceError title="审计日志读取失败" message={logs.error} onRetry={logs.reload} /> : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <form className="flex flex-col gap-2 border-b p-3 sm:flex-row" onSubmit={applySearch}><InputGroup className="w-full sm:max-w-md"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput id="audit-log-search" name="audit-log-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 URI 或请求字段…" aria-label="搜索审计日志" /></InputGroup><Button variant="outline" type="submit">搜索</Button>{keyword ? <Button variant="ghost" type="button" onClick={() => { setSearch(""); setKeyword(""); setPage(1) }}>清除</Button> : null}</form>
        <Table><TableHeader><TableRow><TableHead className="pl-4">执行者</TableHead><TableHead>动作</TableHead><TableHead>请求</TableHead><TableHead>来源 IP</TableHead><TableHead>时间</TableHead><TableHead className="w-12"><span className="sr-only">详情</span></TableHead></TableRow></TableHeader><TableBody>{logs.loading ? <ResourceTableLoading columns={6} /> : logs.data?.data.length ? logs.data.data.map((entry) => <TableRow key={entry.id}><TableCell className="pl-4"><div className="flex items-center gap-1.5 font-medium">{entry.actor_type === "mcp" ? <Badge variant="outline">Agent</Badge> : null}{entry.actor_type === "mcp" ? `MCP · ${entry.mcp_key?.name ?? `Key #${entry.mcp_key_id ?? "—"}`}` : entry.admin?.email ?? `管理员 #${entry.admin_id ?? "—"}`}</div><span className="font-data text-[11px] text-muted-foreground">{entry.actor_type === "mcp" && entry.mcp_key?.token_suffix ? `xbmcp_••••${entry.mcp_key.token_suffix} · ` : ""}日志 #{entry.id}</span></TableCell><TableCell><Badge variant="secondary">{entry.action || "管理操作"}</Badge></TableCell><TableCell className="max-w-md"><span className="mr-2 font-data text-[11px] font-semibold">{entry.method || "—"}</span><span className="font-data text-xs text-muted-foreground">{entry.uri || "—"}</span></TableCell><TableCell className="font-data text-xs">{entry.ip || "—"}</TableCell><TableCell className="font-data text-xs text-muted-foreground">{formatTime(entry.created_at)}</TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label={`查看日志 ${entry.id}`} onClick={() => setSelected(entry)}><Eye aria-hidden="true" /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-40 text-center text-sm text-muted-foreground">没有符合条件的审计记录</TableCell></TableRow>}</TableBody></Table>
        <ResourcePagination page={page} pageSize={pageSize} total={logs.data?.total ?? 0} disabled={logs.loading || logs.refreshing} loading={logs.loading} onPageChange={setPage} />
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>审计日志 #{selected?.id}</DialogTitle><DialogDescription>请求数据只显示字段路径，不展示原始值。</DialogDescription></DialogHeader><dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]"><dt className="text-muted-foreground">执行者</dt><dd>{selected?.actor_type === "mcp" ? `MCP · ${selected.mcp_key?.name ?? `Key #${selected.mcp_key_id ?? "—"}`}` : selected?.admin?.email ?? "—"}</dd><dt className="text-muted-foreground">所属管理员</dt><dd>{selected?.admin?.email ?? "—"}</dd><dt className="text-muted-foreground">动作</dt><dd>{selected?.action ?? "—"}</dd><dt className="text-muted-foreground">请求</dt><dd className="break-all font-data text-xs">{selected?.method ?? "—"} {selected?.uri ?? "—"}</dd><dt className="text-muted-foreground">请求 ID</dt><dd className="break-all font-data text-xs">{selected?.request_id ?? "—"}</dd><dt className="text-muted-foreground">来源 IP</dt><dd className="font-data">{selected?.ip ?? "—"}</dd><dt className="text-muted-foreground">请求字段</dt><dd className="flex flex-wrap gap-1">{requestKeys(selected?.request_data).length ? requestKeys(selected?.request_data).map((key) => <Badge key={key} variant="outline" className="font-data text-[10px]">{key}</Badge>) : "无可展示字段"}</dd></dl></DialogContent></Dialog>
    </div>
  )
}

function requestKeys(value: unknown) {
  if (!value) return []
  let parsed: unknown = value
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown } catch { return ["非结构化内容（已隐藏）"] }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return []
  return Object.keys(parsed as Record<string, unknown>)
}

function formatTime(value: AuditEntry["created_at"]) {
  if (!value) return "—"
  const date = new Date(typeof value === "number" ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(date)
}
