import * as React from 'react'
import {
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileClock,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { ApiError } from '@/lib/api'
import { useAdminApi, useAuth } from '@/lib/auth'

type Paginator<T> = {
  data: T[]
  total: number
  current_page: number
  per_page: number
  last_page: number
}

type Plan = { id: number; name: string }

type User = {
  id: number
  email: string
  plan_id?: number | null
  plan?: Plan | null
  group?: { id: number; name: string } | null
  transfer_enable: number
  u: number
  d: number
  expired_at?: number | null
  banned: boolean | number
  is_admin: boolean | number
  is_staff: boolean | number
  commission_rate?: number | null
  discount?: number | null
  commission_type?: number | null
  balance?: number | null
  commission_balance?: number | null
  remarks?: string | null
  speed_limit?: number | null
  device_limit?: number | null
  online_count?: number | null
  invite_user?: { email: string } | null
  subscribe_url?: string | null
  created_at?: number | string | null
  last_login_at?: number | string | null
}

type UserColumnId =
  | 'user'
  | 'subscription'
  | 'traffic'
  | 'balance'
  | 'expiresAt'
  | 'identity'
  | 'onlineDevices'
  | 'permissionGroup'
  | 'registeredAt'
  | 'lastLogin'

type UserColumn = { id: UserColumnId; label: string }

const userColumns: UserColumn[] = [
  { id: 'user', label: '用户' },
  { id: 'subscription', label: '订阅' },
  { id: 'traffic', label: '流量' },
  { id: 'balance', label: '余额' },
  { id: 'expiresAt', label: '到期时间' },
  { id: 'identity', label: '身份 / 状态' },
  { id: 'onlineDevices', label: '在线设备' },
  { id: 'permissionGroup', label: '权限组' },
  { id: 'registeredAt', label: '注册时间' },
  { id: 'lastLogin', label: '最近登录' },
]

const defaultVisibleUserColumns: UserColumnId[] = [
  'user',
  'subscription',
  'traffic',
  'balance',
  'expiresAt',
  'identity',
  'lastLogin',
]
const userColumnsStorageKey = 'xboard-admin-users-visible-columns-v2'

type NumericValue = number | ''
type BulkScope = 'selected' | 'filtered' | 'all'

type UserForm = {
  id: number
  email: string
  password: string
  planId: string
  transferGiB: NumericValue
  usedUpGiB: NumericValue
  usedDownGiB: NumericValue
  expiredAt: string
  balance: NumericValue
  commissionBalance: NumericValue
  commissionRate: NumericValue
  discount: NumericValue
  commissionType: string
  speedLimit: NumericValue
  deviceLimit: NumericValue
  inviteUserEmail: string
  remarks: string
  banned: boolean
  isAdmin: boolean
  isStaff: boolean
}

type GenerateForm = {
  emailPrefix: string
  emailSuffix: string
  count: NumericValue
  password: string
  planId: string
  expiredAt: string
}

type SubscriptionAssignment = {
  user: User
  planId: string
  expiredAt: string
}

const gib = 1024 ** 3

export function UsersPage() {
  const api = useAdminApi()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [visibleColumns, setVisibleColumns] = React.useState<UserColumnId[]>(
    readVisibleUserColumns,
  )
  const [selection, setSelection] = React.useState<Set<number>>(new Set())
  const [editForm, setEditForm] = React.useState<UserForm | null>(null)
  const [editErrors, setEditErrors] = React.useState<Record<string, string[]>>(
    {},
  )
  const [saving, setSaving] = React.useState(false)
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [generateForm, setGenerateForm] = React.useState<GenerateForm>(() =>
    emptyGenerateForm(),
  )
  const [generating, setGenerating] = React.useState(false)
  const [mailOpen, setMailOpen] = React.useState(false)
  const [mailScope, setMailScope] = React.useState<BulkScope>('selected')
  const [mailSubject, setMailSubject] = React.useState('')
  const [mailContent, setMailContent] = React.useState('')
  const [mailConfirmOpen, setMailConfirmOpen] = React.useState(false)
  const [mailSending, setMailSending] = React.useState(false)
  const [exportScope, setExportScope] = React.useState<BulkScope | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [banScope, setBanScope] = React.useState<BulkScope | null>(null)
  const [banning, setBanning] = React.useState(false)
  const [resetTarget, setResetTarget] = React.useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<User | null>(null)
  const [trafficResetTarget, setTrafficResetTarget] =
    React.useState<User | null>(null)
  const [trafficResetting, setTrafficResetting] = React.useState(false)
  const [subscriptionTarget, setSubscriptionTarget] =
    React.useState<SubscriptionAssignment | null>(null)
  const [subscriptionErrors, setSubscriptionErrors] = React.useState<
    Record<string, string[]>
  >({})
  const [subscriptionSaving, setSubscriptionSaving] = React.useState(false)
  const [copyingUserId, setCopyingUserId] = React.useState<number | null>(null)
  const [acting, setActing] = React.useState(false)

  const inviteUserId = searchParams.get('invite_user_id')
  const filters = React.useMemo(() => {
    const next: Array<{ id: string; value: string }> = search
      ? [{ id: 'email', value: search }]
      : []
    if (inviteUserId && /^\d+$/.test(inviteUserId))
      next.push({ id: 'invite_user_id', value: `eq:${inviteUserId}` })
    return next
  }, [inviteUserId, search])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        userColumnsStorageKey,
        JSON.stringify(visibleColumns),
      )
    } catch {
      // Storage can be unavailable in private browsing or a restricted preview.
    }
  }, [visibleColumns])
  const load = React.useCallback(
    async (signal: AbortSignal) => {
      const [users, plans] = await Promise.all([
        api.post<Paginator<User>>(
          'user/fetch',
          { current: page, pageSize: 20, filter: filters },
          signal,
        ),
        api.get<Plan[]>('plan/fetch', undefined, signal).catch(() => []),
      ])
      return { users, plans }
    },
    [api, filters, page],
  )
  const query = useAdminQuery(load)

  const users = query.data?.users.data ?? []
  const plans = query.data?.plans ?? []
  const allOnPageSelected =
    users.length > 0 && users.every((user) => selection.has(user.id))
  const selectedUsers = users.filter((user) => selection.has(user.id))
  const includesSelf = selectedUsers.some(
    (user) => user.email === session?.email,
  )

  function applySearch(event: React.FormEvent) {
    event.preventDefault()
    setSelection(new Set())
    setPage(1)
    setSearch(searchInput.trim())
  }

  function togglePage(checked: boolean) {
    setSelection((current) => {
      const next = new Set(current)
      users.forEach((user) =>
        checked ? next.add(user.id) : next.delete(user.id),
      )
      return next
    })
  }

  function toggleUser(userId: number, checked: boolean) {
    setSelection((current) => {
      const next = new Set(current)
      if (checked) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  function toggleVisibleColumn(columnId: UserColumnId, checked: boolean) {
    setVisibleColumns((current) => {
      if (checked)
        return current.includes(columnId) ? current : [...current, columnId]
      if (current.length === 1) {
        toast.warning('至少保留一列用户信息')
        return current
      }
      return current.filter((id) => id !== columnId)
    })
  }

  function navigateToUserList(
    path: string,
    user: User,
    params: Record<string, string> = {},
  ) {
    const query = new URLSearchParams({ user_id: String(user.id), ...params })
    navigate(`${path}?${query.toString()}`)
  }

  function openSubscriptionAssignment(user: User) {
    setSubscriptionErrors({})
    setSubscriptionTarget({
      user,
      planId: user.plan_id ? String(user.plan_id) : 'none',
      expiredAt: epochToLocal(user.expired_at),
    })
  }

  async function copySubscriptionUrl(user: User) {
    if (!user.subscribe_url) {
      toast.error('当前列表没有返回订阅 URL，请刷新用户列表后重试。')
      return
    }
    setCopyingUserId(user.id)
    try {
      await copyText(user.subscribe_url)
      toast.success('订阅 URL 已复制到剪贴板')
    } catch (error) {
      toast.error(getErrorMessage(error, '订阅 URL 复制失败。'))
    } finally {
      setCopyingUserId(null)
    }
  }

  async function saveSubscriptionAssignment() {
    if (!subscriptionTarget || subscriptionTarget.planId === 'none') return
    setSubscriptionSaving(true)
    setSubscriptionErrors({})
    try {
      await api.post<boolean>('user/update', {
        id: subscriptionTarget.user.id,
        plan_id: Number(subscriptionTarget.planId),
        expired_at: localToEpoch(subscriptionTarget.expiredAt),
      })
      toast.success('订阅已分配给用户')
      setSubscriptionTarget(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setSubscriptionErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '分配订阅失败。'))
    } finally {
      setSubscriptionSaving(false)
    }
  }

  async function resetTraffic() {
    if (!trafficResetTarget || trafficResetTarget.email === session?.email)
      return
    setTrafficResetting(true)
    try {
      await api.post<unknown>('traffic-reset/reset-user', {
        user_id: trafficResetTarget.id,
        reason: '管理员从用户管理执行重置',
      })
      toast.success('用户流量已重置')
      setTrafficResetTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '流量重置失败。'))
    } finally {
      setTrafficResetting(false)
    }
  }

  function openEdit(user: User) {
    setEditErrors({})
    setEditForm({
      id: user.id,
      email: user.email,
      password: '',
      planId: user.plan_id ? String(user.plan_id) : 'none',
      transferGiB: bytesToGiB(user.transfer_enable),
      usedUpGiB: bytesToGiB(user.u),
      usedDownGiB: bytesToGiB(user.d),
      expiredAt: epochToLocal(user.expired_at),
      balance: user.balance ?? 0,
      commissionBalance: user.commission_balance ?? 0,
      commissionRate: user.commission_rate ?? '',
      discount: user.discount ?? '',
      commissionType: String(user.commission_type ?? 0),
      speedLimit: user.speed_limit ?? '',
      deviceLimit: user.device_limit ?? '',
      inviteUserEmail: user.invite_user?.email ?? '',
      remarks: user.remarks ?? '',
      banned: Boolean(user.banned),
      isAdmin: Boolean(user.is_admin),
      isStaff: Boolean(user.is_staff),
    })
  }

  async function saveUser() {
    if (!editForm) return
    setSaving(true)
    setEditErrors({})
    try {
      await api.post<boolean>('user/update', {
        id: editForm.id,
        email: editForm.email.trim(),
        ...(editForm.password ? { password: editForm.password } : {}),
        plan_id: editForm.planId === 'none' ? null : Number(editForm.planId),
        transfer_enable: gibValue(editForm.transferGiB),
        u: gibValue(editForm.usedUpGiB),
        d: gibValue(editForm.usedDownGiB),
        expired_at: localToEpoch(editForm.expiredAt),
        balance: numberOrZero(editForm.balance),
        commission_balance: numberOrZero(editForm.commissionBalance),
        commission_rate: numberOrNull(editForm.commissionRate),
        discount: numberOrNull(editForm.discount),
        commission_type: Number(editForm.commissionType),
        speed_limit: numberOrNull(editForm.speedLimit),
        device_limit: numberOrNull(editForm.deviceLimit),
        invite_user_email: editForm.inviteUserEmail.trim() || null,
        remarks: editForm.remarks.trim() || null,
        banned: editForm.banned,
        is_admin: editForm.isAdmin,
        is_staff: editForm.isStaff,
      })
      toast.success('用户资料已更新')
      setEditForm(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setEditErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '用户保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function generateUsers() {
    setGenerating(true)
    try {
      const count = Number(generateForm.count)
      const file = await api.download('user/generate', {
        email_prefix: generateForm.emailPrefix.trim() || null,
        email_suffix: generateForm.emailSuffix.trim(),
        generate_count: count,
        password: generateForm.password || null,
        plan_id:
          generateForm.planId === 'none' ? null : Number(generateForm.planId),
        expired_at: localToEpoch(generateForm.expiredAt),
        download_csv: true,
      })
      saveBlob(file.blob, file.filename)
      toast.success(`已生成 ${count} 个用户，敏感凭据已下载为 CSV`)
      setGenerateOpen(false)
      setGenerateForm(emptyGenerateForm())
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '用户生成失败。'))
    } finally {
      setGenerating(false)
    }
  }

  async function exportUsers() {
    if (!exportScope) return
    setExporting(true)
    try {
      const file = await api.download(
        'user/dumpCSV',
        scopePayload(exportScope, selection, filters),
      )
      saveBlob(file.blob, file.filename)
      toast.success('用户数据已下载；请妥善保管其中的订阅地址')
      setExportScope(null)
    } catch (error) {
      toast.error(getErrorMessage(error, '用户导出失败。'))
    } finally {
      setExporting(false)
    }
  }

  async function sendMail() {
    setMailSending(true)
    try {
      await api.post<boolean>('user/sendMail', {
        ...scopePayload(mailScope, selection, filters),
        subject: mailSubject.trim(),
        content: mailContent.trim(),
      })
      toast.success('邮件任务已提交到队列')
      setMailConfirmOpen(false)
      setMailOpen(false)
      setMailSubject('')
      setMailContent('')
    } catch (error) {
      toast.error(getErrorMessage(error, '邮件任务提交失败。'))
    } finally {
      setMailSending(false)
    }
  }

  async function banUsers() {
    if (!banScope) return
    setBanning(true)
    try {
      await api.post<boolean>(
        'user/ban',
        scopePayload(banScope, selection, filters),
      )
      toast.success('目标用户已封禁')
      setBanScope(null)
      setSelection(new Set())
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '批量封禁失败。'))
    } finally {
      setBanning(false)
    }
  }

  async function resetSecret() {
    if (!resetTarget || resetTarget.email === session?.email) return
    setActing(true)
    try {
      await api.post<boolean>('user/resetSecret', { id: resetTarget.id })
      toast.success('订阅密钥和 UUID 已重置，旧订阅地址立即失效')
      setResetTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '密钥重置失败。'))
    } finally {
      setActing(false)
    }
  }

  async function deleteUser() {
    if (!deleteTarget || deleteTarget.email === session?.email) return
    setActing(true)
    try {
      await api.post<boolean>('user/destroy', { id: deleteTarget.id })
      toast.success('用户及关联业务数据已删除')
      setDeleteTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '用户删除失败。'))
    } finally {
      setActing(false)
    }
  }

  const bulkScopeLabel = (scope: BulkScope) =>
    scope === 'selected'
      ? `${selection.size} 个已选用户`
      : scope === 'filtered'
        ? `当前筛选结果（${query.data?.users.total ?? 0} 个）`
        : `全部用户（${query.data?.users.total ?? 0} 个）`

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="用户管理"
        description="维护用户订阅、配额、余额与角色。Token、UUID、订阅地址和生成密码不会显示在页面或日志中。"
        action={
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            生成用户
          </Button>
        }
      />
      {query.error ? (
        <ResourceError
          title="用户读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <form className="flex w-full max-w-lg gap-2" onSubmit={applySearch}>
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="按邮箱搜索"
              aria-label="按邮箱搜索用户"
            />
            <Button type="submit" variant="outline">
              <Search data-icon="inline-start" aria-hidden="true" />
              搜索
            </Button>
            {search || inviteUserId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                  setSelection(new Set())
                  setPage(1)
                  navigate('/users')
                }}
              >
                清除
              </Button>
            ) : null}
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {inviteUserId ? (
              <Badge variant="outline" className="font-data text-[11px]">
                邀请人 #{inviteUserId}
              </Badge>
            ) : null}
            {selection.size ? (
              <Badge variant="secondary">已选 {selection.size}</Badge>
            ) : null}
            <ColumnVisibilityPopover
              visibleColumns={visibleColumns}
              onToggle={toggleVisibleColumn}
              onReset={() => setVisibleColumns(defaultVisibleUserColumns)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!selection.size}
              onClick={() => {
                setMailScope('selected')
                setMailOpen(true)
              }}
            >
              <Mail data-icon="inline-start" aria-hidden="true" />
              群发邮件
            </Button>
            <BulkMenu
              disabled={query.loading}
              selectionCount={selection.size}
              hasFilter={Boolean(search || inviteUserId)}
              onExport={setExportScope}
              onBan={setBanScope}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="选择本页全部用户"
                    checked={allOnPageSelected}
                    onCheckedChange={(checked) => togglePage(checked === true)}
                  />
                </TableHead>
                {userColumns
                  .filter((column) => visibleColumns.includes(column.id))
                  .map((column) => (
                    <TableHead key={column.id}>{column.label}</TableHead>
                  ))}
                <TableHead className="w-12">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading ? (
                <ResourceTableLoading columns={visibleColumns.length + 2} />
              ) : (
                users.map((user) => {
                  const used = Number(user.u || 0) + Number(user.d || 0)
                  const isSelf = user.email === session?.email
                  return (
                    <TableRow
                      key={user.id}
                      data-state={
                        selection.has(user.id) ? 'selected' : undefined
                      }
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          aria-label={`选择 ${user.email}`}
                          checked={selection.has(user.id)}
                          onCheckedChange={(checked) =>
                            toggleUser(user.id, checked === true)
                          }
                        />
                      </TableCell>
                      {userColumns
                        .filter((column) => visibleColumns.includes(column.id))
                        .map((column) => (
                          <UserTableCell
                            key={column.id}
                            column={column.id}
                            user={user}
                            isSelf={isSelf}
                            used={used}
                          />
                        ))}
                      <TableCell>
                        <UserActions
                          user={user}
                          isSelf={isSelf}
                          copying={copyingUserId === user.id}
                          onEdit={() => openEdit(user)}
                          onAssignOrder={() =>
                            navigateToUserList('/orders', user, {
                              action: 'assign',
                              email: user.email,
                            })
                          }
                          onAssignSubscription={() =>
                            openSubscriptionAssignment(user)
                          }
                          onCopySubscription={() =>
                            void copySubscriptionUrl(user)
                          }
                          onResetSecret={() => setResetTarget(user)}
                          onViewOrders={() =>
                            navigateToUserList('/orders', user)
                          }
                          onViewInvites={() =>
                            navigateToUserList('/users', user, {
                              invite_user_id: String(user.id),
                            })
                          }
                          onViewTraffic={() =>
                            navigateToUserList('/traffic-reset-logs', user)
                          }
                          onResetTraffic={() => setTrafficResetTarget(user)}
                          onDelete={() => setDeleteTarget(user)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {!query.loading && !users.length ? (
          <ResourceEmpty
            title="没有匹配的用户"
            description={
              search ? '请更换邮箱关键字后重试。' : '当前环境还没有普通用户。'
            }
            action={
              search ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInput('')
                    setSearch('')
                    setSelection(new Set())
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <Button size="sm" onClick={() => setGenerateOpen(true)}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  生成用户
                </Button>
              )
            }
          />
        ) : null}
        <ResourcePagination
          page={page}
          pageSize={query.data?.users.per_page ?? 20}
          total={query.data?.users.total ?? 0}
          disabled={query.loading || query.refreshing}
          loading={query.loading}
          onPageChange={(nextPage) => {
            setSelection(new Set())
            setPage(nextPage)
          }}
        />
      </Card>

      <EditUserDialog
        form={editForm}
        setForm={setEditForm}
        errors={editErrors}
        plans={plans}
        currentEmail={session?.email ?? ''}
        saving={saving}
        onSave={saveUser}
      />

      <SubscriptionAssignmentDialog
        assignment={subscriptionTarget}
        setAssignment={setSubscriptionTarget}
        plans={plans}
        errors={subscriptionErrors}
        saving={subscriptionSaving}
        onSave={saveSubscriptionAssignment}
      />

      <Dialog
        open={generateOpen}
        onOpenChange={(open) => !generating && setGenerateOpen(open)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量生成用户</DialogTitle>
            <DialogDescription>
              生成后立即下载一次性敏感 CSV，其中包含账号、密码、UUID
              和订阅地址。页面不会展示或保留这些值。
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>敏感文件</AlertTitle>
            <AlertDescription>
              请只在受控设备上生成，下载后转移到安全位置；相同邮箱前缀会自动追加
              _1、_2 等序号。
            </AlertDescription>
          </Alert>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <Field>
                <FieldLabel htmlFor="generate-prefix">邮箱前缀</FieldLabel>
                <Input
                  id="generate-prefix"
                  value={generateForm.emailPrefix}
                  placeholder="trial"
                  onChange={(event) =>
                    setGenerateForm({
                      ...generateForm,
                      emailPrefix: event.target.value,
                    })
                  }
                />
              </Field>
              <span className="hidden self-end pb-2 text-muted-foreground sm:block">
                @
              </span>
              <Field>
                <FieldLabel htmlFor="generate-suffix">
                  邮箱域名
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Input
                  id="generate-suffix"
                  value={generateForm.emailSuffix}
                  placeholder="example.com"
                  onChange={(event) =>
                    setGenerateForm({
                      ...generateForm,
                      emailSuffix: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="generate-count"
                label="数量"
                value={generateForm.count}
                min={1}
                max={500}
                required
                onChange={(count) =>
                  setGenerateForm({ ...generateForm, count })
                }
              />
              <Field>
                <FieldLabel htmlFor="generate-plan">套餐</FieldLabel>
                <Select
                  value={generateForm.planId}
                  onValueChange={(planId) =>
                    setGenerateForm({ ...generateForm, planId })
                  }
                >
                  <SelectTrigger id="generate-plan" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">无套餐</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={String(plan.id)}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="generate-expired">到期时间</FieldLabel>
                <Input
                  id="generate-expired"
                  type="datetime-local"
                  value={generateForm.expiredAt}
                  onChange={(event) =>
                    setGenerateForm({
                      ...generateForm,
                      expiredAt: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="generate-password">统一密码</FieldLabel>
              <Input
                id="generate-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={generateForm.password}
                placeholder="留空时后端使用邮箱作为初始密码"
                onChange={(event) =>
                  setGenerateForm({
                    ...generateForm,
                    password: event.target.value,
                  })
                }
              />
              <FieldDescription>
                建议填写至少 8 位随机密码，并通过安全渠道传递 CSV。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={generating}
              onClick={() => setGenerateOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                generating ||
                !generateForm.emailSuffix.trim() ||
                Number(generateForm.count) < 1 ||
                Number(generateForm.count) > 500 ||
                Boolean(
                  generateForm.password && generateForm.password.length < 8,
                )
              }
              onClick={() => void generateUsers()}
            >
              {generating ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : (
                <Download data-icon="inline-start" aria-hidden="true" />
              )}
              {generating ? '生成中' : '生成并下载 CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mailOpen}
        onOpenChange={(open) => !mailSending && setMailOpen(open)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>群发邮件</DialogTitle>
            <DialogDescription>
              邮件会进入真实后端发送队列。正文按纯文本发送，提交前会再次确认作用范围。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mail-scope">收件范围</FieldLabel>
              <Select
                value={mailScope}
                onValueChange={(value) => setMailScope(value as BulkScope)}
              >
                <SelectTrigger id="mail-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {selection.size ? (
                      <SelectItem value="selected">
                        {bulkScopeLabel('selected')}
                      </SelectItem>
                    ) : null}
                    {search ? (
                      <SelectItem value="filtered">
                        {bulkScopeLabel('filtered')}
                      </SelectItem>
                    ) : null}
                    <SelectItem value="all">{bulkScopeLabel('all')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="mail-subject">
                邮件主题
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Input
                id="mail-subject"
                value={mailSubject}
                onChange={(event) => setMailSubject(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="mail-content">
                正文
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Textarea
                id="mail-content"
                rows={9}
                value={mailContent}
                onChange={(event) => setMailContent(event.target.value)}
              />
              <FieldDescription>
                可使用后端支持的变量；本管理端不会预览或记录展开后的用户敏感数据。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !mailSubject.trim() ||
                !mailContent.trim() ||
                (mailScope === 'selected' && !selection.size)
              }
              onClick={() => setMailConfirmOpen(true)}
            >
              <Mail data-icon="inline-start" aria-hidden="true" />
              检查并确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={mailConfirmOpen}
        onOpenChange={setMailConfirmOpen}
        title={`向${bulkScopeLabel(mailScope)}发送邮件？`}
        description="提交后会为范围内每个用户创建真实邮件队列任务，无法从本管理端撤回。请确认主题、正文和范围无误。"
        confirmLabel="提交邮件任务"
        busy={mailSending}
        onConfirm={sendMail}
      />
      <ConfirmActionDialog
        open={Boolean(exportScope)}
        onOpenChange={(open) => !open && setExportScope(null)}
        title={`导出${exportScope ? bulkScopeLabel(exportScope) : '用户'}？`}
        description="导出的 CSV 包含余额、配额和完整订阅地址，属于敏感数据。文件只会下载到当前设备，不会在本页面预览。"
        confirmLabel="确认下载 CSV"
        busy={exporting}
        onConfirm={exportUsers}
      />
      <ConfirmActionDialog
        open={Boolean(banScope)}
        onOpenChange={(open) => !open && setBanScope(null)}
        title={`封禁${banScope ? bulkScopeLabel(banScope) : '用户'}？`}
        description={
          includesSelf && banScope === 'selected'
            ? '当前选择包含你正在使用的管理员账号，因此不能提交批量封禁。请先取消选择当前账号。'
            : '后端只会把目标账号设为封禁状态，不提供批量解封动作。单个用户仍可在编辑页恢复。'
        }
        confirmLabel="确认批量封禁"
        destructive
        busy={banning}
        onConfirm={
          includesSelf && banScope === 'selected'
            ? () => setBanScope(null)
            : banUsers
        }
      />
      <ConfirmActionDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={`重置 ${resetTarget?.email ?? '用户'} 的 UUID 及订阅 URL？`}
        description="这会同时更换 Token 和 UUID，使旧订阅地址及现有客户端配置失效。新的订阅 URL 不会在页面中展示，只能通过复制动作取得。"
        confirmLabel="重置 UUID 及订阅 URL"
        destructive
        busy={acting}
        onConfirm={resetSecret}
      />
      <ConfirmActionDialog
        open={Boolean(trafficResetTarget)}
        onOpenChange={(open) =>
          !open && !trafficResetting && setTrafficResetTarget(null)
        }
        title={`重置 ${trafficResetTarget?.email ?? '用户'} 的流量？`}
        description="用户当前上行和下行用量将被清零，并写入流量重置审计日志。请确认已经核对目标用户。"
        confirmLabel="确认重置流量"
        destructive
        busy={trafficResetting}
        onConfirm={resetTraffic}
      />
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`删除用户 ${deleteTarget?.email ?? ''}？`}
        description="后端会同时删除该用户的订单、优惠码、统计和工单记录。这是不可逆的业务数据删除。"
        confirmLabel="永久删除用户"
        destructive
        busy={acting}
        onConfirm={deleteUser}
      />
    </div>
  )
}

function ColumnVisibilityPopover({
  visibleColumns,
  onToggle,
  onReset,
}: {
  visibleColumns: UserColumnId[]
  onToggle: (columnId: UserColumnId, checked: boolean) => void
  onReset: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="设置用户列表显示列"
          className="gap-1.5"
        >
          <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          <span className="hidden sm:inline">显示列</span>
          <span className="font-data text-[11px] text-muted-foreground">
            {visibleColumns.length}/{userColumns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between border-b px-2 pb-2">
          <PopoverTitle>显示列</PopoverTitle>
          <Button variant="ghost" size="xs" onClick={onReset}>
            恢复默认
          </Button>
        </div>
        <div
          className="mt-1 max-h-80 space-y-0.5 overflow-y-auto"
          aria-label="用户列表显示列"
        >
          {userColumns.map((column) => {
            const checked = visibleColumns.includes(column.id)
            return (
              <label
                key={column.id}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => onToggle(column.id, next === true)}
                  aria-label={`显示${column.label}`}
                />
                <span className="text-sm">{column.label}</span>
              </label>
            )
          })}
        </div>
        <div className="border-t px-2 pt-2 text-[11px] text-muted-foreground">
          已选择 {visibleColumns.length} 项；设置仅保存在当前浏览器。
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserTableCell({
  column,
  user,
  isSelf,
  used,
}: {
  column: UserColumnId
  user: User
  isSelf: boolean
  used: number
}) {
  switch (column) {
    case 'user':
      return (
        <TableCell className="max-w-64">
          <div className="truncate font-medium">{user.email}</div>
          <div className="font-data text-[11px] text-muted-foreground">
            ID {user.id}
            {isSelf ? ' · 当前账号' : ''}
          </div>
          {user.remarks ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {user.remarks}
            </div>
          ) : null}
        </TableCell>
      )
    case 'subscription':
      return (
        <TableCell>
          <div>
            {user.plan?.name ?? (
              <span className="text-muted-foreground">无套餐</span>
            )}
          </div>
          {user.plan_id ? (
            <div className="mt-1 font-data text-[11px] text-muted-foreground">
              套餐 #{user.plan_id}
            </div>
          ) : null}
        </TableCell>
      )
    case 'traffic':
      return (
        <TableCell>
          <span className="font-data text-xs">
            {formatBytes(used)} / {formatBytes(user.transfer_enable)}
          </span>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {percent(used, user.transfer_enable)} 已用
          </div>
        </TableCell>
      )
    case 'balance':
      return (
        <TableCell>
          <span className="font-data text-xs">
            ¥{formatMoney(user.balance)}
          </span>
          <div className="mt-1 text-[11px] text-muted-foreground">
            佣金 ¥{formatMoney(user.commission_balance)}
          </div>
        </TableCell>
      )
    case 'expiresAt':
      return (
        <TableCell className="font-data text-xs">
          {formatEpoch(user.expired_at, '长期有效')}
        </TableCell>
      )
    case 'identity':
      return (
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {user.is_admin ? (
              <StatusBadge label="管理员" tone="warning" />
            ) : user.is_staff ? (
              <StatusBadge label="员工" tone="info" />
            ) : (
              <StatusBadge label="用户" tone="neutral" />
            )}
            <StatusBadge
              label={user.banned ? '已封禁' : '正常'}
              tone={user.banned ? 'danger' : 'success'}
            />
          </div>
        </TableCell>
      )
    case 'onlineDevices':
      return (
        <TableCell>
          <span className="inline-flex items-center gap-1.5 font-data text-xs">
            <Smartphone
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {user.online_count ?? 0}
          </span>
          <div className="mt-1 text-[11px] text-muted-foreground">
            上限 {user.device_limit || '不限'}
          </div>
        </TableCell>
      )
    case 'permissionGroup':
      return (
        <TableCell>
          {user.group?.name ?? (
            <span className="text-muted-foreground">未绑定分组</span>
          )}
        </TableCell>
      )
    case 'registeredAt':
      return (
        <TableCell className="font-data text-xs text-muted-foreground">
          {formatDateLike(user.created_at)}
        </TableCell>
      )
    case 'lastLogin':
      return (
        <TableCell className="font-data text-xs text-muted-foreground">
          {formatDateLike(user.last_login_at)}
        </TableCell>
      )
  }
}

function UserActions({
  user,
  isSelf,
  copying,
  onEdit,
  onAssignOrder,
  onAssignSubscription,
  onCopySubscription,
  onResetSecret,
  onViewOrders,
  onViewInvites,
  onViewTraffic,
  onResetTraffic,
  onDelete,
}: {
  user: User
  isSelf: boolean
  copying: boolean
  onEdit: () => void
  onAssignOrder: () => void
  onAssignSubscription: () => void
  onCopySubscription: () => void
  onResetSecret: () => void
  onViewOrders: () => void
  onViewInvites: () => void
  onViewTraffic: () => void
  onResetTraffic: () => void
  onDelete: () => void
}) {
  return (
    <ButtonGroup className="ml-auto" aria-label={`${user.email} 操作`}>
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`${user.email} 操作`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onAssignOrder}>
              <ClipboardList aria-hidden="true" />
              分配订单
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAssignSubscription}>
              <PackagePlus aria-hidden="true" />
              分配订阅
            </DropdownMenuItem>
            <DropdownMenuItem disabled={copying} onSelect={onCopySubscription}>
              <Copy aria-hidden="true" />
              {copying ? '复制订阅 URL 中' : '复制订阅 URL'}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isSelf} onSelect={onResetSecret}>
              <RefreshCw aria-hidden="true" />
              重置 UUID 及订阅 URL
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>关联记录</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onViewOrders}>
              <Eye aria-hidden="true" />
              查看订单
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onViewInvites}>
              <UsersRound aria-hidden="true" />
              查看邀请
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onViewTraffic}>
              <FileClock aria-hidden="true" />
              查看流量记录
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={isSelf} onSelect={onResetTraffic}>
              <RotateCcw aria-hidden="true" />
              重置流量
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf}
              onSelect={onDelete}
            >
              <Trash2 aria-hidden="true" />
              删除
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {isSelf ? (
            <div className="border-t px-2 py-2 text-[11px] text-muted-foreground">
              当前管理员账号受保护，不能重置密钥、流量或删除。
            </div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

function SubscriptionAssignmentDialog({
  assignment,
  setAssignment,
  plans,
  errors,
  saving,
  onSave,
}: {
  assignment: SubscriptionAssignment | null
  setAssignment: React.Dispatch<
    React.SetStateAction<SubscriptionAssignment | null>
  >
  plans: Plan[]
  errors: Record<string, string[]>
  saving: boolean
  onSave: () => void
}) {
  return (
    <Dialog
      open={Boolean(assignment)}
      onOpenChange={(open) => !open && !saving && setAssignment(null)}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>分配订阅</DialogTitle>
          <DialogDescription>
            {assignment
              ? `为 ${assignment.user.email} 直接写入订阅套餐和到期时间。`
              : ''}
            此操作调用用户更新接口，不创建订单。
          </DialogDescription>
        </DialogHeader>
        {assignment ? (
          <FieldGroup>
            <Field data-invalid={Boolean(errors.plan_id)}>
              <FieldLabel htmlFor="assign-subscription-plan">
                订阅套餐
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Select
                value={assignment.planId}
                onValueChange={(planId) =>
                  setAssignment({ ...assignment, planId })
                }
              >
                <SelectTrigger
                  id="assign-subscription-plan"
                  className="w-full"
                  aria-invalid={Boolean(errors.plan_id)}
                >
                  <SelectValue placeholder="请选择套餐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError
                errors={errors.plan_id?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={Boolean(errors.expired_at)}>
              <FieldLabel htmlFor="assign-subscription-expired">
                到期时间
              </FieldLabel>
              <Input
                id="assign-subscription-expired"
                type="datetime-local"
                value={assignment.expiredAt}
                onChange={(event) =>
                  setAssignment({
                    ...assignment,
                    expiredAt: event.target.value,
                  })
                }
              />
              <FieldDescription>
                留空表示长期有效；套餐权限组会由后端同步。
              </FieldDescription>
              <FieldError
                errors={errors.expired_at?.map((message) => ({ message }))}
              />
            </Field>
          </FieldGroup>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setAssignment(null)}
          >
            取消
          </Button>
          <Button
            disabled={saving || !assignment || assignment.planId === 'none'}
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : (
              <PackagePlus data-icon="inline-start" aria-hidden="true" />
            )}
            {saving ? '保存中' : '保存订阅'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkMenu({
  disabled,
  selectionCount,
  hasFilter,
  onExport,
  onBan,
}: {
  disabled: boolean
  selectionCount: number
  hasFilter: boolean
  onExport: (scope: BulkScope) => void
  onBan: (scope: BulkScope) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <MoreHorizontal data-icon="inline-start" aria-hidden="true" />
          批量操作
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>敏感数据导出</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={!selectionCount}
            onSelect={() => onExport('selected')}
          >
            <Download aria-hidden="true" />
            导出已选用户
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasFilter}
            onSelect={() => onExport('filtered')}
          >
            <Download aria-hidden="true" />
            导出当前筛选
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport('all')}>
            <Download aria-hidden="true" />
            导出全部用户
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>账号状态</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={!selectionCount}
            onSelect={() => onBan('selected')}
          >
            <ShieldAlert aria-hidden="true" />
            封禁已选用户
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!hasFilter}
            onSelect={() => onBan('filtered')}
          >
            <ShieldAlert aria-hidden="true" />
            封禁当前筛选
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onBan('all')}>
            <ShieldAlert aria-hidden="true" />
            封禁全部用户
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EditUserDialog({
  form,
  setForm,
  errors,
  plans,
  currentEmail,
  saving,
  onSave,
}: {
  form: UserForm | null
  setForm: React.Dispatch<React.SetStateAction<UserForm | null>>
  errors: Record<string, string[]>
  plans: Plan[]
  currentEmail: string
  saving: boolean
  onSave: () => void
}) {
  if (!form) return null
  const isSelf = form.email === currentEmail
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>编辑用户</DialogTitle>
          <DialogDescription>
            配额和用量以 GiB
            输入，余额以站点货币主单位输入。密码留空表示保持不变。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="user-email"
              label="邮箱"
              value={form.email}
              errors={errors.email}
              required
              type="email"
              onChange={(email) => setForm({ ...form, email })}
            />
            <TextField
              id="user-password"
              label="新密码"
              value={form.password}
              errors={errors.password}
              type="password"
              description="留空不修改；填写时至少 8 位。"
              onChange={(password) => setForm({ ...form, password })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="user-plan">订阅套餐</FieldLabel>
              <Select
                value={form.planId}
                onValueChange={(planId) => setForm({ ...form, planId })}
              >
                <SelectTrigger id="user-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">无套餐</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                选择套餐时，后端会同步其服务器可见性分组。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-expired">到期时间</FieldLabel>
              <Input
                id="user-expired"
                type="datetime-local"
                value={form.expiredAt}
                onChange={(event) =>
                  setForm({ ...form, expiredAt: event.target.value })
                }
              />
              <FieldDescription>留空为长期有效。</FieldDescription>
            </Field>
          </div>
          <FieldSet className="rounded-2xl border p-4">
            <FieldLegend>流量与设备</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <NumberField
                id="user-transfer"
                label="总配额（GiB）"
                value={form.transferGiB}
                errors={errors.transfer_enable}
                min={0}
                onChange={(transferGiB) => setForm({ ...form, transferGiB })}
              />
              <NumberField
                id="user-u"
                label="上行已用（GiB）"
                value={form.usedUpGiB}
                errors={errors.u}
                min={0}
                onChange={(usedUpGiB) => setForm({ ...form, usedUpGiB })}
              />
              <NumberField
                id="user-d"
                label="下行已用（GiB）"
                value={form.usedDownGiB}
                errors={errors.d}
                min={0}
                onChange={(usedDownGiB) => setForm({ ...form, usedDownGiB })}
              />
              <NumberField
                id="user-speed"
                label="限速（Mbps）"
                value={form.speedLimit}
                errors={errors.speed_limit}
                min={0}
                onChange={(speedLimit) => setForm({ ...form, speedLimit })}
              />
              <NumberField
                id="user-devices"
                label="设备数"
                value={form.deviceLimit}
                errors={errors.device_limit}
                min={0}
                onChange={(deviceLimit) => setForm({ ...form, deviceLimit })}
              />
            </div>
          </FieldSet>
          <FieldSet className="rounded-2xl border p-4">
            <FieldLegend>财务与推广</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                id="user-balance"
                label="账户余额"
                value={form.balance}
                errors={errors.balance}
                min={0}
                step="0.01"
                onChange={(balance) => setForm({ ...form, balance })}
              />
              <NumberField
                id="user-commission-balance"
                label="佣金余额"
                value={form.commissionBalance}
                errors={errors.commission_balance}
                min={0}
                step="0.01"
                onChange={(commissionBalance) =>
                  setForm({ ...form, commissionBalance })
                }
              />
              <Field>
                <FieldLabel htmlFor="user-commission-type">佣金模式</FieldLabel>
                <Select
                  value={form.commissionType}
                  onValueChange={(commissionType) =>
                    setForm({ ...form, commissionType })
                  }
                >
                  <SelectTrigger id="user-commission-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="0">跟随系统</SelectItem>
                      <SelectItem value="1">循环返利</SelectItem>
                      <SelectItem value="2">首次返利</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <NumberField
                id="user-commission-rate"
                label="返利比例（%）"
                value={form.commissionRate}
                errors={errors.commission_rate}
                min={0}
                max={100}
                onChange={(commissionRate) =>
                  setForm({ ...form, commissionRate })
                }
              />
              <NumberField
                id="user-discount"
                label="专属折扣（%）"
                value={form.discount}
                errors={errors.discount}
                min={0}
                max={100}
                onChange={(discount) => setForm({ ...form, discount })}
              />
              <TextField
                id="user-inviter"
                label="邀请人邮箱"
                value={form.inviteUserEmail}
                type="email"
                description="后端按邮箱查找邀请人；留空解除关联。"
                onChange={(inviteUserEmail) =>
                  setForm({ ...form, inviteUserEmail })
                }
              />
            </div>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="user-remarks">备注</FieldLabel>
            <Textarea
              id="user-remarks"
              rows={3}
              value={form.remarks}
              onChange={(event) =>
                setForm({ ...form, remarks: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <ToggleField
              id="user-banned"
              label="封禁账号"
              description="封禁时后端会清除会话。"
              checked={form.banned}
              disabled={isSelf}
              onChange={(banned) => setForm({ ...form, banned })}
            />
            <ToggleField
              id="user-admin"
              label="管理员"
              description={
                isSelf
                  ? '不能在当前会话中移除自己的管理员权限。'
                  : '允许访问管理后台。'
              }
              checked={form.isAdmin}
              disabled={isSelf}
              onChange={(isAdmin) => setForm({ ...form, isAdmin })}
            />
            <ToggleField
              id="user-staff"
              label="员工"
              description="保留原版 XBoard 的员工角色。"
              checked={form.isStaff}
              onChange={(isStaff) => setForm({ ...form, isStaff })}
            />
          </div>
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
              !form.email.trim() ||
              Boolean(form.password && form.password.length < 8) ||
              form.transferGiB === ''
            }
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : null}
            {saving ? '保存中' : '保存用户'}
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
  required = false,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errors?: string[]
  description?: string
  required?: boolean
  type?: React.HTMLInputTypeAttribute
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
        type={type}
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
  required = false,
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
  required?: boolean
  min?: number
  max?: number
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

function ToggleField({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Field className="h-full rounded-2xl border p-4">
      <div className="flex w-full items-start justify-between gap-3">
        <span>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </span>
        <Switch
          id={id}
          className="shrink-0"
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    </Field>
  )
}

function emptyGenerateForm(): GenerateForm {
  return {
    emailPrefix: '',
    emailSuffix: '',
    count: 1,
    password: '',
    planId: 'none',
    expiredAt: '',
  }
}

function readVisibleUserColumns(): UserColumnId[] {
  if (typeof window === 'undefined') return defaultVisibleUserColumns
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(userColumnsStorageKey) ?? 'null',
    )
    if (!Array.isArray(stored)) return defaultVisibleUserColumns
    const valid = stored.filter(
      (value): value is UserColumnId =>
        typeof value === 'string' &&
        userColumns.some((column) => column.id === value),
    )
    return valid.length ? [...new Set(valid)] : defaultVisibleUserColumns
  } catch {
    return defaultVisibleUserColumns
  }
}

function scopePayload(
  scope: BulkScope,
  selection: Set<number>,
  filters: Array<{ id: string; value: string }>,
) {
  return {
    scope,
    ...(scope === 'selected' ? { user_ids: [...selection] } : {}),
    ...(scope === 'filtered' ? { filter: filters } : {}),
  }
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || 'download.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.className = 'fixed -left-full top-0 opacity-0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('当前浏览器不允许访问剪贴板。')
}

function bytesToGiB(value: number | null | undefined): number {
  return Number((Number(value ?? 0) / gib).toFixed(3))
}

function gibValue(value: NumericValue) {
  return Math.round(numberOrZero(value) * gib)
}

function numberOrZero(value: NumericValue) {
  return value === '' ? 0 : Number(value)
}

function numberOrNull(value: NumericValue) {
  return value === '' ? null : Number(value)
}

function epochToLocal(value: number | null | undefined) {
  if (!value) return ''
  const date = new Date(value * 1000)
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

function localToEpoch(value: string) {
  return value ? Math.floor(new Date(value).getTime() / 1000) : null
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 GiB'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`
}

function percent(used: number, total: number) {
  if (!total) return '0%'
  return `${Math.min(999, Math.round((used / total) * 100))}%`
}

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2)
}

function formatEpoch(value: number | null | undefined, empty: string) {
  return value
    ? new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
    : empty
}

function formatDateLike(value: number | string | null | undefined) {
  if (!value) return '从未'
  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('zh-CN', { hour12: false })
}
