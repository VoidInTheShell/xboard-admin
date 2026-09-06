import * as React from 'react'
import {
  CircleDollarSign,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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

type Paginator<T> = {
  data: T[]
  total: number
  current_page: number
  per_page: number
  last_page: number
}
type Plan = { id: number; name: string }
type Order = {
  id: number
  user_id: number
  plan_id: number
  plan?: Plan | null
  payment_id?: number | null
  period: string
  trade_no: string
  callback_no?: string | null
  total_amount: number
  handling_amount?: number | null
  balance_amount?: number | null
  discount_amount?: number | null
  type: number
  status: number
  commission_status?: number | null
  commission_balance?: number | null
  actual_commission_balance?: number | null
  commission_rate?: number | null
  invite_user_id?: number | null
  created_at?: number | string | null
  paid_at?: number | string | null
}

type OrderDetail = Order & {
  user?: { id: number; email: string } | null
  invite_user?: { id: number; email: string } | null
  commission_log?: Array<{
    id: number
    balance?: number
    created_at?: number | string
    trade_no?: string
  }>
  surplus_orders?: Order[]
}

type PendingAction =
  | { type: 'paid'; order: Order }
  | { type: 'cancel'; order: Order }
  | { type: 'commission'; order: Order; value: 0 | 1 | 3 }
  | null

type AssignForm = {
  email: string
  planId: string
  period: string
  amount: number | ''
}

const orderStatuses: Record<
  number,
  { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'warning' }
> = {
  0: { label: '待支付', tone: 'warning' },
  1: { label: '开通中', tone: 'info' },
  2: { label: '已取消', tone: 'neutral' },
  3: { label: '已完成', tone: 'success' },
  4: { label: '已折抵', tone: 'neutral' },
}

const orderTypes: Record<number, string> = {
  1: '新购',
  2: '续费',
  3: '升级',
  4: '流量重置',
}
const commissionStatuses: Record<
  number,
  { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'warning' }
> = {
  0: { label: '待审核', tone: 'warning' },
  1: { label: '已确认', tone: 'success' },
  2: { label: '已发放', tone: 'info' },
  3: { label: '已拒绝', tone: 'danger' },
}

const periods = [
  ['month_price', '月付'],
  ['quarter_price', '季付'],
  ['half_year_price', '半年付'],
  ['year_price', '年付'],
  ['two_year_price', '两年付'],
  ['three_year_price', '三年付'],
  ['onetime_price', '一次性'],
  ['reset_price', '流量重置'],
] as const

export function OrdersPage({
  commissionOnly = false,
}: {
  commissionOnly?: boolean
}) {
  const api = useAdminApi()
  const [searchParams] = useSearchParams()
  const routeUserId = searchParams.get('user_id')?.trim() ?? ''
  const routeAction = searchParams.get('action')?.trim() ?? ''
  const routeEmail = searchParams.get('email')?.trim() ?? ''
  const initialUserId =
    !commissionOnly && /^\d+$/.test(routeUserId) ? routeUserId : ''
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState(initialUserId)
  const [search, setSearch] = React.useState(initialUserId)
  const [searchField, setSearchField] = React.useState(
    initialUserId ? 'user_id' : 'trade_no',
  )
  const [status, setStatus] = React.useState('all')
  const [detail, setDetail] = React.useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [assignOpen, setAssignOpen] = React.useState(
    routeAction === 'assign' && Boolean(initialUserId && routeEmail),
  )
  const [assignForm, setAssignForm] = React.useState<AssignForm>({
    email: routeAction === 'assign' ? routeEmail : '',
    planId: 'none',
    period: 'month_price',
    amount: '',
  })
  const [assignErrors, setAssignErrors] = React.useState<
    Record<string, string[]>
  >({})
  const [assigning, setAssigning] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)
  const [acting, setActing] = React.useState(false)
  const filters = React.useMemo(() => {
    const next: Array<{ id: string; value: string | number[] }> = []
    if (search) next.push({ id: searchField, value: search })
    if (status !== 'all')
      next.push({
        id: commissionOnly ? 'commission_status' : 'status',
        value: [Number(status)],
      })
    return next
  }, [commissionOnly, search, searchField, status])

  const load = React.useCallback(
    async (signal: AbortSignal) => {
      const [orders, plans] = await Promise.all([
        api.post<Paginator<Order>>(
          'order/fetch',
          {
            current: page,
            pageSize: 20,
            filter: filters,
            is_commission: commissionOnly,
          },
          signal,
        ),
        api.get<Plan[]>('plan/fetch', undefined, signal).catch(() => []),
      ])
      return { orders, plans }
    },
    [api, commissionOnly, filters, page],
  )
  const query = useAdminQuery(load)
  const orders = query.data?.orders.data ?? []
  const plans = query.data?.plans ?? []

  function applySearch(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function openDetail(order: Order) {
    setDetailLoading(true)
    try {
      setDetail(await api.get<OrderDetail>('order/detail', { id: order.id }))
    } catch (error) {
      toast.error(getErrorMessage(error, '订单详情读取失败。'))
    } finally {
      setDetailLoading(false)
    }
  }

  async function assignOrder() {
    setAssigning(true)
    setAssignErrors({})
    try {
      const tradeNo = await api.post<string>('order/assign', {
        email: assignForm.email.trim(),
        plan_id: Number(assignForm.planId),
        period: assignForm.period,
        total_amount: Math.round(Number(assignForm.amount) * 100),
      })
      toast.success(`订单已创建：${maskTradeNo(tradeNo)}`)
      setAssignOpen(false)
      setAssignForm({
        email: '',
        planId: 'none',
        period: 'month_price',
        amount: '',
      })
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setAssignErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '手动分配订单失败。'))
    } finally {
      setAssigning(false)
    }
  }

  async function runAction() {
    if (!pendingAction) return
    setActing(true)
    try {
      if (pendingAction.type === 'commission') {
        await api.post<boolean>('order/update', {
          trade_no: pendingAction.order.trade_no,
          commission_status: pendingAction.value,
        })
        toast.success('佣金审核状态已更新')
      } else {
        await api.post<boolean>(`order/${pendingAction.type}`, {
          trade_no: pendingAction.order.trade_no,
        })
        toast.success(
          pendingAction.type === 'paid' ? '订单已手动确认支付' : '订单已取消',
        )
      }
      setPendingAction(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '订单操作失败。'))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title={commissionOnly ? '佣金审核' : '订单管理'}
        description={
          commissionOnly
            ? '仅列出有邀请人且产生佣金的有效订单；审核动作沿用原版 XBoard 的佣金状态。'
            : '查询订单、查看完整业务详情，并在明确确认后执行手动支付、取消或分配。'
        }
        action={
          !commissionOnly ? (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              手动分配
            </Button>
          ) : undefined
        }
      />
      {query.error ? (
        <ResourceError
          title="订单读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <form
          className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center"
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
            <SelectTrigger className="w-full lg:w-40" aria-label="订单搜索字段">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="trade_no">订单号</SelectItem>
                <SelectItem value="user_id">用户 ID</SelectItem>
                <SelectItem value="callback_no">回调号</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            className="w-full lg:max-w-md"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={
              searchField === 'user_id' ? '输入用户 ID' : '输入关键字'
            }
            aria-label="订单搜索关键字"
          />
          <Button type="submit" variant="outline">
            <Search data-icon="inline-start" aria-hidden="true" />
            搜索
          </Button>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger
              className="w-full lg:ml-auto lg:w-44"
              aria-label="订单状态筛选"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(
                  commissionOnly ? commissionStatuses : orderStatuses,
                ).map(([value, item]) => (
                  <SelectItem key={value} value={value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {search || status !== 'all' ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setStatus('all')
                setPage(1)
              }}
            >
              清除
            </Button>
          ) : null}
        </form>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">订单</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>套餐 / 类型</TableHead>
                <TableHead>周期</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>订单状态</TableHead>
                {commissionOnly ? <TableHead>佣金状态</TableHead> : null}
                <TableHead>创建时间</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading ? (
                <ResourceTableLoading columns={commissionOnly ? 9 : 8} />
              ) : (
                orders.map((order) => {
                  const state = orderStatuses[order.status] ?? {
                    label: `状态 ${order.status}`,
                    tone: 'neutral' as const,
                  }
                  const commission =
                    commissionStatuses[order.commission_status ?? -1]
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-52 pl-4">
                        <div
                          className="font-data truncate text-xs"
                          title={order.trade_no}
                        >
                          {maskTradeNo(order.trade_no)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          ID {order.id}
                        </div>
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        用户 #{order.user_id}
                      </TableCell>
                      <TableCell>
                        <div>
                          {order.plan?.name ?? `套餐 #${order.plan_id}`}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {orderTypes[order.type] ?? `类型 ${order.type}`}
                        </div>
                      </TableCell>
                      <TableCell>{formatPeriod(order.period)}</TableCell>
                      <TableCell>
                        <span className="font-data">
                          ¥{centToMoney(order.total_amount)}
                        </span>
                        {order.discount_amount ? (
                          <div className="text-[11px] text-muted-foreground">
                            优惠 ¥{centToMoney(order.discount_amount)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={state.label} tone={state.tone} />
                      </TableCell>
                      {commissionOnly ? (
                        <TableCell>
                          <div className="space-y-1">
                            {commission ? (
                              <StatusBadge
                                label={commission.label}
                                tone={commission.tone}
                              />
                            ) : (
                              <StatusBadge label="未产生" tone="neutral" />
                            )}
                            <div className="font-data text-[11px] text-muted-foreground">
                              ¥{centToMoney(order.commission_balance)}
                            </div>
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-data text-xs text-muted-foreground">
                        {formatDate(order.created_at)}
                      </TableCell>
                      <TableCell>
                        <OrderActions
                          order={order}
                          commissionOnly={commissionOnly}
                          onDetail={() => void openDetail(order)}
                          detailLoading={detailLoading}
                          onAction={setPendingAction}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {!query.loading && !orders.length ? (
          <ResourceEmpty
            title={commissionOnly ? '没有待展示的佣金订单' : '没有匹配的订单'}
            description={
              commissionOnly
                ? '只有包含邀请关系、非待支付/取消并且佣金大于 0 的订单会出现在这里。'
                : '请调整订单号、用户 ID 或状态筛选。'
            }
            action={
              !commissionOnly ? (
                <Button size="sm" onClick={() => setAssignOpen(true)}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  手动分配
                </Button>
              ) : undefined
            }
          />
        ) : null}
        <ResourcePagination
          page={page}
          pageSize={query.data?.orders.per_page ?? 20}
          total={query.data?.orders.total ?? 0}
          disabled={query.loading || query.refreshing}
          loading={query.loading}
          onPageChange={setPage}
        />
      </Card>

      <OrderDetailDialog
        detail={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => !assigning && setAssignOpen(open)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>手动分配订单</DialogTitle>
            <DialogDescription>
              为现有用户创建待支付订单，不会自动确认支付。金额按站点货币单位填写。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <TextField
              id="assign-email"
              label="用户邮箱"
              value={assignForm.email}
              errors={assignErrors.email}
              type="email"
              onChange={(email) => setAssignForm({ ...assignForm, email })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(assignErrors.plan_id)}>
                <FieldLabel htmlFor="assign-plan">套餐</FieldLabel>
                <Select
                  value={assignForm.planId}
                  onValueChange={(planId) =>
                    setAssignForm({ ...assignForm, planId })
                  }
                >
                  <SelectTrigger
                    id="assign-plan"
                    className="w-full"
                    aria-invalid={Boolean(assignErrors.plan_id)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">请选择套餐</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={String(plan.id)}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError
                  errors={assignErrors.plan_id?.map((message) => ({ message }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="assign-period">周期</FieldLabel>
                <Select
                  value={assignForm.period}
                  onValueChange={(period) =>
                    setAssignForm({ ...assignForm, period })
                  }
                >
                  <SelectTrigger id="assign-period" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {periods.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field data-invalid={Boolean(assignErrors.total_amount)}>
              <FieldLabel htmlFor="assign-amount">订单金额</FieldLabel>
              <Input
                id="assign-amount"
                type="number"
                min="0"
                step="0.01"
                value={assignForm.amount}
                aria-invalid={Boolean(assignErrors.total_amount)}
                onChange={(event) =>
                  setAssignForm({
                    ...assignForm,
                    amount:
                      event.target.value === ''
                        ? ''
                        : Number(event.target.value),
                  })
                }
              />
              <FieldDescription>
                按站点货币单位填写，最多保留两位小数。
              </FieldDescription>
              <FieldError
                errors={assignErrors.total_amount?.map((message) => ({
                  message,
                }))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={assigning}
              onClick={() => setAssignOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                assigning ||
                !assignForm.email.trim() ||
                assignForm.planId === 'none' ||
                assignForm.amount === ''
              }
              onClick={() => void assignOrder()}
            >
              {assigning ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : null}
              {assigning ? '创建中' : '创建待支付订单'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={actionTitle(pendingAction)}
        description={actionDescription(pendingAction)}
        confirmLabel={actionLabel(pendingAction)}
        destructive={isDestructiveAction(pendingAction)}
        busy={acting}
        onConfirm={runAction}
      />
    </div>
  )
}

export function CommissionsPage() {
  return <OrdersPage commissionOnly />
}

function OrderActions({
  order,
  commissionOnly,
  onDetail,
  detailLoading,
  onAction,
}: {
  order: Order
  commissionOnly: boolean
  onDetail: () => void
  detailLoading: boolean
  onAction: (action: PendingAction) => void
}) {
  return (
    <ButtonGroup className="ml-auto" aria-label={`订单 ${order.id} 操作`}>
      <Button
        variant="outline"
        size="sm"
        disabled={detailLoading}
        onClick={onDetail}
      >
        <Eye data-icon="inline-start" />
        详情
      </Button>
      {(commissionOnly || order.status === 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`${order.trade_no} 操作`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {!commissionOnly && order.status === 0 ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => onAction({ type: 'paid', order })}
                  >
                    <CircleDollarSign aria-hidden="true" />
                    手动确认支付
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onAction({ type: 'cancel', order })}
                  >
                    取消订单
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuGroup>
            {commissionOnly ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>佣金审核</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={order.commission_status === 1}
                    onSelect={() =>
                      onAction({ type: 'commission', order, value: 1 })
                    }
                  >
                    确认佣金
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={order.commission_status === 0}
                    onSelect={() =>
                      onAction({ type: 'commission', order, value: 0 })
                    }
                  >
                    退回待审核
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={order.commission_status === 3}
                    onSelect={() =>
                      onAction({ type: 'commission', order, value: 3 })
                    }
                  >
                    拒绝佣金
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ButtonGroup>
  )
}

function OrderDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: OrderDetail | null
  onOpenChange: (open: boolean) => void
}) {
  if (!detail) return null
  const state = orderStatuses[detail.status] ?? {
    label: `状态 ${detail.status}`,
    tone: 'neutral' as const,
  }
  const values = [
    ['订单号', detail.trade_no],
    ['用户', detail.user?.email ?? `用户 #${detail.user_id}`],
    ['套餐', detail.plan?.name ?? `套餐 #${detail.plan_id}`],
    [
      '类型 / 周期',
      `${orderTypes[detail.type] ?? detail.type} · ${formatPeriod(detail.period)}`,
    ],
    ['总金额', `¥${centToMoney(detail.total_amount)}`],
    ['余额抵扣', `¥${centToMoney(detail.balance_amount)}`],
    ['手续费', `¥${centToMoney(detail.handling_amount)}`],
    ['优惠', `¥${centToMoney(detail.discount_amount)}`],
    ['支付回调号', detail.callback_no || '—'],
    ['创建时间', formatDate(detail.created_at)],
    ['支付时间', formatDate(detail.paid_at)],
  ]
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge label={state.label} tone={state.tone} />
            <Badge variant="outline">ID {detail.id}</Badge>
          </div>
          <DialogTitle>订单详情</DialogTitle>
          <DialogDescription>
            仅展示业务核对所需字段；用户 Token、UUID 和订阅地址不在详情中出现。
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {values.map(([label, value]) => (
            <div key={label} className="bg-card p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-all font-data text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {detail.invite_user ? (
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-muted-foreground">邀请人 / 佣金</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>{detail.invite_user.email}</span>
              <span className="font-data">
                ¥{centToMoney(detail.commission_balance)}
              </span>
              {detail.commission_rate !== null &&
              detail.commission_rate !== undefined ? (
                <Badge variant="secondary">{detail.commission_rate}%</Badge>
              ) : null}
            </div>
          </div>
        ) : null}
        {detail.commission_log?.length ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">佣金记录</h3>
            <div className="space-y-2">
              {detail.commission_log.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                >
                  <span className="font-data">记录 #{log.id}</span>
                  <span>¥{centToMoney(log.balance)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
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
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errors?: string[]
  type?: React.HTMLInputTypeAttribute
}) {
  return (
    <Field data-invalid={Boolean(errors)}>
      <FieldLabel htmlFor={id}>
        {label}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      </FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        aria-invalid={Boolean(errors)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function actionTitle(action: PendingAction) {
  if (!action) return '确认订单操作'
  if (action.type === 'paid') return '手动确认这笔订单已支付？'
  if (action.type === 'cancel') return '取消这笔待支付订单？'
  return `${action.value === 1 ? '确认' : action.value === 3 ? '拒绝' : '退回'}这笔佣金？`
}

function actionDescription(action: PendingAction) {
  if (!action) return ''
  if (action.type === 'paid')
    return '确认后将立即开通订单对应的套餐并处理佣金。请先在支付渠道核对收款，避免重复入账。'
  if (action.type === 'cancel')
    return '只允许取消待支付订单；取消后需要用户重新下单。'
  return `订单 ${maskTradeNo(action.order.trade_no)} 的佣金状态将立即更新。已发放的佣金不会因此退回，请先核对发放记录。`
}

function actionLabel(action: PendingAction) {
  if (action?.type === 'paid') return '确认已收款并履约'
  if (action?.type === 'cancel') return '确认取消订单'
  return '更新佣金状态'
}

function isDestructiveAction(action: PendingAction) {
  return (
    action?.type === 'cancel' ||
    (action?.type === 'commission' && action.value === 3)
  )
}

function centToMoney(value: number | null | undefined) {
  return (Number(value ?? 0) / 100).toFixed(2)
}

function formatPeriod(value: string) {
  const item = periods.find(([key]) => key === value)
  const legacy: Record<string, string> = {
    monthly: '月付',
    quarterly: '季付',
    half_yearly: '半年付',
    yearly: '年付',
    two_yearly: '两年付',
    three_yearly: '三年付',
    onetime: '一次性',
    reset_traffic: '流量重置',
  }
  return item?.[1] ?? legacy[value] ?? value
}

function maskTradeNo(value: string) {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function formatDate(value: number | string | null | undefined) {
  if (!value) return '—'
  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', { hour12: false })
}
