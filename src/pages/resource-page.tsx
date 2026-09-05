import * as React from "react"
import { Filter, MoreHorizontal, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { resourceMeta } from "@/lib/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const sampleRows = [
  { id: "XB-240901", name: "示例记录 A", type: "默认", owner: "system", updated: "今天 20:42", enabled: true },
  { id: "XB-240873", name: "示例记录 B", type: "自定义", owner: "北海", updated: "今天 18:16", enabled: true },
  { id: "XB-240811", name: "示例记录 C", type: "兼容", owner: "system", updated: "昨天 23:04", enabled: false },
]

const settingsGroups = [
  ["站点与品牌", "站点名称、描述、Logo、首页地址、服务条款"],
  ["注册与安全", "注册开关、邮箱验证、验证码、白名单、密码策略"],
  ["订阅与节点", "订阅链接、过期策略、流量重置、节点排序、客户端配置"],
  ["通知与任务", "邮件通知、机器人、工单提醒、定时任务与队列"],
  ["主题与客户端", "用户端主题、管理入口、客户端适配与导入模板"],
]

export function ResourcePage({ resource }: { resource: string }) {
  const meta = resourceMeta[resource] ?? { title: resource, description: "管理资源配置。", action: "新增记录" }
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const isSettings = resource === "settings"

  const save = () => {
    setDialogOpen(false)
    toast.success(`${meta.action}已保存到本地原型`)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title={meta.title}
        description={meta.description}
        action={
          <Button onClick={() => setDialogOpen(true)}>
            {isSettings ? null : <Plus data-icon="inline-start" aria-hidden="true" />}
            {meta.action}
          </Button>
        }
      />

      {isSettings ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {settingsGroups.map(([name, description], index) => (
            <Card key={name} className="gap-3 py-4 shadow-none">
              <CardContent className="px-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div><h2 className="font-semibold">{name}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
                  <span className="font-data text-xs text-muted-foreground">{12 + index * 3} 项</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>打开配置</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
            <InputGroup className="w-full sm:max-w-sm">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput aria-label={`搜索${meta.title}`} placeholder={`搜索${meta.title}…`} />
            </InputGroup>
            <Button variant="outline"><Filter data-icon="inline-start" aria-hidden="true" />筛选</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">名称</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-12"><span className="sr-only">操作</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 font-medium">{row.name}</TableCell>
                  <TableCell className="font-data text-xs text-muted-foreground">{row.id}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.owner}</TableCell>
                  <TableCell><StatusBadge label={row.enabled ? "启用" : "停用"} tone={row.enabled ? "success" : "neutral"} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.updated}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${row.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDialogOpen(true)}>编辑</DropdownMenuItem><DropdownMenuItem>复制</DropdownMenuItem><DropdownMenuItem variant="destructive">删除</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">共 3 条本地模拟记录</div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{meta.action}</DialogTitle>
            <DialogDescription>首版仅演示字段分组和交互，保存不会写入 XBoard 后端。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${resource}-name`}>名称</FieldLabel>
              <Input id={`${resource}-name`} defaultValue={isSettings ? "UEG-Net" : "示例记录"} />
              <FieldDescription>在管理端列表和审计日志中显示。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select defaultValue="enabled">
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save}>保存到本地原型</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
