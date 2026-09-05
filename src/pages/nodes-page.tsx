import * as React from "react"
import { ArrowDown, ArrowUp, Clock3, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { inbounds, nodes, servers } from "@/lib/mock-data"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type RateTimeRange = {
  id: string
  start: string
  end: string
  rate: string
}

const initialRateTimeRanges: RateTimeRange[] = [
  { id: "evening-peak", start: "18:00", end: "23:00", rate: "1.5" },
  { id: "night-off-peak", start: "00:00", end: "07:00", rate: "0.8" },
]

export function NodesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dynamicRateEnabled, setDynamicRateEnabled] = React.useState(true)
  const [rateTimeRanges, setRateTimeRanges] = React.useState<RateTimeRange[]>(initialRateTimeRanges)

  function updateRateTimeRange(id: string, field: keyof Omit<RateTimeRange, "id">, value: string) {
    setRateTimeRanges((ranges) => ranges.map((range) => (range.id === id ? { ...range, [field]: value } : range)))
  }

  function addRateTimeRange() {
    setRateTimeRanges((ranges) => [
      ...ranges,
      { id: `rate-range-${Date.now()}`, start: "08:00", end: "18:00", rate: "1.0" },
    ])
  }

  function moveRateTimeRange(id: string, direction: -1 | 1) {
    setRateTimeRanges((ranges) => {
      const currentIndex = ranges.findIndex((range) => range.id === id)
      const targetIndex = currentIndex + direction
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ranges.length) return ranges

      const next = [...ranges]
      ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
      return next
    })
  }

  function removeRateTimeRange(id: string) {
    setRateTimeRanges((ranges) => ranges.filter((range) => range.id !== id))
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="节点管理"
        description="管理面向用户的业务节点：绑定现有服务器入站，并配置倍率、流量限制、权限和可见性。"
        action={(
          <Button onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增业务节点
          </Button>
        )}
      />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="w-full sm:max-w-sm">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput aria-label="搜索节点" placeholder="搜索节点、服务器或入站…" />
          </InputGroup>
          <div className="text-xs text-muted-foreground">4 个业务节点 · 入站配置统一由服务器工作台维护</div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">节点</TableHead>
              <TableHead>绑定入站</TableHead>
              <TableHead>倍率</TableHead>
              <TableHead>流量限制</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>权限组</TableHead>
              <TableHead>可见性</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-12"><span className="sr-only">操作</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => {
              const inbound = inbounds.find((item) => item.id === node.inboundId)
              const server = servers.find((item) => item.id === inbound?.serverId)

              return (
                <TableRow key={node.id}>
                  <TableCell className="pl-4 font-medium">{node.name}</TableCell>
                  <TableCell>
                    <div className="flex min-w-44 items-center gap-2">
                      <Badge variant="outline">{server?.name ?? "未绑定"}</Badge>
                      <span className="text-xs text-muted-foreground">{inbound?.name ?? "请选择入站"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-data">{node.rate.toFixed(1)}×</TableCell>
                  <TableCell className="font-data text-xs">{node.trafficLimit}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{node.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div></TableCell>
                  <TableCell className="text-xs">{node.groups.join("、")}</TableCell>
                  <TableCell>{node.visibility}</TableCell>
                  <TableCell><StatusBadge label={node.status} tone={node.status === "启用" ? "success" : "neutral"} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`${node.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>编辑业务属性</DropdownMenuItem>
                          <DropdownMenuItem>复制节点</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive">删除节点</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">协议、传输、TLS、监听端口和内核字段不会在这里重复配置。</div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>编辑业务节点</DialogTitle>
            <DialogDescription>业务节点引用服务器已有入站，再叠加用户订阅侧的倍率、权限和展示属性。</DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="node-name">节点名称</FieldLabel>
              <Input id="node-name" defaultValue="香港 · CDN" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>绑定入站</FieldLabel>
                <Select defaultValue="in-us2-ws">
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => {
                      const serverInbounds = inbounds.filter((inbound) => inbound.serverId === server.id)
                      if (serverInbounds.length === 0) return null

                      return (
                        <SelectGroup key={server.id}>
                          <SelectLabel>{server.name} · {server.region}</SelectLabel>
                          {serverInbounds.map((inbound) => (
                            <SelectItem key={inbound.id} value={inbound.id}>
                              {server.name} · {inbound.name} · {inbound.protocol}{inbound.enabled ? "" : "（停用）"}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FieldDescription>列出每台节点服务器的全部现有入站；协议配置仍在服务器工作台维护。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="node-rate">默认流量倍率</FieldLabel>
                <Input id="node-rate" type="number" inputMode="decimal" min="0" step="0.1" defaultValue="1.0" />
                <FieldDescription>动态规则未命中或关闭时使用这个倍率。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="node-limit">流量限制</FieldLabel>
                <Input id="node-limit" placeholder="例如 8 TB / 月" defaultValue="不限" />
              </Field>

              <Field>
                <FieldLabel>可见性</FieldLabel>
                <Select defaultValue="subscription">
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="subscription">订阅内可见</SelectItem>
                      <SelectItem value="admin">仅管理员</SelectItem>
                      <SelectItem value="hidden">完全隐藏</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div role="group" aria-labelledby="dynamic-rate-title" className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div id="dynamic-rate-title" className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
                    动态流量倍率
                  </div>
                  <p className="text-sm text-muted-foreground">按指定时间段覆盖默认倍率，沿用 XBoard 的原生动态倍率结构。</p>
                </div>
                <Switch
                  id="node-rate-time-enable"
                  checked={dynamicRateEnabled}
                  onCheckedChange={setDynamicRateEnabled}
                  aria-label="启用动态流量倍率"
                />
              </div>

              {dynamicRateEnabled ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">面板时区 Asia/Shanghai</Badge>
                    <span>按列表顺序匹配，第一条命中即生效；未命中时使用默认流量倍率。</span>
                  </div>

                  {rateTimeRanges.map((range, index) => (
                    <div key={range.id} className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-end">
                      <div className="flex size-9 items-center justify-center rounded-full bg-primary font-data text-xs font-semibold text-primary-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <Field>
                        <FieldLabel htmlFor={`${range.id}-start`}>开始时间</FieldLabel>
                        <Input
                          id={`${range.id}-start`}
                          type="time"
                          value={range.start}
                          onChange={(event) => updateRateTimeRange(range.id, "start", event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${range.id}-end`}>结束时间</FieldLabel>
                        <Input
                          id={`${range.id}-end`}
                          type="time"
                          value={range.end}
                          onChange={(event) => updateRateTimeRange(range.id, "end", event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${range.id}-rate`}>流量倍率</FieldLabel>
                        <Input
                          id={`${range.id}-rate`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.1"
                          value={range.rate}
                          onChange={(event) => updateRateTimeRange(range.id, "rate", event.target.value)}
                        />
                      </Field>
                      <ButtonGroup aria-label={`动态倍率规则 ${index + 1} 操作`}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={index === 0}
                          aria-label="上移规则"
                          onClick={() => moveRateTimeRange(range.id, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={index === rateTimeRanges.length - 1}
                          aria-label="下移规则"
                          onClick={() => moveRateTimeRange(range.id, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label="删除规则"
                          onClick={() => removeRateTimeRange(range.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </ButtonGroup>
                    </div>
                  ))}

                  {rateTimeRanges.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">尚未添加时间段；当前会回退到默认流量倍率。</div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">跨午夜时段请拆成两条，例如 22:00–23:59 与 00:00–06:00。</p>
                    <Button type="button" variant="outline" size="sm" onClick={addRateTimeRange}>
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      添加时段
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <FieldSet>
              <FieldLegend variant="label">权限组</FieldLegend>
              <FieldDescription>首版用文本模拟多选，后续接入带搜索的 Combobox。</FieldDescription>
              <Input aria-label="权限组" defaultValue="标准组, 高级组" />
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="node-tags">标签</FieldLabel>
              <Input id="node-tags" defaultValue="推荐, 低延迟" />
              <FieldDescription>使用英文或中文逗号分隔。</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="node-enabled">启用节点</FieldLabel>
              <Switch id="node-enabled" defaultChecked />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => { setDialogOpen(false); toast.success("业务节点已保存到本地原型") }}>保存到本地原型</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
