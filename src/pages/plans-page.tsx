import { formatUsageValue } from "@/lib/traffic-format";
import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  BulkActions,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import {
  ResourceEmpty,
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { StatusBadge } from '@/components/data/status-badge'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { useListSelection } from '@/hooks/use-list-selection'

type Plan = {
  id: number
  name: string
  content?: string | null
  transfer_enable: number
  prices?: Record<string, number | null>
  group_id?: number | null
  group?: { id: number; name: string } | null
  speed_limit?: number | null
  device_limit?: number | null
  capacity_limit?: number | null
  tags?: string[] | null
  reset_traffic_method?: number | null
  show: boolean
  renew: boolean
  sell: boolean
  users_count?: number
  active_users_count?: number
}

type ServerGroup = { id: number; name: string }
type NumericValue = number | ''

type PlanForm = {
  id?: number
  name: string
  content: string
  transferEnable: NumericValue
  resetMethod: string
  groupId: string
  speedLimit: NumericValue
  deviceLimit: NumericValue
  capacityLimit: NumericValue
  tags: string
  prices: Record<string, NumericValue>
  forceUpdate: boolean
}

const periods = [
  ['monthly', '月付'],
  ['quarterly', '季付'],
  ['half_yearly', '半年付'],
  ['yearly', '年付'],
  ['two_yearly', '两年付'],
  ['three_yearly', '三年付'],
  ['onetime', '一次性'],
  ['reset_traffic', '重置流量'],
] as const

const resetMethods = [
  ['follow', '跟随系统设置'],
  ['0', '每月 1 日'],
  ['1', '按月重置'],
  ['2', '不重置'],
  ['3', '每年 1 月 1 日'],
  ['4', '按年重置'],
] as const

function createEmptyForm(): PlanForm {
  return {
    name: '',
    content: '',
    transferEnable: 100,
    resetMethod: 'follow',
    groupId: 'none',
    speedLimit: '',
    deviceLimit: '',
    capacityLimit: '',
    tags: '',
    prices: Object.fromEntries(periods.map(([key]) => [key, ''])) as Record<
      string,
      NumericValue
    >,
    forceUpdate: false,
  }
}

export function PlansPage() {
  const api = useAdminApi()
  const query = React.useCallback(
    async (signal: AbortSignal) => {
      const [plans, groups] = await Promise.all([
        api.get<Plan[]>('plan/fetch', undefined, signal),
        api
          .get<ServerGroup[]>('server/group/fetch', undefined, signal)
          .catch(() => []),
      ])
      return { plans, groups }
    },
    [api],
  )
  const planQuery = useAdminQuery(query)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<PlanForm>(createEmptyForm)
  const [formErrors, setFormErrors] = React.useState<Record<string, string[]>>(
    {},
  )
  const [saving, setSaving] = React.useState(false)
  const [forceConfirmOpen, setForceConfirmOpen] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Plan | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  function openCreate() {
    setForm(createEmptyForm())
    setFormErrors({})
    setFormOpen(true)
  }

  function openEdit(plan: Plan) {
    setForm({
      id: plan.id,
      name: plan.name,
      content: plan.content ?? '',
      transferEnable: plan.transfer_enable ?? '',
      resetMethod:
        plan.reset_traffic_method === null ||
        plan.reset_traffic_method === undefined
          ? 'follow'
          : String(plan.reset_traffic_method),
      groupId: plan.group_id ? String(plan.group_id) : 'none',
      speedLimit: plan.speed_limit ?? '',
      deviceLimit: plan.device_limit ?? '',
      capacityLimit: plan.capacity_limit ?? '',
      tags: (plan.tags ?? []).join(', '),
      prices: Object.fromEntries(
        periods.map(([key]) => [key, plan.prices?.[key] ?? '']),
      ) as Record<string, NumericValue>,
      forceUpdate: false,
    })
    setFormErrors({})
    setFormOpen(true)
  }

  function requestSave() {
    if (form.id && form.forceUpdate) setForceConfirmOpen(true)
    else void save()
  }

  async function save() {
    setSaving(true)
    setFormErrors({})
    try {
      await api.post<boolean>('plan/save', {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        content: form.content || null,
        transfer_enable: numberOrNull(form.transferEnable),
        reset_traffic_method:
          form.resetMethod === 'follow' ? null : Number(form.resetMethod),
        group_id: form.groupId === 'none' ? null : Number(form.groupId),
        speed_limit: numberOrNull(form.speedLimit),
        device_limit: numberOrNull(form.deviceLimit),
        capacity_limit: numberOrNull(form.capacityLimit),
        tags: splitTags(form.tags),
        prices: Object.fromEntries(
          Object.entries(form.prices)
            .filter(([, value]) => value !== '')
            .map(([key, value]) => [key, Number(value)]),
        ),
        force_update: form.forceUpdate,
      })
      toast.success(form.id ? '套餐已更新' : '套餐已创建')
      setForceConfirmOpen(false)
      setFormOpen(false)
      planQuery.reload()
    } catch (error) {
      if (error instanceof ApiError) setFormErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '套餐保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function toggle(plan: Plan, field: 'show' | 'sell' | 'renew') {
    setPendingAction(plan.id)
    try {
      await api.post<boolean>('plan/update', {
        id: plan.id,
        [field]: !plan[field],
      })
      toast.success('套餐状态已更新')
      planQuery.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '套餐状态更新失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function move(index: number, offset: -1 | 1) {
    const plans = planQuery.data?.plans
    if (!plans) return
    const target = index + offset
    if (target < 0 || target >= plans.length) return
    const next = [...plans]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPendingAction(plans[index].id)
    try {
      await api.post<boolean>('plan/sort', { ids: next.map((plan) => plan.id) })
      toast.success('套餐顺序已更新')
      planQuery.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '套餐排序失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.post<boolean>('plan/drop', { id: deleteTarget.id })
      toast.success('套餐已删除')
      setDeleteTarget(null)
      planQuery.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '套餐删除失败。'))
    } finally {
      setDeleting(false)
    }
  }

  const plans = planQuery.data?.plans ?? []
  const groups = planQuery.data?.groups ?? []
  const selection = useListSelection(plans)

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="套餐管理"
        description="维护套餐配额、价格、销售状态和用户容量；可从现有服务器分组中选择套餐可见范围。"
        action={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增套餐
          </Button>
        }
      />
      {planQuery.error ? (
        <ResourceError
          title="套餐读取失败"
          message={planQuery.error}
          onRetry={planQuery.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <SelectionSummary
            selected={selection.count}
            total={plans.length}
            onClear={selection.clear}
          />
          <BulkActions
            selected={selection.selectedRows}
            getLabel={(item) => item.name}
            disabled={planQuery.loading || planQuery.refreshing}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              planQuery.reload()
            }}
            actions={[
              {
                id: 'show',
                label: '显示所选套餐',
                description: '在用户端展示所选套餐。',
                icon: Eye,
                run: (item) =>
                  api.post<boolean>('plan/update', { id: item.id, show: true }),
              },
              {
                id: 'hide',
                label: '隐藏所选套餐',
                description:
                  '在用户端隐藏所选套餐，套餐资料和已有用户不受影响。',
                icon: EyeOff,
                run: (item) =>
                  api.post<boolean>('plan/update', {
                    id: item.id,
                    show: false,
                  }),
              },
              {
                id: 'sell',
                label: '上架所选套餐',
                description: '允许用户购买所选套餐。',
                icon: ShoppingCart,
                run: (item) =>
                  api.post<boolean>('plan/update', { id: item.id, sell: true }),
              },
              {
                id: 'stop-selling',
                label: '下架所选套餐',
                description: '停止用户购买所选套餐，已有用户不受影响。',
                icon: ShoppingCart,
                run: (item) =>
                  api.post<boolean>('plan/update', {
                    id: item.id,
                    sell: false,
                  }),
              },
              {
                id: 'delete',
                label: '删除所选套餐',
                description: '永久删除所选套餐。仍有用户或订单的套餐会保留。',
                destructive: true,
                icon: Trash2,
                run: (item) => api.post<boolean>('plan/drop', { id: item.id }),
              },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">
                  <Checkbox
                    aria-label="选择当前套餐"
                    checked={selection.checked}
                    disabled={
                      bulkBusy ||
                      planQuery.loading ||
                      planQuery.refreshing ||
                      !plans.length
                    }
                    onCheckedChange={(checked) =>
                      selection.toggleAll(checked === true)
                    }
                  />
                </TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>配额</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>分组</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-28">顺序</TableHead>
                <TableHead className="w-36 text-right">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planQuery.loading ? (
                <ResourceTableLoading columns={9} />
              ) : (
                plans.map((plan, index) => (
                  <TableRow
                    key={plan.id}
                    data-state={
                      selection.selectedIds.has(plan.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`选择套餐 ${plan.name}`}
                        checked={selection.selectedIds.has(plan.id)}
                        disabled={bulkBusy || planQuery.refreshing}
                        onCheckedChange={(checked) =>
                          selection.toggle(plan.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="font-medium">{plan.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {plan.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-data text-xs">
                        {formatUsageValue(plan.transfer_enable)}
                      </span>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        限速 {plan.speed_limit || '不限'} Mbps · 设备{' '}
                        {plan.device_limit || '不限'}
                      </div>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatPriceSummary(plan.prices)}
                    </TableCell>
                    <TableCell>
                      {plan.group?.name ?? (
                        <span className="text-xs text-muted-foreground">
                          未绑定
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-data">
                        {plan.active_users_count ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        / {plan.users_count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge
                          label={plan.show ? '展示' : '隐藏'}
                          tone={plan.show ? 'success' : 'neutral'}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {plan.sell ? '可购买' : '停售'} ·{' '}
                          {plan.renew ? '可续费' : '禁续费'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ButtonGroup>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`上移 ${plan.name}`}
                          disabled={
                            bulkBusy || pendingAction !== null || index === 0
                          }
                          onClick={() => void move(index, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`下移 ${plan.name}`}
                          disabled={
                            bulkBusy ||
                            pendingAction !== null ||
                            index === plans.length - 1
                          }
                          onClick={() => void move(index, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                      </ButtonGroup>
                    </TableCell>
                    <TableCell>
                      <ButtonGroup
                        className="ml-auto"
                        aria-label={`${plan.name} 操作`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={bulkBusy || pendingAction === plan.id}
                          onClick={() => openEdit(plan)}
                        >
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`${plan.name} 更多操作`}
                              disabled={bulkBusy || pendingAction === plan.id}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => void toggle(plan, 'show')}
                              >
                                {plan.show ? '从用户端隐藏' : '在用户端展示'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void toggle(plan, 'sell')}
                              >
                                {plan.sell ? '停止销售' : '恢复销售'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void toggle(plan, 'renew')}
                              >
                                {plan.renew ? '禁止续费' : '允许续费'}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleteTarget(plan)}
                            >
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!planQuery.loading && !plans.length ? (
          <ResourceEmpty
            title="还没有套餐"
            description="创建套餐后可配置周期价格、配额和展示状态。"
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                新增套餐
              </Button>
            }
          />
        ) : null}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          共 {plans.length} 个套餐
        </div>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => !saving && setFormOpen(next)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑套餐' : '新增套餐'}</DialogTitle>
            <DialogDescription>
              流量配额按 GiB
              保存，价格按站点货币主单位保存；留空表示不启用对应限制或周期。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(formErrors.name)}>
                <FieldLabel htmlFor="plan-name">
                  套餐名称
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Input
                  id="plan-name"
                  value={form.name}
                  aria-invalid={Boolean(formErrors.name)}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
                <FieldError
                  errors={formErrors.name?.map((message) => ({ message }))}
                />
              </Field>
              <NumericField
                id="plan-transfer"
                label="流量配额（GiB）"
                value={form.transferEnable}
                required
                errors={formErrors.transfer_enable}
                onChange={(transferEnable) =>
                  setForm({ ...form, transferEnable })
                }
              />
            </div>
            <Field>
              <FieldLabel htmlFor="plan-content">套餐描述</FieldLabel>
              <Textarea
                id="plan-content"
                rows={5}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="plan-reset">流量重置方式</FieldLabel>
                <Select
                  value={form.resetMethod}
                  onValueChange={(resetMethod) =>
                    setForm({ ...form, resetMethod })
                  }
                >
                  <SelectTrigger id="plan-reset" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {resetMethods.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-group">服务器可见性分组</FieldLabel>
                <Select
                  value={form.groupId}
                  onValueChange={(groupId) => setForm({ ...form, groupId })}
                >
                  <SelectTrigger id="plan-group" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">不绑定</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={String(group.id)}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  可选择现有服务器分组，本页不提供分组新建或编辑。
                </FieldDescription>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumericField
                id="plan-speed"
                label="限速（Mbps）"
                value={form.speedLimit}
                errors={formErrors.speed_limit}
                onChange={(speedLimit) => setForm({ ...form, speedLimit })}
              />
              <NumericField
                id="plan-devices"
                label="设备数限制"
                value={form.deviceLimit}
                errors={formErrors.device_limit}
                onChange={(deviceLimit) => setForm({ ...form, deviceLimit })}
              />
              <NumericField
                id="plan-capacity"
                label="用户容量"
                value={form.capacityLimit}
                errors={formErrors.capacity_limit}
                onChange={(capacityLimit) =>
                  setForm({ ...form, capacityLimit })
                }
              />
            </div>
            <Field data-invalid={Boolean(formErrors.tags)}>
              <FieldLabel htmlFor="plan-tags">标签</FieldLabel>
              <Input
                id="plan-tags"
                value={form.tags}
                placeholder="热门, 流媒体"
                aria-invalid={Boolean(formErrors.tags)}
                onChange={(event) =>
                  setForm({ ...form, tags: event.target.value })
                }
              />
              <FieldDescription>使用逗号或换行分隔。</FieldDescription>
              <FieldError
                errors={formErrors.tags?.map((message) => ({ message }))}
              />
            </Field>
            <FieldSet className="rounded-2xl border p-4">
              <FieldLegend>周期价格</FieldLegend>
              <FieldDescription>
                留空即不提供该周期；价格 0 表示未配置该周期。
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {periods.map(([key, label]) => (
                  <NumericField
                    key={key}
                    id={`plan-price-${key}`}
                    label={label}
                    value={form.prices[key]}
                    errors={formErrors[`prices.${key}`]}
                    step="0.01"
                    onChange={(value) =>
                      setForm({
                        ...form,
                        prices: { ...form.prices, [key]: value },
                      })
                    }
                  />
                ))}
              </div>
            </FieldSet>
            {form.id ? (
              <Field
                orientation="horizontal"
                className="rounded-2xl border border-destructive/30 bg-destructive/[0.035] p-4"
              >
                <span>
                  <FieldLabel htmlFor="plan-force-update">
                    同步已有用户
                  </FieldLabel>
                  <FieldDescription>
                    开启后会批量覆盖该套餐全部用户的分组、流量、限速和设备限制；保存前还会再次确认。
                  </FieldDescription>
                </span>
                <Switch
                  id="plan-force-update"
                  checked={form.forceUpdate}
                  onCheckedChange={(forceUpdate) =>
                    setForm({ ...form, forceUpdate })
                  }
                />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                saving || !form.name.trim() || form.transferEnable === ''
              }
              onClick={requestSave}
            >
              {saving ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? '保存中' : '保存套餐'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={forceConfirmOpen}
        onOpenChange={setForceConfirmOpen}
        title="同步覆盖已有用户套餐限制？"
        description="这会批量修改当前套餐下所有用户的分组、流量配额、限速和设备限制。仅在你确认这些值应立即覆盖用户个体配置时执行。"
        confirmLabel="确认同步并保存"
        destructive
        busy={saving}
        onConfirm={save}
      />
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`删除套餐“${deleteTarget?.name ?? ''}”？`}
        description="仍有关联用户或订单的套餐无法删除；通过保护检查后，此操作无法在管理端撤销。"
        confirmLabel="删除套餐"
        destructive
        busy={deleting}
        onConfirm={remove}
      />
    </div>
  )
}

function NumericField({
  id,
  label,
  value,
  onChange,
  errors,
  required = false,
  step = '1',
}: {
  id: string
  label: string
  value: NumericValue
  onChange: (value: NumericValue) => void
  errors?: string[]
  required?: boolean
  step?: string
}) {
  return (
    <Field data-invalid={Boolean(errors)}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        min="0"
        step={step}
        value={value}
        aria-invalid={Boolean(errors)}
        onChange={(event) =>
          onChange(event.target.value === '' ? '' : Number(event.target.value))
        }
      />
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function numberOrNull(value: NumericValue) {
  return value === '' ? null : Number(value)
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )
}

function formatPriceSummary(prices: Plan['prices']) {
  const active = periods.flatMap(([key, label]) =>
    prices?.[key] ? [`${label} ¥${prices[key]}`] : [],
  )
  return active.length
    ? active.slice(0, 2).join(' · ') +
        (active.length > 2 ? ` +${active.length - 2}` : '')
    : '未定价'
}
