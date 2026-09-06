import * as React from 'react'
import {
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
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
import { ResourcePagination } from '@/components/control-plane/resource-pagination'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { ApiError } from '@/lib/api'
import { useAdminApi } from '@/lib/auth'
import { useListSelection } from '@/hooks/use-list-selection'

type Paginator<T> = {
  data: T[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}
type Plan = { id: number; name: string }
type Coupon = {
  id: number
  name: string
  code: string
  type: 1 | 2
  value: number
  started_at: number
  ended_at: number
  limit_use?: number | null
  limit_use_with_user?: number | null
  limit_plan_ids?: Array<number | string> | null
  limit_period?: string[] | null
  show: boolean
  created_at?: number | string | null
}
type NumericValue = number | ''
type CouponForm = {
  id?: number
  name: string
  code: string
  type: '1' | '2'
  value: NumericValue
  startedAt: string
  endedAt: string
  limitUse: NumericValue
  limitUseWithUser: NumericValue
  planIds: string[]
  periods: string[]
  generateCount: NumericValue
}

const periodOptions = [
  ['month_price', '月付'],
  ['quarter_price', '季付'],
  ['half_year_price', '半年付'],
  ['year_price', '年付'],
  ['two_year_price', '两年付'],
  ['three_year_price', '三年付'],
  ['onetime_price', '一次性'],
  ['reset_price', '流量重置'],
] as const

export function CouponsPage() {
  const api = useAdminApi()
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [searchField, setSearchField] = React.useState('code')
  const [form, setForm] = React.useState<CouponForm | null>(null)
  const [formErrors, setFormErrors] = React.useState<Record<string, string[]>>(
    {},
  )
  const [saving, setSaving] = React.useState(false)
  const [toggleTarget, setToggleTarget] = React.useState<Coupon | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Coupon | null>(null)
  const [acting, setActing] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const filters = React.useMemo(
    () => (search ? [{ id: searchField, value: search }] : []),
    [search, searchField],
  )
  const load = React.useCallback(
    async (signal: AbortSignal) => {
      const [coupons, plans] = await Promise.all([
        api.post<Paginator<Coupon>>(
          'coupon/fetch',
          { current: page, pageSize: 20, filter: filters },
          signal,
        ),
        api.get<Plan[]>('plan/fetch', undefined, signal).catch(() => []),
      ])
      return { coupons, plans }
    },
    [api, filters, page],
  )
  const query = useAdminQuery(load)
  const coupons = query.data?.coupons.data ?? []
  const plans = query.data?.plans ?? []
  const selection = useListSelection(
    coupons,
    `page:${page}|${searchField}:${search}`,
  )

  function openCreate() {
    const now = new Date()
    const end = new Date(now.getTime() + 30 * 86_400_000)
    setForm({
      name: '',
      code: '',
      type: '1',
      value: '',
      startedAt: dateToLocal(now),
      endedAt: dateToLocal(end),
      limitUse: '',
      limitUseWithUser: 1,
      planIds: [],
      periods: [],
      generateCount: 1,
    })
    setFormErrors({})
  }

  function openEdit(coupon: Coupon) {
    setForm({
      id: coupon.id,
      name: coupon.name,
      code: coupon.code,
      type: String(coupon.type) as '1' | '2',
      value: coupon.type === 1 ? coupon.value / 100 : coupon.value,
      startedAt: epochToLocal(coupon.started_at),
      endedAt: epochToLocal(coupon.ended_at),
      limitUse: coupon.limit_use ?? '',
      limitUseWithUser: coupon.limit_use_with_user ?? '',
      planIds: (coupon.limit_plan_ids ?? []).map(String),
      periods: coupon.limit_period ?? [],
      generateCount: 1,
    })
    setFormErrors({})
  }

  function applySearch(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function saveCoupon() {
    if (!form) return
    setSaving(true)
    setFormErrors({})
    const body = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      ...(form.code.trim() ? { code: form.code.trim() } : {}),
      type: Number(form.type),
      value:
        form.type === '1'
          ? Math.round(Number(form.value) * 100)
          : Math.round(Number(form.value)),
      started_at: localToEpoch(form.startedAt),
      ended_at: localToEpoch(form.endedAt),
      limit_use: numberOrNull(form.limitUse),
      limit_use_with_user: numberOrNull(form.limitUseWithUser),
      limit_plan_ids: form.planIds.length ? form.planIds.map(Number) : null,
      limit_period: form.periods.length ? form.periods : null,
    }
    try {
      if (!form.id && Number(form.generateCount) > 1) {
        const file = await api.download('coupon/generate', {
          ...body,
          generate_count: Number(form.generateCount),
        })
        saveBlob(file.blob, 'coupons.csv')
        toast.success(`已批量生成 ${form.generateCount} 张优惠券并下载券码 CSV`)
      } else {
        await api.post<unknown>('coupon/generate', body)
        toast.success(form.id ? '优惠券已更新' : '优惠券已创建')
      }
      setForm(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setFormErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '优惠券保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleCoupon() {
    if (!toggleTarget) return
    setActing(true)
    try {
      await api.post<boolean>('coupon/show', { id: toggleTarget.id })
      toast.success(
        toggleTarget.show ? '优惠券已从用户端隐藏' : '优惠券已恢复展示',
      )
      setToggleTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '优惠券状态更新失败。'))
    } finally {
      setActing(false)
    }
  }

  async function deleteCoupon() {
    if (!deleteTarget) return
    setActing(true)
    try {
      await api.post<boolean>('coupon/drop', { id: deleteTarget.id })
      toast.success('优惠券已删除')
      setDeleteTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '优惠券删除失败。'))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="优惠券管理"
        description="创建固定金额或比例优惠券，限制可用套餐、周期和次数；批量券码仅通过 CSV 下载交付。"
        action={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增优惠券
          </Button>
        }
      />
      {query.error ? (
        <ResourceError
          title="优惠券读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <form
          className="flex flex-col gap-3 border-b p-4 sm:flex-row"
          onSubmit={applySearch}
        >
          <Select
            value={searchField}
            onValueChange={(value) => {
              setSearchField(value)
              setSearch('')
              setSearchInput('')
            }}
          >
            <SelectTrigger
              className="w-full sm:w-36"
              aria-label="优惠券搜索字段"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="code">券码</SelectItem>
                <SelectItem value="name">名称</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            className="w-full sm:max-w-md"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="输入关键字"
            aria-label="优惠券搜索关键字"
          />
          <Button type="submit" variant="outline">
            <Search data-icon="inline-start" aria-hidden="true" />
            搜索
          </Button>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setPage(1)
              }}
            >
              清除
            </Button>
          ) : null}
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <SelectionSummary
            selected={selection.count}
            total={coupons.length}
            onClear={selection.clear}
          />
          <BulkActions
            selected={selection.selectedRows}
            getLabel={(item) => `${item.name}（${item.code}）`}
            disabled={query.loading || query.refreshing}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              query.reload()
            }}
            actions={[
              {
                id: 'enable',
                label: '启用所选优惠券',
                description: '允许用户使用所选优惠券。',
                icon: Eye,
                run: (item) =>
                  api.post<unknown>('coupon/update', {
                    id: item.id,
                    show: true,
                  }),
              },
              {
                id: 'disable',
                label: '停用所选优惠券',
                description: '停止用户使用所选优惠券，已有记录不受影响。',
                icon: EyeOff,
                run: (item) =>
                  api.post<unknown>('coupon/update', {
                    id: item.id,
                    show: false,
                  }),
              },
              {
                id: 'delete',
                label: '删除所选优惠券',
                description: '永久删除所选优惠券，券码将立即失效。',
                destructive: true,
                icon: Trash2,
                run: (item) =>
                  api.post<boolean>('coupon/drop', { id: item.id }),
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
                    aria-label="选择当前优惠券"
                    checked={selection.checked}
                    disabled={
                      bulkBusy ||
                      query.loading ||
                      query.refreshing ||
                      !coupons.length
                    }
                    onCheckedChange={(checked) =>
                      selection.toggleAll(checked === true)
                    }
                  />
                </TableHead>
                <TableHead>优惠券</TableHead>
                <TableHead>券码</TableHead>
                <TableHead>优惠</TableHead>
                <TableHead>有效期</TableHead>
                <TableHead>使用限制</TableHead>
                <TableHead>适用范围</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-36 text-right">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading ? (
                <ResourceTableLoading columns={9} />
              ) : (
                coupons.map((coupon) => (
                  <TableRow
                    key={coupon.id}
                    data-state={
                      selection.selectedIds.has(coupon.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`选择优惠券 ${coupon.code}`}
                        checked={selection.selectedIds.has(coupon.id)}
                        disabled={bulkBusy || query.refreshing}
                        onCheckedChange={(checked) =>
                          selection.toggle(coupon.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{coupon.name}</div>
                      <div className="font-data text-[11px] text-muted-foreground">
                        ID {coupon.id}
                      </div>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {coupon.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {coupon.type === 1
                          ? `¥${(coupon.value / 100).toFixed(2)}`
                          : `${coupon.value}%`}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      <div>{formatEpoch(coupon.started_at)}</div>
                      <div className="text-muted-foreground">
                        至 {formatEpoch(coupon.ended_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>总计 {coupon.limit_use ?? '不限'} 次</div>
                      <div className="text-muted-foreground">
                        每用户 {coupon.limit_use_with_user ?? '不限'} 次
                      </div>
                    </TableCell>
                    <TableCell className="max-w-60 text-xs">
                      <div>{formatPlanScope(coupon.limit_plan_ids, plans)}</div>
                      <div className="mt-1 text-muted-foreground">
                        {formatPeriods(coupon.limit_period)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={coupon.show ? '可用' : '已隐藏'}
                        tone={coupon.show ? 'success' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell>
                      <ButtonGroup
                        className="ml-auto"
                        aria-label={`${coupon.name} 操作`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={bulkBusy}
                          onClick={() => openEdit(coupon)}
                        >
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`${coupon.name} 更多操作`}
                              disabled={bulkBusy}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => setToggleTarget(coupon)}
                              >
                                {coupon.show ? '隐藏' : '恢复展示'}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleteTarget(coupon)}
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
        {!query.loading && !coupons.length ? (
          <ResourceEmpty
            title="没有优惠券"
            description={
              search
                ? '没有匹配当前关键字的优惠券。'
                : '创建一张单券，或批量生成并下载券码 CSV。'
            }
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                新增优惠券
              </Button>
            }
          />
        ) : null}
        <ResourcePagination
          page={page}
          pageSize={query.data?.coupons.per_page ?? 20}
          total={query.data?.coupons.total ?? 0}
          disabled={query.loading || query.refreshing}
          loading={query.loading}
          onPageChange={setPage}
        />
      </Card>

      <CouponDialog
        form={form}
        setForm={setForm}
        errors={formErrors}
        plans={plans}
        saving={saving}
        onSave={saveCoupon}
      />
      <ConfirmActionDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={`${toggleTarget?.show ? '隐藏' : '恢复'}优惠券 ${toggleTarget?.code ?? ''}？`}
        description={
          toggleTarget?.show
            ? '隐藏后用户端不再接受该券，但不会删除已有记录。'
            : '恢复后，只要仍在有效期和使用限制内，用户即可使用。'
        }
        confirmLabel={toggleTarget?.show ? '确认隐藏' : '恢复展示'}
        busy={acting}
        onConfirm={toggleCoupon}
      />
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`删除优惠券 ${deleteTarget?.code ?? ''}？`}
        description="删除后券码立即失效，且无法从管理端恢复。已产生的订单记录不在此操作中修改。"
        confirmLabel="删除优惠券"
        destructive
        busy={acting}
        onConfirm={deleteCoupon}
      />
    </div>
  )
}

function CouponDialog({
  form,
  setForm,
  errors,
  plans,
  saving,
  onSave,
}: {
  form: CouponForm | null
  setForm: React.Dispatch<React.SetStateAction<CouponForm | null>>
  errors: Record<string, string[]>
  plans: Plan[]
  saving: boolean
  onSave: () => void
}) {
  if (!form) return null
  const toggleList = (
    key: 'planIds' | 'periods',
    value: string,
    checked: boolean,
  ) =>
    setForm({
      ...form,
      [key]: checked
        ? [...form[key], value]
        : form[key].filter((item) => item !== value),
    })
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{form.id ? '编辑优惠券' : '新增优惠券'}</DialogTitle>
          <DialogDescription>
            金额优惠按站点货币主单位输入；比例优惠输入
            1–100。限制留空代表不限制。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="coupon-name"
              label="名称"
              value={form.name}
              errors={errors.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <TextField
              id="coupon-code"
              label="券码"
              value={form.code}
              errors={errors.code}
              description={
                form.id
                  ? '编辑券码会直接改变用户兑换凭据。'
                  : '留空将自动生成；批量生成时始终使用随机券码。'
              }
              onChange={(code) => setForm({ ...form, code })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="coupon-type">优惠类型</FieldLabel>
              <Select
                value={form.type}
                onValueChange={(type) =>
                  setForm({ ...form, type: type as '1' | '2' })
                }
              >
                <SelectTrigger id="coupon-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="1">固定金额</SelectItem>
                    <SelectItem value="2">百分比</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <NumberField
              id="coupon-value"
              label={form.type === '1' ? '优惠金额' : '优惠比例（%）'}
              value={form.value}
              errors={errors.value}
              min={0}
              max={form.type === '2' ? 100 : undefined}
              step={form.type === '1' ? '0.01' : '1'}
              onChange={(value) => setForm({ ...form, value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.started_at)}>
              <FieldLabel htmlFor="coupon-start">开始时间</FieldLabel>
              <Input
                id="coupon-start"
                type="datetime-local"
                value={form.startedAt}
                aria-invalid={Boolean(errors.started_at)}
                onChange={(event) =>
                  setForm({ ...form, startedAt: event.target.value })
                }
              />
              <FieldError
                errors={errors.started_at?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={Boolean(errors.ended_at)}>
              <FieldLabel htmlFor="coupon-end">结束时间</FieldLabel>
              <Input
                id="coupon-end"
                type="datetime-local"
                value={form.endedAt}
                aria-invalid={Boolean(errors.ended_at)}
                onChange={(event) =>
                  setForm({ ...form, endedAt: event.target.value })
                }
              />
              <FieldError
                errors={errors.ended_at?.map((message) => ({ message }))}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="coupon-limit"
              label="总使用次数"
              value={form.limitUse}
              errors={errors.limit_use}
              min={1}
              step="1"
              onChange={(limitUse) => setForm({ ...form, limitUse })}
            />
            <NumberField
              id="coupon-user-limit"
              label="每用户次数"
              value={form.limitUseWithUser}
              errors={errors.limit_use_with_user}
              min={1}
              step="1"
              onChange={(limitUseWithUser) =>
                setForm({ ...form, limitUseWithUser })
              }
            />
            {!form.id ? (
              <NumberField
                id="coupon-count"
                label="生成数量"
                value={form.generateCount}
                errors={errors.generate_count}
                min={1}
                max={500}
                step="1"
                description="大于 1 时下载券码 CSV。"
                onChange={(generateCount) =>
                  setForm({ ...form, generateCount })
                }
              />
            ) : null}
          </div>
          <FieldSet className="rounded-2xl border p-4">
            <FieldLegend>适用套餐</FieldLegend>
            <FieldDescription>不选择表示全部套餐。</FieldDescription>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <label
                  key={plan.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={form.planIds.includes(String(plan.id))}
                    onCheckedChange={(checked) =>
                      toggleList('planIds', String(plan.id), checked === true)
                    }
                  />
                  <span>{plan.name}</span>
                </label>
              ))}
            </div>
          </FieldSet>
          <FieldSet className="rounded-2xl border p-4">
            <FieldLegend>适用周期</FieldLegend>
            <FieldDescription>不选择表示全部周期。</FieldDescription>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {periodOptions.map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={form.periods.includes(value)}
                    onCheckedChange={(checked) =>
                      toggleList('periods', value, checked === true)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </FieldSet>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setForm(null)}
          >
            取消
          </Button>
          <Button
            disabled={
              saving ||
              !form.name.trim() ||
              form.value === '' ||
              !form.startedAt ||
              !form.endedAt ||
              (!form.id &&
                (Number(form.generateCount) < 1 ||
                  Number(form.generateCount) > 500))
            }
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : Number(form.generateCount) > 1 && !form.id ? (
              <Download data-icon="inline-start" aria-hidden="true" />
            ) : null}
            {saving
              ? '保存中'
              : Number(form.generateCount) > 1 && !form.id
                ? '生成并下载 CSV'
                : '保存优惠券'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  errors,
  description,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errors?: string[]
  description?: string
}) {
  return (
    <Field data-invalid={Boolean(errors)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        aria-invalid={Boolean(errors)}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  errors,
  description,
  min,
  max,
  step = '0.01',
}: {
  id: string
  label: string
  value: NumericValue
  onChange: (value: NumericValue) => void
  errors?: string[]
  description?: string
  min?: number
  max?: number
  step?: string
}) {
  return (
    <Field data-invalid={Boolean(errors)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-invalid={Boolean(errors)}
        onChange={(event) =>
          onChange(event.target.value === '' ? '' : Number(event.target.value))
        }
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function numberOrNull(value: NumericValue) {
  return value === '' ? null : Number(value)
}
function localToEpoch(value: string) {
  return Math.floor(new Date(value).getTime() / 1000)
}
function epochToLocal(value: number) {
  return dateToLocal(new Date(value * 1000))
}
function dateToLocal(value: Date) {
  const adjusted = new Date(
    value.getTime() - value.getTimezoneOffset() * 60_000,
  )
  return adjusted.toISOString().slice(0, 16)
}
function formatEpoch(value: number) {
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}
function formatPlanScope(
  ids: Array<number | string> | null | undefined,
  plans: Plan[],
) {
  if (!ids?.length) return '全部套餐'
  const names = ids.map(
    (id) =>
      plans.find((plan) => String(plan.id) === String(id))?.name ?? `#${id}`,
  )
  return (
    names.slice(0, 2).join('、') +
    (names.length > 2 ? ` 等 ${names.length} 个` : '')
  )
}
function formatPeriods(values: string[] | null | undefined) {
  if (!values?.length) return '全部周期'
  const labels = values.map(
    (value) => periodOptions.find(([key]) => key === value)?.[1] ?? value,
  )
  return labels.join('、')
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
