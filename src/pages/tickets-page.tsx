import * as React from 'react'
import { Mail, MessageSquareReply, Search, XCircle } from 'lucide-react'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
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
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { useListSelection } from '@/hooks/use-list-selection'
import { useAdminApi } from '@/lib/auth'

type TicketUser = { id: number; email: string }
type Ticket = {
  id: number
  user_id: number
  user?: TicketUser | null
  subject: string
  level?: number | string | null
  status: number
  reply_status?: number | null
  created_at?: number | string | null
  updated_at?: number | string | null
}
type TicketMessage = {
  id: number
  user_id?: number
  message: string
  is_from_user?: boolean
  is_from_admin?: boolean
  created_at?: number | string | null
}
type TicketDetail = Ticket & { messages?: TicketMessage[] }
type TicketList = { data: Ticket[]; total: number }

export function TicketsPage() {
  const api = useAdminApi()
  const [page, setPage] = React.useState(1)
  const [emailInput, setEmailInput] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [status, setStatus] = React.useState('open')
  const [replyStatus, setReplyStatus] = React.useState('waiting')
  const [detail, setDetail] = React.useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [reply, setReply] = React.useState('')
  const [replyConfirmOpen, setReplyConfirmOpen] = React.useState(false)
  const [closeTarget, setCloseTarget] = React.useState<Ticket | null>(null)
  const [acting, setActing] = React.useState(false)

  const load = React.useCallback(
    (signal: AbortSignal) =>
      api.get<TicketList>(
        'ticket/fetch',
        {
          current: page,
          pageSize: 20,
          ...(email ? { email } : {}),
          ...(status !== 'all'
            ? { status: Number(status === 'open' ? 0 : 1) }
            : {}),
          ...(replyStatus !== 'all'
            ? { 'reply_status[]': Number(replyStatus === 'waiting' ? 0 : 1) }
            : {}),
        },
        signal,
      ),
    [api, email, page, replyStatus, status],
  )
  const query = useAdminQuery(load)
  const tickets = React.useMemo(
    () => query.data?.data ?? [],
    [query.data?.data],
  )
  const selectableTickets = React.useMemo(
    () => tickets.filter((ticket) => ticket.status === 0),
    [tickets],
  )
  const selection = useListSelection(
    selectableTickets,
    `tickets:${page}:${email}:${status}:${replyStatus}`,
  )
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const pageBusy = detailLoading || acting || bulkBusy
  const bulkActions = [
    {
      id: 'close',
      label: '批量关闭工单',
      description: '确认后会关闭当前选中的工单，不会发送回复。',
      icon: XCircle,
      destructive: true,
      run: async (ticket: Ticket) => {
        if (ticket.status !== 0) throw new Error('只有开启中的工单可以关闭。')
        return api.post<boolean>('ticket/close', { id: ticket.id })
      },
    },
  ] as const

  function applyEmail(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setEmail(emailInput.trim())
  }

  async function openTicket(ticket: Ticket) {
    setDetailLoading(true)
    try {
      setDetail(await api.get<TicketDetail>('ticket/fetch', { id: ticket.id }))
      setReply('')
    } catch (error) {
      toast.error(getErrorMessage(error, '工单详情读取失败。'))
    } finally {
      setDetailLoading(false)
    }
  }

  async function refreshDetail(id: number) {
    setDetail(await api.get<TicketDetail>('ticket/fetch', { id }))
  }

  async function sendReply() {
    if (!detail) return
    setActing(true)
    try {
      await api.post<boolean>('ticket/reply', {
        id: detail.id,
        message: reply.trim(),
      })
      toast.success('回复已发送，并已触发用户邮件通知队列')
      setReply('')
      setReplyConfirmOpen(false)
      await refreshDetail(detail.id)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '工单回复失败。'))
    } finally {
      setActing(false)
    }
  }

  async function closeTicket() {
    if (!closeTarget) return
    setActing(true)
    try {
      await api.post<boolean>('ticket/close', { id: closeTarget.id })
      toast.success('工单已关闭')
      if (detail?.id === closeTarget.id) setDetail(null)
      setCloseTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '工单关闭失败。'))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="工单管理"
        description="优先处理等待管理员回复的开启工单；消息按纯文本展示，回复后会通知用户。"
      />
      {query.error ? (
        <ResourceError
          title="工单读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-start xl:justify-between">
          <form
            className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row"
            onSubmit={applyEmail}
          >
            <Input
              className="w-full lg:max-w-md"
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="按用户完整邮箱筛选"
              aria-label="用户邮箱"
            />
            <Button type="submit" variant="outline">
              <Search data-icon="inline-start" aria-hidden="true" />
              筛选
            </Button>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
            >
              <SelectTrigger
                className="w-full lg:ml-auto lg:w-36"
                aria-label="工单状态"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部工单</SelectItem>
                  <SelectItem value="open">开启中</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={replyStatus}
              onValueChange={(value) => {
                setReplyStatus(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full lg:w-44" aria-label="回复状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部回复状态</SelectItem>
                  <SelectItem value="waiting">等待管理员回复</SelectItem>
                  <SelectItem value="replied">管理员已回复</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {email || status !== 'open' || replyStatus !== 'waiting' ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEmailInput('')
                  setEmail('')
                  setStatus('open')
                  setReplyStatus('waiting')
                  setPage(1)
                }}
              >
                恢复默认
              </Button>
            ) : null}
          </form>
          <div className="flex flex-wrap items-center gap-2 xl:pt-1">
            <SelectionSummary
              selected={selection.count}
              total={selectableTickets.length}
              onClear={selection.clear}
            />
            <BulkActions<Ticket>
              selected={selection.selectedRows}
              actions={bulkActions}
              getLabel={(ticket) =>
                '工单 #' + ticket.id + ' · ' + ticket.subject
              }
              onComplete={(failedIds) => {
                selection.retain(failedIds)
                query.reload()
              }}
              onBusyChange={setBulkBusy}
              disabled={query.loading || query.refreshing || pageBusy}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="选择当前页全部开启工单"
                    checked={selection.checked}
                    disabled={query.loading || query.refreshing || pageBusy}
                    onCheckedChange={(checked) =>
                      selection.toggleAll(checked === true)
                    }
                  />
                </TableHead>
                <TableHead>主题</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>级别</TableHead>
                <TableHead>工单状态</TableHead>
                <TableHead>回复状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-40">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading ? (
                <ResourceTableLoading columns={8} />
              ) : (
                tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    data-state={
                      selection.selectedIds.has(ticket.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={'选择工单 ' + ticket.id}
                        checked={selection.selectedIds.has(ticket.id)}
                        disabled={
                          ticket.status !== 0 ||
                          query.loading ||
                          query.refreshing ||
                          pageBusy
                        }
                        onCheckedChange={(checked) =>
                          selection.toggle(ticket.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-md pl-4">
                      <div className="truncate font-medium">
                        {ticket.subject}
                      </div>
                      <div className="font-data text-[11px] text-muted-foreground">
                        工单 #{ticket.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-64 truncate">
                        {ticket.user?.email ?? `用户 #${ticket.user_id}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatLevel(ticket.level)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={ticket.status === 0 ? '开启' : '已关闭'}
                        tone={ticket.status === 0 ? 'success' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={
                          ticket.reply_status === 0 ? '等待管理员' : '已回复'
                        }
                        tone={ticket.reply_status === 0 ? 'warning' : 'info'}
                      />
                    </TableCell>
                    <TableCell className="font-data text-xs text-muted-foreground">
                      {formatDate(ticket.updated_at)}
                    </TableCell>
                    <TableCell>
                      <TicketActions
                        ticket={ticket}
                        disabled={pageBusy}
                        onOpen={() => void openTicket(ticket)}
                        onClose={() => setCloseTarget(ticket)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!query.loading && !tickets.length ? (
          <ResourceEmpty
            title="当前没有待处理工单"
            description="调整工单状态、回复状态或邮箱筛选可查看其他记录。"
          />
        ) : null}
        <ResourcePagination
          page={page}
          pageSize={20}
          total={query.data?.total ?? 0}
          disabled={query.loading || query.refreshing}
          loading={query.loading}
          onPageChange={setPage}
        />
      </Card>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && !acting && setDetail(null)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          {detail ? (
            <>
              <DialogHeader>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={detail.status === 0 ? '开启' : '已关闭'}
                    tone={detail.status === 0 ? 'success' : 'neutral'}
                  />
                  <Badge variant="outline">工单 #{detail.id}</Badge>
                </div>
                <DialogTitle>{detail.subject}</DialogTitle>
                <DialogDescription>
                  {detail.user?.email ?? `用户 #${detail.user_id}`} ·{' '}
                  {formatLevel(detail.level)} · 创建于{' '}
                  {formatDate(detail.created_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {detail.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-2xl border p-4 ${message.is_from_admin ? 'ml-auto bg-muted/70' : 'bg-card'}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
                      <span>{message.is_from_admin ? '管理员' : '用户'}</span>
                      <span className="font-data">
                        {formatDate(message.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {message.message}
                    </p>
                  </div>
                ))}
              </div>
              {detail.status === 0 ? (
                <Field>
                  <FieldLabel htmlFor="ticket-reply">回复内容</FieldLabel>
                  <Textarea
                    id="ticket-reply"
                    rows={6}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                  />
                  <FieldDescription className="flex items-center gap-1">
                    <Mail className="size-3.5" aria-hidden="true" />
                    回复提交后会通知用户。
                  </FieldDescription>
                </Field>
              ) : null}
              <DialogFooter>
                {detail.status === 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => setCloseTarget(detail)}
                  >
                    关闭工单
                  </Button>
                ) : null}
                <Button
                  variant={detail.status === 0 ? 'default' : 'outline'}
                  disabled={detail.status === 0 && !reply.trim()}
                  onClick={() =>
                    detail.status === 0
                      ? setReplyConfirmOpen(true)
                      : setDetail(null)
                  }
                >
                  {detail.status === 0 ? '确认回复' : '关闭'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={replyConfirmOpen}
        onOpenChange={setReplyConfirmOpen}
        title={`回复工单 #${detail?.id ?? ''}？`}
        description="回复会立即写入工单会话并通知用户。请确认内容不含内部凭据、Token 或其他不应发给用户的信息。"
        confirmLabel="发送回复"
        busy={acting}
        onConfirm={sendReply}
      />
      <ConfirmActionDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        title={`关闭工单 #${closeTarget?.id ?? ''}？`}
        description="关闭后用户不能继续在该工单中追问，且无法从此页面重新开启。"
        confirmLabel="确认关闭"
        destructive
        busy={acting}
        onConfirm={closeTicket}
      />
    </div>
  )
}

function TicketActions({
  ticket,
  disabled,
  onOpen,
  onClose,
}: {
  ticket: Ticket
  disabled: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const viewButton = (
    <Button variant="outline" size="sm" disabled={disabled} onClick={onOpen}>
      <MessageSquareReply data-icon="inline-start" aria-hidden="true" />
      查看
    </Button>
  )
  if (ticket.status !== 0) return viewButton
  return (
    <ButtonGroup className="ml-auto" aria-label={`工单 ${ticket.id} 操作`}>
      {viewButton}
      <Button
        variant="outline"
        size="icon-sm"
        disabled={disabled}
        aria-label={`关闭工单 ${ticket.id}`}
        onClick={onClose}
      >
        <XCircle aria-hidden="true" />
      </Button>
    </ButtonGroup>
  )
}

function formatLevel(value: number | string | null | undefined) {
  const levels: Record<string, string> = {
    '0': '低',
    '1': '中',
    '2': '高',
    low: '低',
    medium: '中',
    high: '高',
  }
  return levels[String(value ?? '1')] ?? String(value ?? '普通')
}
function formatDate(value: number | string | null | undefined) {
  if (!value) return '—'
  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', { hour12: false })
}
