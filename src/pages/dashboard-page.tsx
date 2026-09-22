import { formatTrafficBytes } from "@/lib/traffic-format";
import * as React from "react"
import { useSiteBranding } from "@/lib/site-branding"
import { Activity, ArrowLeftRight, CircleAlert, CircleDollarSign, RefreshCw, Users } from "lucide-react"
import { Link } from "react-router-dom"
import { ResourceError, ResourceTableLoading } from "@/components/control-plane/resource-states"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAdminApi } from "@/lib/auth"
import { useAdminQuery } from "@/hooks/use-admin-query"

type Traffic = { upload?: number | string; download?: number | string; total?: number | string }
type Stats = {
  todayIncome: number
  dayIncomeGrowth: number
  currentMonthIncome: number
  monthIncomeGrowth: number
  currentMonthCommissionPayout: number
  commissionPendingTotal: number
  currentMonthNewUsers: number
  totalUsers: number
  activeUsers: number
  userGrowth: number
  onlineUsers: number
  onlineDevices: number
  ticketPendingTotal: number
  onlineNodes: number
  todayTraffic: Traffic
  monthTraffic: Traffic
  totalTraffic: Traffic
}

type AuditEntry = {
  id: number
  action?: string
  method?: string
  uri?: string
  ip?: string
  created_at?: number | string
  admin?: { email?: string } | null
}

type AuditPage = { data?: AuditEntry[]; total?: number }

export function DashboardPage() {
  const api = useAdminApi()
  const { selfUseMode } = useSiteBranding()
  const query = React.useCallback(async (signal: AbortSignal) => {
    const [statsResponse, audit] = await Promise.all([
      api.get<{ data: Stats }>("stat/getStats", undefined, signal),
      api.get<AuditPage>("system/getAuditLog", { current: 1, page_size: 6 }, signal).catch(() => ({ data: [] })),
    ])
    return { stats: statsResponse.data, audit: audit.data ?? [] }
  }, [api])
  const dashboard = useAdminQuery(query)
  const stats = dashboard.data?.stats

  const metrics = selfUseMode ? [
    { label: "实时在线", value: stats ? String(stats.onlineUsers) : "—", hint: stats ? `${stats.onlineDevices} 台设备 · ${stats.onlineNodes} 个在线节点` : "正在同步", icon: Activity, tone: "success" as const },
    { label: "用户", value: stats ? String(stats.totalUsers) : "—", hint: stats ? `${stats.activeUsers} 个有效订阅 · 本月 +${stats.currentMonthNewUsers}` : "正在同步", icon: Users, tone: "neutral" as const },
    { label: "今日流量", value: formatBytes(stats?.todayTraffic.total), hint: formatTrafficSplit(stats?.todayTraffic), icon: ArrowLeftRight, tone: "info" as const },
    { label: "待处理工单", value: stats ? String(stats.ticketPendingTotal) : "—", hint: "自用模式已隐藏收入与佣金统计", icon: CircleAlert, tone: "warning" as const },
  ] : [
    { label: "今日收入", value: formatMoney(stats?.todayIncome), hint: formatGrowth(stats?.dayIncomeGrowth), icon: CircleDollarSign, tone: "success" as const },
    { label: "用户", value: stats ? String(stats.totalUsers) : "—", hint: stats ? `${stats.activeUsers} 个有效订阅 · 本月 +${stats.currentMonthNewUsers}` : "正在同步", icon: Users, tone: "neutral" as const },
    { label: "实时在线", value: stats ? String(stats.onlineUsers) : "—", hint: stats ? `${stats.onlineDevices} 台设备 · ${stats.onlineNodes} 个在线节点` : "正在同步", icon: Activity, tone: "info" as const },
    { label: "待处理", value: stats ? String(stats.ticketPendingTotal + stats.commissionPendingTotal) : "—", hint: stats ? `${stats.ticketPendingTotal} 个工单 · ${stats.commissionPendingTotal} 笔佣金` : "正在同步", icon: CircleAlert, tone: "warning" as const },
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="仪表盘" description="业务摘要和最近管理操作均来自真实 XBoard 后端；单个可选统计失败不会伪装成零。" action={<Button variant="outline" disabled={dashboard.refreshing} onClick={dashboard.reload}><RefreshCw className={dashboard.refreshing ? "animate-spin motion-reduce:animate-none" : undefined} data-icon="inline-start" aria-hidden="true" />刷新</Button>} />
      {dashboard.error ? <ResourceError title="仪表盘读取失败" message={dashboard.error} onRetry={dashboard.reload} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Card key={metric.label} className="gap-3 py-4 shadow-none"><CardHeader className="flex-row items-center justify-between px-4"><CardDescription>{metric.label}</CardDescription><metric.icon className="size-4 text-muted-foreground" aria-hidden="true" /></CardHeader><CardContent className="px-4"><div className="font-data text-2xl font-semibold tracking-tight">{metric.value}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><StatusBadge label={stats ? "已同步" : "读取中"} tone={stats ? metric.tone : "neutral"} /><span>{metric.hint}</span></div></CardContent></Card>)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b px-4 py-4"><CardTitle className="text-base">{selfUseMode ? "流量概览" : "业务与流量"}</CardTitle><CardDescription>{selfUseMode ? "自用模式下隐藏收入与佣金，仅保留流量与在线信息" : "收入使用后端原始主单位，流量统一换算为易读格式"}</CardDescription></CardHeader>
          <CardContent className="grid gap-0 p-0 sm:grid-cols-2">
            {selfUseMode ? (
              <>
                <Summary label="今日流量" value={formatBytes(stats?.todayTraffic.total)} hint={formatTrafficSplit(stats?.todayTraffic)} />
                <Summary label="本月流量" value={formatBytes(stats?.monthTraffic.total)} hint={formatTrafficSplit(stats?.monthTraffic)} />
                <Summary label="累计流量" value={formatBytes(stats?.totalTraffic.total)} hint={formatTrafficSplit(stats?.totalTraffic)} />
                <Summary label="在线规模" value={stats ? `${stats.onlineDevices} 台设备` : "—"} hint={stats ? `${stats.onlineNodes} 个在线节点 · ${stats.onlineUsers} 位在线用户` : "正在同步"} />
              </>
            ) : (
              <>
                <Summary label="本月收入" value={formatMoney(stats?.currentMonthIncome)} hint={formatGrowth(stats?.monthIncomeGrowth)} />
                <Summary label="本月佣金发放" value={formatMoney(stats?.currentMonthCommissionPayout)} hint={`${stats?.commissionPendingTotal ?? 0} 笔待确认`} />
                <Summary label="今日流量" value={formatBytes(stats?.todayTraffic.total)} hint={formatTrafficSplit(stats?.todayTraffic)} />
                <Summary label="本月流量" value={formatBytes(stats?.monthTraffic.total)} hint={formatTrafficSplit(stats?.monthTraffic)} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="flex-row items-center justify-between border-b px-4 py-4"><div><CardTitle className="flex items-center gap-2 text-base"><Activity className="size-4" aria-hidden="true" />最近管理操作</CardTitle><CardDescription className="mt-1">不展开可能含敏感字段的 request_data</CardDescription></div><Button variant="outline" size="sm" asChild><Link to="/audit-logs">全部日志</Link></Button></CardHeader>
          <Table><TableHeader><TableRow><TableHead className="pl-4">动作</TableHead><TableHead>目标</TableHead><TableHead>时间</TableHead></TableRow></TableHeader><TableBody>{dashboard.loading ? <ResourceTableLoading columns={3} rows={4} /> : dashboard.data?.audit.length ? dashboard.data.audit.map((entry) => <TableRow key={entry.id}><TableCell className="pl-4"><span className="font-medium">{entry.action || entry.method || "管理操作"}</span><div className="text-[11px] text-muted-foreground">{entry.admin?.email ?? "管理员"}</div></TableCell><TableCell className="max-w-56 truncate font-data text-xs">{entry.uri || "—"}</TableCell><TableCell className="font-data text-xs text-muted-foreground">{formatTime(entry.created_at)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">暂无审计记录</TableCell></TableRow>}</TableBody></Table>
        </Card>
      </div>
    </div>
  )
}

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="border-b p-4 odd:sm:border-r"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 font-data text-xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{hint}</div></div>
}

function formatMoney(value?: number) {
  return value === undefined ? "—" : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value / 100)
}

function formatGrowth(value?: number) {
  if (value === undefined) return "正在同步"
  return `${value >= 0 ? "+" : ""}${value}% 对比上期`
}

function formatBytes(value?: number | string) {
  return formatTrafficBytes(value == null ? undefined : Number(value));
}

function formatTrafficSplit(traffic?: Traffic) {
  return `上行 ${formatBytes(traffic?.upload)} · 下行 ${formatBytes(traffic?.download)}`
}

function formatTime(value: AuditEntry["created_at"]) {
  if (!value) return "—"
  const date = new Date(typeof value === "number" ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date)
}
