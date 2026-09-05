import * as React from "react"
import { ArrowLeft, Braces, Gauge, GripVertical, MoreHorizontal, Plus, RefreshCw, Search, Settings2 } from "lucide-react"
import { Link, Navigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { CatalogDialog } from "@/components/control-plane/catalog-dialog"
import { CatalogForm } from "@/components/control-plane/catalog-form"
import { ServerScopeRail } from "@/components/data/server-scope-rail"
import { StatusBadge } from "@/components/data/status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { certificateCatalog } from "@/lib/control-plane/certificate-catalog"
import { inboundCatalog } from "@/lib/control-plane/inbound-catalog"
import { hostCatalog, outboundCatalog } from "@/lib/control-plane/outbound-host-catalog"
import { routingCatalog, xrayCatalog } from "@/lib/control-plane/routing-xray-catalog"
import type { CatalogTab } from "@/lib/control-plane/catalog-types"
import { certificates, hosts, inbounds, outbounds, routingRules, servers } from "@/lib/mock-data"
import { serverWorkspaceTabs } from "@/lib/navigation"

type DialogKind = "inbound" | "host" | "certificate" | "outbound" | "route" | null

type DialogConfig = {
  title: string
  description: string
  tabs: CatalogTab[]
  success: string
}

const dialogConfigs: Record<Exclude<DialogKind, null>, DialogConfig> = {
  inbound: {
    title: "新增入站",
    description: "完整配置协议、传输、安全、嗅探和高级 Xray 入站参数；当前仅保存到本地原型。",
    tabs: inboundCatalog,
    success: "入站已保存到本地原型",
  },
  host: {
    title: "新增主机",
    description: "配置发布地址、传输覆盖、安全参数和订阅端点映射；当前仅保存到本地原型。",
    tabs: hostCatalog,
    success: "主机已保存到本地原型",
  },
  certificate: {
    title: "新增 ACME 证书",
    description: "配置域名、证书机构、挑战方式和自动续签策略；敏感凭据尚未写入后端密钥库。",
    tabs: certificateCatalog,
    success: "证书任务已保存到本地原型",
  },
  outbound: {
    title: "绑定 / 新增出站候选",
    description: "配置完整 Xray 出站协议能力，并作为当前服务器的候选出站；当前仅保存到本地原型。",
    tabs: outboundCatalog,
    success: "出站候选已保存到本地原型",
  },
  route: {
    title: "新增路由规则",
    description: "配置匹配条件、目标出站、负载均衡与高级规则字段；当前仅保存到本地原型。",
    tabs: routingCatalog,
    success: "路由规则已保存到本地原型",
  },
}

function WorkspaceNavigation({ serverId, active }: { serverId: string; active: string }) {
  return (
    <nav aria-label="服务器配置" className="mb-4 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1">
        {serverWorkspaceTabs.map((tab) => (
          <Button
            key={tab.value}
            asChild
            variant="ghost"
            className={`h-11 rounded-t-xl rounded-b-none border-b-2 px-4 ${active === tab.value ? "border-primary bg-muted text-foreground hover:bg-muted" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
          >
            <Link to={`/servers/${serverId}/${tab.value}`}>
              <tab.icon data-icon="inline-start" aria-hidden="true" />
              {tab.title}
            </Link>
          </Button>
        ))}
      </div>
    </nav>
  )
}

function Toolbar({
  searchLabel,
  actionLabel,
  onAction,
  secondary,
}: {
  searchLabel: string
  actionLabel: string
  onAction: () => void
  secondary?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
      <InputGroup className="w-full sm:max-w-sm">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput
          id="server-workspace-search"
          name="server-workspace-search"
          aria-label={searchLabel}
          placeholder={`${searchLabel}…`}
        />
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        {secondary}
        <Button onClick={onAction}><Plus data-icon="inline-start" aria-hidden="true" />{actionLabel}</Button>
      </div>
    </div>
  )
}

function RowMenu({ label, onEdit, onDelete, children }: { label: string; onEdit: () => void; onDelete?: () => void; children?: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${label} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onEdit}>编辑</DropdownMenuItem>
          {children}
          <DropdownMenuItem>复制</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>删除</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InboundsPanel({ serverId, openDialog }: { serverId: string; openDialog: () => void }) {
  const serverInbounds = inbounds.filter((inbound) => inbound.serverId === serverId)

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Toolbar searchLabel="搜索入站" actionLabel="新增入站" onAction={openDialog} />
      <Table>
        <TableHeader><TableRow><TableHead className="pl-4">入站</TableHead><TableHead>协议</TableHead><TableHead>监听</TableHead><TableHead>传输</TableHead><TableHead>安全</TableHead><TableHead>用户</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{serverInbounds.map((inbound) => (
          <TableRow key={inbound.id}>
            <TableCell className="pl-4 font-medium">{inbound.name}</TableCell>
            <TableCell><Badge variant="outline">{inbound.protocol}</Badge></TableCell>
            <TableCell className="font-data text-xs">{inbound.listen}</TableCell>
            <TableCell>{inbound.transport}</TableCell>
            <TableCell>{inbound.security}</TableCell>
            <TableCell className="font-data">{inbound.clients}</TableCell>
            <TableCell><StatusBadge label={inbound.enabled ? "启用" : "停用"} tone={inbound.enabled ? "success" : "neutral"} /></TableCell>
            <TableCell><RowMenu label={inbound.name} onEdit={openDialog} /></TableCell>
          </TableRow>
        ))}{serverInbounds.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">当前服务器暂无入站</TableCell></TableRow>
        ) : null}</TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">入站负责运行时监听；对外发布地址由“主机”独立维护。</div>
    </Card>
  )
}

function HostsPanel({ openDialog }: { openDialog: () => void }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Toolbar searchLabel="搜索发布主机" actionLabel="新增主机" onAction={openDialog} />
      <Table>
        <TableHeader><TableRow><TableHead className="pl-4">主机</TableHead><TableHead>地址</TableHead><TableHead>端口</TableHead><TableHead>TLS</TableHead><TableHead>SNI</TableHead><TableHead>路径</TableHead><TableHead>优先级</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{hosts.map((host) => <TableRow key={host.id}><TableCell className="pl-4 font-medium">{host.name}</TableCell><TableCell className="font-data text-xs">{host.address}</TableCell><TableCell className="font-data text-xs">{host.port}</TableCell><TableCell>{host.tls ? "TLS" : "无"}</TableCell><TableCell className="font-data text-xs">{host.sni}</TableCell><TableCell className="font-data text-xs">{host.path}</TableCell><TableCell className="font-data">{host.priority}</TableCell><TableCell><StatusBadge label={host.enabled ? "启用" : "停用"} tone={host.enabled ? "success" : "neutral"} /></TableCell><TableCell><RowMenu label={host.name} onEdit={openDialog} /></TableCell></TableRow>)}</TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">主机是订阅对外发布端点，不等同于承载 Xboard-Node 的物理服务器。</div>
    </Card>
  )
}

function CertificatesPanel({ openDialog }: { openDialog: () => void }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Toolbar
        searchLabel="搜索证书或域名"
        actionLabel="新增证书"
        onAction={openDialog}
        secondary={<Button variant="outline" onClick={() => toast.success("证书续签检查已在本地原型中完成")}><RefreshCw data-icon="inline-start" aria-hidden="true" />检查续签</Button>}
      />
      <Table>
        <TableHeader><TableRow><TableHead className="pl-4">证书</TableHead><TableHead>域名 / SAN</TableHead><TableHead>签发机构</TableHead><TableHead>挑战</TableHead><TableHead>到期时间</TableHead><TableHead>自动续签</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{certificates.map((certificate) => {
          const tone = certificate.status === "有效" ? "success" : certificate.status === "续签中" ? "info" : certificate.status === "失败" ? "danger" : "neutral"
          return (
            <TableRow key={certificate.id}>
              <TableCell className="pl-4"><div className="font-medium">{certificate.name}</div><div className="mt-0.5 text-xs text-muted-foreground">上次续签 {certificate.lastRenewal}</div></TableCell>
              <TableCell><div className="max-w-80"><div className="font-data text-xs">{certificate.domains[0]}</div>{certificate.domains.length > 1 ? <div className="mt-1 text-xs text-muted-foreground">另 {certificate.domains.length - 1} 个 SAN</div> : null}</div></TableCell>
              <TableCell>{certificate.issuer}</TableCell>
              <TableCell><Badge variant="outline">{certificate.challenge}</Badge></TableCell>
              <TableCell className="font-data text-xs">{certificate.expiresAt}</TableCell>
              <TableCell><StatusBadge label={certificate.autoRenew ? "已启用" : "已停用"} tone={certificate.autoRenew ? "success" : "neutral"} /></TableCell>
              <TableCell><StatusBadge label={certificate.status} tone={tone} /></TableCell>
              <TableCell><RowMenu label={certificate.name} onEdit={openDialog}><DropdownMenuItem onSelect={() => toast.success(`${certificate.name} 已加入本地续签队列`)}>立即续签</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.success(`${certificate.name} 的证书链校验通过`)}>校验证书链</DropdownMenuItem></RowMenu></TableCell>
            </TableRow>
          )
        })}</TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">ACME 账户和 DNS 凭据必须由后端密钥库存储；首版只实现控制面信息架构与交互。</div>
    </Card>
  )
}

function ServerOutboundsPanel({ serverName, openDialog }: { serverName: string; openDialog: () => void }) {
  const bound = outbounds.slice(0, 3)
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Toolbar searchLabel="搜索服务器出站" actionLabel="绑定候选" onAction={openDialog} secondary={<Button variant="outline" onClick={() => toast.success("服务器出站本地测速完成")}><Gauge data-icon="inline-start" aria-hidden="true" />全部测速</Button>} />
      <Table>
        <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">排序</span></TableHead><TableHead>候选</TableHead><TableHead>Tag</TableHead><TableHead>协议</TableHead><TableHead>来源服务器</TableHead><TableHead>有效行为</TableHead><TableHead>延迟</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{bound.map((item) => { const direct = item.sourceServer === serverName || item.tag === "direct"; return <TableRow key={item.id}><TableCell><Button variant="ghost" size="icon-xs" aria-label={`拖动 ${item.name}`}><GripVertical aria-hidden="true" /></Button></TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell className="font-data text-xs">{item.tag}</TableCell><TableCell>{item.protocol}</TableCell><TableCell>{item.sourceServer ?? "--"}</TableCell><TableCell><StatusBadge label={direct ? "direct" : item.tag} tone={direct ? "neutral" : "info"} /></TableCell><TableCell className="font-data text-xs">{item.latency === null ? "未测试" : `${item.latency} ms`}</TableCell><TableCell><StatusBadge label={item.enabled ? "启用" : "停用"} tone={item.enabled ? "success" : "neutral"} /></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${item.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => toast.success(`${item.name} 本地测速完成`)}>测速</DropdownMenuItem><DropdownMenuItem variant="destructive">解除绑定</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell></TableRow> })}</TableBody>
      </Table>
    </Card>
  )
}

function RoutingPanel({ openDialog }: { openDialog: () => void }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Toolbar searchLabel="搜索路由规则" actionLabel="新增规则" onAction={openDialog} secondary={<Button variant="outline" onClick={() => toast.success("规则测试通过：命中流媒体出口")}><Gauge data-icon="inline-start" aria-hidden="true" />测试规则</Button>} />
      <Table>
        <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">排序</span></TableHead><TableHead>优先级</TableHead><TableHead>规则</TableHead><TableHead>匹配条件</TableHead><TableHead>动作 / 出站</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{routingRules.map((rule) => <TableRow key={rule.id}><TableCell><Button variant="ghost" size="icon-xs" aria-label={`拖动 ${rule.name}`}><GripVertical aria-hidden="true" /></Button></TableCell><TableCell className="font-data">{rule.priority}</TableCell><TableCell className="font-medium">{rule.name}</TableCell><TableCell className="font-data max-w-md truncate text-xs">{rule.match}</TableCell><TableCell><StatusBadge label={rule.action} tone={rule.action === "block" ? "danger" : rule.action === "direct" ? "neutral" : "info"} /></TableCell><TableCell><StatusBadge label={rule.enabled ? "启用" : "停用"} tone={rule.enabled ? "success" : "neutral"} /></TableCell><TableCell><RowMenu label={rule.name} onEdit={openDialog} /></TableCell></TableRow>)}</TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">规则按优先级从小到大匹配；同一规则内的结构化条件由 Xray 规则语义组合。</div>
    </Card>
  )
}

function XrayConfigPanel() {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle className="text-base">Xray 配置资源</CardTitle><CardDescription className="mt-1">维护 DNS、负载均衡、探测、策略、日志、API、统计与高级原始配置。</CardDescription></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => toast.success("配置校验通过")}><Braces data-icon="inline-start" aria-hidden="true" />校验</Button><Button onClick={() => toast.success("Xray 配置已保存到本地原型")}>保存配置</Button></div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <CatalogForm
          tabs={xrayCatalog}
          ariaLabel="Xray 配置分组"
          navigationStyle="sidebar"
          navigationLabel="配置分类"
          sidebarStickyOffset="page"
        />
      </CardContent>
    </Card>
  )
}

export function ServerWorkspacePage() {
  const { serverId = "us2", section = "inbounds" } = useParams()
  const server = servers.find((item) => item.id === serverId)
  const validSection = serverWorkspaceTabs.some((item) => item.value === section)
  const [dialogKind, setDialogKind] = React.useState<DialogKind>(null)

  if (!server) return <Navigate to="/servers" replace />
  if (!validSection) return <Navigate to={`/servers/${serverId}/inbounds`} replace />

  const sectionTitle = serverWorkspaceTabs.find((item) => item.value === section)?.title ?? "入站"
  const dialogConfig = dialogKind ? dialogConfigs[dialogKind] : null

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title={`${server.name} · ${sectionTitle}`}
        description="所有配置按当前服务器作用域组织；首版只演示前端信息架构和交互。"
        parent={{ label: "服务器管理", path: "/servers" }}
        action={<><Button variant="outline" asChild><Link to="/servers"><ArrowLeft data-icon="inline-start" aria-hidden="true" />返回服务器</Link></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Settings2 data-icon="inline-start" aria-hidden="true" />切换服务器</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{servers.map((item) => <DropdownMenuItem key={item.id} asChild><Link to={`/servers/${item.id}/${section}`}>{item.name} · {item.region}</Link></DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></>}
      />
      <ServerScopeRail server={server} />
      <WorkspaceNavigation serverId={server.id} active={section} />
      {section === "inbounds" ? <InboundsPanel serverId={server.id} openDialog={() => setDialogKind("inbound")} /> : null}
      {section === "hosts" ? <HostsPanel openDialog={() => setDialogKind("host")} /> : null}
      {section === "certificates" ? <CertificatesPanel openDialog={() => setDialogKind("certificate")} /> : null}
      {section === "outbounds" ? <ServerOutboundsPanel serverName={server.name} openDialog={() => setDialogKind("outbound")} /> : null}
      {section === "routing" ? <RoutingPanel openDialog={() => setDialogKind("route")} /> : null}
      {section === "xray-config" ? <XrayConfigPanel /> : null}
      {dialogConfig ? (
        <CatalogDialog
          open
          onOpenChange={(open) => { if (!open) setDialogKind(null) }}
          title={dialogConfig.title}
          description={dialogConfig.description}
          tabs={dialogConfig.tabs}
          onSave={() => { setDialogKind(null); toast.success(dialogConfig.success) }}
        />
      ) : null}
    </div>
  )
}
