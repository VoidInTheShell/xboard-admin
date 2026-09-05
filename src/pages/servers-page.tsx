import * as React from "react"
import { ArrowRight, CircleCheck, CircleOff, Layers3, MoreHorizontal, Plus, Search, Server, ServerCog, TriangleAlert } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { servers } from "@/lib/mock-data"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const highLoadThreshold = 80

export function ServersPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const totalServers = servers.length
  const onlineServers = servers.filter((server) => server.status === "在线").length
  const offlineServers = servers.filter((server) => server.status === "离线").length
  const maintenanceServers = servers.filter((server) => server.status === "维护").length
  const highLoadServers = servers.filter(
    (server) => server.cpu >= highLoadThreshold || server.memory >= highLoadThreshold,
  ).length
  const totalNodes = servers.reduce((total, server) => total + server.nodes, 0)
  const nodeServers = servers.filter((server) => server.deploymentMethod !== null).length

  const metrics = [
    {
      label: "服务器总数",
      value: totalServers,
      hint: `${nodeServers} 台节点机 · ${totalServers - nodeServers} 台控制面`,
      icon: Server,
      iconClassName: "bg-primary text-primary-foreground",
    },
    {
      label: "在线服务器",
      value: onlineServers,
      hint: `${onlineServers} / ${totalServers} 心跳正常`,
      icon: CircleCheck,
      iconClassName: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "离线 / 失联",
      value: offlineServers,
      hint: maintenanceServers > 0 ? `另有 ${maintenanceServers} 台维护中` : "当前没有维护服务器",
      icon: CircleOff,
      iconClassName: "bg-destructive/10 text-destructive",
    },
    {
      label: "高负载",
      value: highLoadServers,
      hint: `CPU 或内存 ≥ ${highLoadThreshold}%`,
      icon: TriangleAlert,
      iconClassName: "bg-amber-600/10 text-amber-700 dark:text-amber-300",
    },
    {
      label: "节点总数",
      value: totalNodes,
      hint: `分布在 ${nodeServers} 台节点机`,
      icon: Layers3,
      iconClassName: "bg-muted text-muted-foreground",
    },
  ]

  const saveServer = () => {
    setDialogOpen(false)
    toast.success("服务器已保存到本地原型")
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="服务器管理"
        description="服务器代表承载 Xboard-Node 或控制面的物理/虚拟机器；进入服务器后配置该机器的入站、发布主机、出站和路由。"
        action={<Button onClick={() => setDialogOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />添加服务器</Button>}
      />

      <section aria-label="服务器统计" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label} className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="flex min-h-28 items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                <p className="font-data mt-1 text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
                <p className="mt-2 truncate text-xs text-muted-foreground">{metric.hint}</p>
              </div>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", metric.iconClassName)}>
                <metric.icon className="size-4" aria-hidden="true" />
              </span>
            </div>
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="w-full sm:max-w-sm">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput aria-label="搜索服务器" placeholder="搜索名称、区域或角色…" />
          </InputGroup>
          <div className="text-xs text-muted-foreground">{totalServers} 台服务器 · {onlineServers} 台在线 · 数据为本地 mock</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">服务器</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>运行内核</TableHead>
              <TableHead>部署方式</TableHead>
              <TableHead>配置对象</TableHead>
              <TableHead>最后联系</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow key={server.id}>
                <TableCell className="pl-4">
                  <div className="font-medium">{server.name}</div>
                  <div className="text-xs text-muted-foreground">{server.region} · {server.role}</div>
                </TableCell>
                <TableCell><StatusBadge label={server.status} tone={server.status === "在线" ? "success" : server.status === "维护" ? "warning" : "danger"} /></TableCell>
                <TableCell className="font-data text-xs">{server.kernel}</TableCell>
                <TableCell>
                  {server.deploymentMethod ? (
                    <Badge variant={server.deploymentMethod === "Docker" ? "secondary" : "outline"}>{server.deploymentMethod}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{server.inbounds} 入站 · {server.nodes} 节点 · {server.hosts} 主机</TableCell>
                <TableCell className="text-xs text-muted-foreground">{server.lastSeen}</TableCell>
                <TableCell>
                  <ButtonGroup className="ml-auto" aria-label={`${server.name} 操作`}>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/servers/${server.id}/inbounds`}>配置<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label={`${server.name} 更多操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDialogOpen(true)}><ServerCog aria-hidden="true" />编辑服务器</DropdownMenuItem><DropdownMenuItem>复制安装命令</DropdownMenuItem><DropdownMenuItem variant="destructive">移除服务器</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
                    </DropdownMenu>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">进入“配置”后默认打开入站，不设服务器概览页。</div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>添加服务器</DialogTitle><DialogDescription>登记运行主机与控制面连接参数；API Token 在后端接入前不会保存。</DialogDescription></DialogHeader>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="server-name">服务器名称</FieldLabel><Input id="server-name" placeholder="例如 US2" /></Field>
              <Field><FieldLabel htmlFor="server-region">区域</FieldLabel><Input id="server-region" placeholder="例如 香港" /></Field>
              <Field className="sm:col-span-2"><FieldLabel>运行角色</FieldLabel><Select defaultValue="node"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="node">Xboard-Node</SelectItem><SelectItem value="panel">面板控制面</SelectItem><SelectItem value="mixed">混合角色</SelectItem></SelectGroup></SelectContent></Select></Field>
            </div>
            <Field><FieldLabel htmlFor="server-endpoint">控制端点</FieldLabel><Input id="server-endpoint" type="url" placeholder="https://server.example.net" /><FieldDescription>仅描述控制连接地址，不等同于对用户发布的节点主机。</FieldDescription></Field>
            <Field><FieldLabel htmlFor="server-token">API Token</FieldLabel><Input id="server-token" type="password" autoComplete="new-password" placeholder="接入后由安全存储保存" /></Field>
            <Field orientation="horizontal"><FieldLabel htmlFor="server-enabled">启用服务器</FieldLabel><Switch id="server-enabled" defaultChecked /></Field>
          </FieldGroup>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={saveServer}>保存到本地原型</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
