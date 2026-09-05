import * as React from "react"
import { Gauge, MoreHorizontal, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { CatalogDialog } from "@/components/control-plane/catalog-dialog"
import { StatusBadge } from "@/components/data/status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { outboundCatalog } from "@/lib/control-plane/outbound-host-catalog"
import { outbounds } from "@/lib/mock-data"

export function OutboundsPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  const testAll = () => {
    setTesting(true)
    window.setTimeout(() => { setTesting(false); toast.success("4 个候选出站的本地测速已完成") }, 650)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="出站管理"
        description="维护跨服务器可复用的出站候选库；服务器工作台只绑定候选，不重复创建。与当前服务器相同的来源在运行时按 direct 处理。"
        action={<><Button variant="outline" onClick={testAll} disabled={testing}><Gauge data-icon="inline-start" aria-hidden="true" />{testing ? "测速中…" : "全部测速"}</Button><Button onClick={() => setDialogOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />新增出站</Button></>}
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="w-full sm:max-w-sm"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="搜索出站" placeholder="搜索名称、Tag 或协议…" /></InputGroup>
          <div className="text-xs text-muted-foreground">{outbounds.length} 个候选 · 可被所有服务器绑定</div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">名称</TableHead><TableHead>Tag</TableHead><TableHead>协议</TableHead><TableHead>来源</TableHead><TableHead>目标</TableHead><TableHead>延迟</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
          <TableBody>{outbounds.map((outbound) => (
            <TableRow key={outbound.id}>
              <TableCell className="pl-4 font-medium">{outbound.name}</TableCell>
              <TableCell className="font-data text-xs">{outbound.tag}</TableCell>
              <TableCell>{outbound.protocol}</TableCell>
              <TableCell>{outbound.source}{outbound.sourceServer ? <span className="ml-1 text-xs text-muted-foreground">· {outbound.sourceServer}</span> : null}</TableCell>
              <TableCell className="max-w-64 truncate font-data text-xs">{outbound.target}</TableCell>
              <TableCell className="font-data text-xs">{outbound.latency === null ? "未测试" : `${outbound.latency} ms`}</TableCell>
              <TableCell><StatusBadge label={outbound.enabled ? "启用" : "停用"} tone={outbound.enabled ? "success" : "neutral"} /></TableCell>
              <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${outbound.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDialogOpen(true)}>编辑</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.success(`${outbound.name} 本地测速完成`)}>测速</DropdownMenuItem><DropdownMenuItem>复制</DropdownMenuItem><DropdownMenuItem variant="destructive">删除</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">同服务器自引用候选只改变有效行为，不修改候选库源记录。</div>
      </Card>

      <CatalogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="新增出站"
        description="覆盖来源、协议、传输、安全、Mux、代理链与高级 Xray 出站参数；当前仅保存到本地原型。"
        tabs={outboundCatalog}
        onSave={() => { setDialogOpen(false); toast.success("出站已保存到本地原型") }}
      />
    </div>
  )
}
