import * as React from "react"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { permissionGroups } from "@/lib/mock-data"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

export function PermissionGroupsPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  return <div className="mx-auto w-full max-w-[1600px]">
    <PageHeader title="权限组管理" description="把套餐和用户映射到可见节点集合；不在权限组里保存任何协议或服务器运行参数。" action={<Button onClick={() => setDialogOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />新增权限组</Button>} />
    <Card className="gap-0 overflow-hidden py-0 shadow-none"><Table><TableHeader><TableRow><TableHead className="pl-4">权限组</TableHead><TableHead>说明</TableHead><TableHead>用户</TableHead><TableHead>关联套餐</TableHead><TableHead>可见节点</TableHead><TableHead>状态</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>{permissionGroups.map((group) => <TableRow key={group.id}><TableCell className="pl-4 font-medium">{group.name}</TableCell><TableCell className="max-w-md text-sm text-muted-foreground">{group.description}</TableCell><TableCell className="font-data">{group.users}</TableCell><TableCell><div className="flex flex-wrap gap-1">{group.plans.length ? group.plans.map((plan) => <Badge key={plan} variant="secondary">{plan}</Badge>) : <span className="text-xs text-muted-foreground">未绑定</span>}</div></TableCell><TableCell className="font-data">{group.nodes}</TableCell><TableCell><StatusBadge label={group.enabled ? "启用" : "停用"} tone={group.enabled ? "success" : "neutral"} /></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${group.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDialogOpen(true)}>编辑</DropdownMenuItem><DropdownMenuItem>复制</DropdownMenuItem><DropdownMenuItem variant="destructive">删除</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table><div className="border-t px-4 py-3 text-xs text-muted-foreground">权限组与套餐/用户关联；节点发布时据此计算可见性。</div></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>新增权限组</DialogTitle><DialogDescription>配置面向用户的节点可见范围。</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="group-name">名称</FieldLabel><Input id="group-name" placeholder="例如 高级组" /></Field><Field><FieldLabel htmlFor="group-description">说明</FieldLabel><Textarea id="group-description" placeholder="说明该组的适用套餐和节点范围" /></Field><Field><FieldLabel htmlFor="group-plans">关联套餐</FieldLabel><Input id="group-plans" placeholder="高级套餐, 媒体增值包" /><FieldDescription>首版用文本模拟多选。</FieldDescription></Field><Field><FieldLabel htmlFor="group-nodes">可见节点</FieldLabel><Input id="group-nodes" placeholder="香港 · CDN, 德国 · Reality" /></Field><Field orientation="horizontal"><FieldLabel htmlFor="group-enabled">启用权限组</FieldLabel><Switch id="group-enabled" defaultChecked /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => { setDialogOpen(false); toast.success("权限组已保存到本地原型") }}>保存到本地原型</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
