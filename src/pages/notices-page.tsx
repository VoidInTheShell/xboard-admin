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

type Notice = {
  id: number
  title: string
  content: string
  img_url?: string | null
  tags?: string[] | null
  show: boolean | number
  popup: boolean | number
  sort?: number
  updated_at?: number | string
}

type NoticeForm = {
  id?: number
  title: string
  content: string
  imgUrl: string
  tags: string
  show: boolean
  popup: boolean
}

const emptyForm: NoticeForm = {
  title: '',
  content: '',
  imgUrl: '',
  tags: '',
  show: true,
  popup: false,
}

export function NoticesPage() {
  const api = useAdminApi()
  const query = React.useCallback(
    (signal: AbortSignal) =>
      api.get<Notice[]>('notice/fetch', undefined, signal),
    [api],
  )
  const notices = useAdminQuery(query)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<NoticeForm>(emptyForm)
  const [formErrors, setFormErrors] = React.useState<Record<string, string[]>>(
    {},
  )
  const [saving, setSaving] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Notice | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  function openCreate() {
    setForm(emptyForm)
    setFormErrors({})
    setFormOpen(true)
  }

  function openEdit(notice: Notice) {
    setForm({
      id: notice.id,
      title: notice.title ?? '',
      content: notice.content ?? '',
      imgUrl: notice.img_url ?? '',
      tags: (notice.tags ?? []).join(', '),
      show: Boolean(notice.show),
      popup: Boolean(notice.popup),
    })
    setFormErrors({})
    setFormOpen(true)
  }

  async function save() {
    setSaving(true)
    setFormErrors({})
    try {
      await api.post<boolean>('notice/save', {
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        content: form.content,
        img_url: form.imgUrl.trim() || null,
        tags: splitTags(form.tags),
        show: form.show,
        popup: form.popup,
      })
      toast.success(form.id ? '公告已更新' : '公告已创建')
      setFormOpen(false)
      notices.reload()
    } catch (error) {
      if (error instanceof ApiError) setFormErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '公告保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleVisibility(notice: Notice) {
    setPendingAction(notice.id)
    try {
      await api.post<boolean>('notice/show', { id: notice.id })
      toast.success(notice.show ? '公告已隐藏' : '公告已展示')
      notices.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '公告状态更新失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function move(index: number, offset: -1 | 1) {
    if (!notices.data) return
    const target = index + offset
    if (target < 0 || target >= notices.data.length) return
    const next = [...notices.data]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPendingAction(next[target].id)
    try {
      await api.post<boolean>('notice/sort', {
        ids: next.map((notice) => notice.id),
      })
      toast.success('公告顺序已更新')
      notices.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '公告排序失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.post<boolean>('notice/drop', { id: deleteTarget.id })
      toast.success('公告已删除')
      setDeleteTarget(null)
      notices.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '公告删除失败。'))
    } finally {
      setDeleting(false)
    }
  }

  async function saveNoticeVisibility(item: Notice, show: boolean) {
    const latest = (await api.get<Notice[]>('notice/fetch')).find(
      (notice) => notice.id === item.id,
    )
    if (!latest) throw new Error('公告不存在')
    return api.post<boolean>('notice/save', {
      id: latest.id,
      title: latest.title,
      content: latest.content,
      img_url: latest.img_url ?? null,
      tags: latest.tags ?? [],
      show,
      popup: Boolean(latest.popup),
    })
  }

  const rows = notices.data ?? []
  const selection = useListSelection(rows)

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="公告管理"
        description="维护用户端公告、弹窗提示和展示顺序；内容按文本安全预览，不直接执行公告 HTML。"
        action={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增公告
          </Button>
        }
      />
      {notices.error ? (
        <ResourceError
          title="公告读取失败"
          message={notices.error}
          onRetry={notices.reload}
        />
      ) : null}

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <SelectionSummary
            selected={selection.count}
            total={rows.length}
            onClear={selection.clear}
          />
          <BulkActions
            selected={selection.selectedRows}
            getLabel={(item) => item.title}
            disabled={notices.loading || notices.refreshing}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              notices.reload()
            }}
            actions={[
              {
                id: 'show',
                label: '显示所选公告',
                description: '在用户端展示所选公告。',
                icon: Eye,
                run: (item) => saveNoticeVisibility(item, true),
              },
              {
                id: 'hide',
                label: '隐藏所选公告',
                description: '在用户端隐藏所选公告，内容仍会保留。',
                icon: EyeOff,
                run: (item) => saveNoticeVisibility(item, false),
              },
              {
                id: 'delete',
                label: '删除所选公告',
                description: '删除所选公告，用户端将不再显示。',
                destructive: true,
                icon: Trash2,
                run: (item) =>
                  api.post<boolean>('notice/drop', { id: item.id }),
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
                    aria-label="选择当前公告"
                    checked={selection.checked}
                    disabled={
                      bulkBusy ||
                      notices.loading ||
                      notices.refreshing ||
                      !rows.length
                    }
                    onCheckedChange={(checked) =>
                      selection.toggleAll(checked === true)
                    }
                  />
                </TableHead>
                <TableHead>公告</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>展示</TableHead>
                <TableHead>弹窗</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-28">顺序</TableHead>
                <TableHead className="w-36 text-right">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notices.loading ? (
                <ResourceTableLoading columns={8} />
              ) : (
                rows.map((notice, index) => (
                  <TableRow
                    key={notice.id}
                    data-state={
                      selection.selectedIds.has(notice.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`选择公告 ${notice.title}`}
                        checked={selection.selectedIds.has(notice.id)}
                        disabled={bulkBusy || notices.refreshing}
                        onCheckedChange={(checked) =>
                          selection.toggle(notice.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-xl">
                      <div className="font-medium">{notice.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {plainText(notice.content) || '无正文'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {notice.tags?.length ? (
                          notice.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            无标签
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={notice.show ? '展示' : '隐藏'}
                        tone={notice.show ? 'success' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={notice.popup ? '弹窗' : '普通'}
                        tone={notice.popup ? 'warning' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell className="font-data text-xs text-muted-foreground">
                      {formatTime(notice.updated_at)}
                    </TableCell>
                    <TableCell>
                      <ButtonGroup>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`上移 ${notice.title}`}
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
                          aria-label={`下移 ${notice.title}`}
                          disabled={
                            bulkBusy ||
                            pendingAction !== null ||
                            index === rows.length - 1
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
                        aria-label={`${notice.title} 操作`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={bulkBusy || pendingAction === notice.id}
                          onClick={() => openEdit(notice)}
                        >
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`${notice.title} 更多操作`}
                              disabled={bulkBusy || pendingAction === notice.id}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => void toggleVisibility(notice)}
                              >
                                {notice.show ? (
                                  <EyeOff aria-hidden="true" />
                                ) : (
                                  <Eye aria-hidden="true" />
                                )}
                                {notice.show ? '隐藏' : '展示'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleteTarget(notice)}
                              >
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
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
        {!notices.loading && !rows.length ? (
          <ResourceEmpty
            title="还没有公告"
            description="创建后可决定是否展示、是否弹窗，并随时调整顺序。"
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                新增公告
              </Button>
            }
          />
        ) : null}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          共 {rows.length} 条公告 · 可在此调整展示状态与顺序
        </div>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => !saving && setFormOpen(next)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑公告' : '新增公告'}</DialogTitle>
            <DialogDescription>
              公告正文可以保存富文本标记，但列表中只做安全的纯文本摘要。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(formErrors.title)}>
              <FieldLabel htmlFor="notice-title">
                标题
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Input
                id="notice-title"
                value={form.title}
                aria-invalid={Boolean(formErrors.title)}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
              <FieldError
                errors={formErrors.title?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={Boolean(formErrors.content)}>
              <FieldLabel htmlFor="notice-content">
                正文
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Textarea
                id="notice-content"
                rows={10}
                value={form.content}
                aria-invalid={Boolean(formErrors.content)}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
              />
              <FieldDescription>
                支持文本或 HTML 内容；请勿粘贴不可信脚本。
              </FieldDescription>
              <FieldError
                errors={formErrors.content?.map((message) => ({ message }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(formErrors.img_url)}>
                <FieldLabel htmlFor="notice-image">图片 URL</FieldLabel>
                <Input
                  id="notice-image"
                  type="url"
                  value={form.imgUrl}
                  aria-invalid={Boolean(formErrors.img_url)}
                  onChange={(event) =>
                    setForm({ ...form, imgUrl: event.target.value })
                  }
                />
                <FieldError
                  errors={formErrors.img_url?.map((message) => ({ message }))}
                />
              </Field>
              <Field data-invalid={Boolean(formErrors.tags)}>
                <FieldLabel htmlFor="notice-tags">标签</FieldLabel>
                <Input
                  id="notice-tags"
                  value={form.tags}
                  placeholder="维护, 升级"
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field orientation="horizontal">
                <span>
                  <FieldLabel htmlFor="notice-show">用户端展示</FieldLabel>
                  <FieldDescription>
                    关闭后用户端不再显示此公告。
                  </FieldDescription>
                </span>
                <Switch
                  id="notice-show"
                  checked={form.show}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, show: checked })
                  }
                />
              </Field>
              <Field orientation="horizontal">
                <span>
                  <FieldLabel htmlFor="notice-popup">登录后弹窗</FieldLabel>
                  <FieldDescription>
                    开启后以弹窗方式提醒用户。
                  </FieldDescription>
                </span>
                <Switch
                  id="notice-popup"
                  checked={form.popup}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, popup: checked })
                  }
                />
              </Field>
            </div>
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
              disabled={saving || !form.title.trim() || !form.content.trim()}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? '保存中' : '保存公告'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`删除公告“${deleteTarget?.title ?? ''}”？`}
        description="删除后用户端将无法再读取该公告，操作不能在管理端撤销。"
        confirmLabel="删除公告"
        destructive
        busy={deleting}
        onConfirm={remove}
      />
    </div>
  )
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

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatTime(value: Notice['updated_at']) {
  if (!value) return '—'
  const date = new Date(typeof value === 'number' ? value * 1000 : value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
