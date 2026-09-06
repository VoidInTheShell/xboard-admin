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

type KnowledgeSummary = {
  id: number
  title: string
  category: string
  show: boolean | number
  updated_at?: number | string
}

type KnowledgeDetail = KnowledgeSummary & {
  language: string
  body: string
}

type KnowledgeForm = {
  id?: number
  category: string
  language: string
  title: string
  body: string
  show: boolean
}

const emptyForm: KnowledgeForm = {
  category: '使用帮助',
  language: 'zh-CN',
  title: '',
  body: '',
  show: true,
}

export function KnowledgePage() {
  const api = useAdminApi()
  const query = React.useCallback(
    async (signal: AbortSignal) => {
      const [items, categories] = await Promise.all([
        api.get<KnowledgeSummary[]>('knowledge/fetch', undefined, signal),
        api.get<string[]>('knowledge/getCategory', undefined, signal),
      ])
      return { items, categories }
    },
    [api],
  )
  const knowledge = useAdminQuery(query)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<KnowledgeForm>(emptyForm)
  const [formErrors, setFormErrors] = React.useState<Record<string, string[]>>(
    {},
  )
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<KnowledgeSummary | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  function openCreate() {
    setForm({
      ...emptyForm,
      category: knowledge.data?.categories[0] ?? emptyForm.category,
    })
    setFormErrors({})
    setFormOpen(true)
  }

  async function openEdit(item: KnowledgeSummary) {
    setFormErrors({})
    setLoadingDetail(true)
    setFormOpen(true)
    try {
      const detail = await api.get<KnowledgeDetail>('knowledge/fetch', {
        id: item.id,
      })
      setForm({
        id: detail.id,
        category: detail.category ?? '',
        language: detail.language ?? 'zh-CN',
        title: detail.title ?? '',
        body: detail.body ?? '',
        show: Boolean(detail.show),
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '知识详情读取失败。'))
      setFormOpen(false)
    } finally {
      setLoadingDetail(false)
    }
  }

  async function save() {
    setSaving(true)
    setFormErrors({})
    try {
      await api.post<boolean>('knowledge/save', {
        ...(form.id ? { id: form.id } : {}),
        category: form.category.trim(),
        language: form.language,
        title: form.title.trim(),
        body: form.body,
        show: form.show,
      })
      toast.success(form.id ? '知识文章已更新' : '知识文章已创建')
      setFormOpen(false)
      knowledge.reload()
    } catch (error) {
      if (error instanceof ApiError) setFormErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '知识文章保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleVisibility(item: KnowledgeSummary) {
    setPendingAction(item.id)
    try {
      await api.post<boolean>('knowledge/show', { id: item.id })
      toast.success(item.show ? '文章已隐藏' : '文章已展示')
      knowledge.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '文章状态更新失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function move(index: number, offset: -1 | 1) {
    const items = knowledge.data?.items
    if (!items) return
    const target = index + offset
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPendingAction(items[index].id)
    try {
      await api.post<boolean>('knowledge/sort', {
        ids: next.map((item) => item.id),
      })
      toast.success('知识文章顺序已更新')
      knowledge.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '知识文章排序失败。'))
    } finally {
      setPendingAction(null)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.post<boolean>('knowledge/drop', { id: deleteTarget.id })
      toast.success('知识文章已删除')
      setDeleteTarget(null)
      knowledge.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '知识文章删除失败。'))
    } finally {
      setDeleting(false)
    }
  }

  async function saveKnowledgeVisibility(
    item: KnowledgeSummary,
    show: boolean,
  ) {
    const detail = await api.get<KnowledgeDetail>('knowledge/fetch', {
      id: item.id,
    })
    return api.post<boolean>('knowledge/save', {
      id: detail.id,
      category: detail.category,
      language: detail.language,
      title: detail.title,
      body: detail.body,
      show,
    })
  }

  const items = knowledge.data?.items ?? []
  const categories = knowledge.data?.categories ?? []
  const selection = useListSelection(items)

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="知识库"
        description="按分类和语言维护用户帮助内容；正文在编辑器中修改，列表展示标题、分类和状态。"
        action={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新增文章
          </Button>
        }
      />
      {knowledge.error ? (
        <ResourceError
          title="知识库读取失败"
          message={knowledge.error}
          onRetry={knowledge.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <SelectionSummary
            selected={selection.count}
            total={items.length}
            onClear={selection.clear}
          />
          <BulkActions
            selected={selection.selectedRows}
            getLabel={(item) => item.title}
            disabled={knowledge.loading || knowledge.refreshing}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              knowledge.reload()
            }}
            actions={[
              {
                id: 'show',
                label: '显示所选文章',
                description: '在用户端展示所选文章。',
                icon: Eye,
                run: (item) => saveKnowledgeVisibility(item, true),
              },
              {
                id: 'hide',
                label: '隐藏所选文章',
                description: '在用户端隐藏所选文章，内容仍会保留。',
                icon: EyeOff,
                run: (item) => saveKnowledgeVisibility(item, false),
              },
              {
                id: 'delete',
                label: '删除所选文章',
                description: '删除所选文章，用户端将不再提供。',
                destructive: true,
                icon: Trash2,
                run: (item) =>
                  api.post<boolean>('knowledge/drop', { id: item.id }),
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
                    aria-label="选择当前文章"
                    checked={selection.checked}
                    disabled={
                      bulkBusy ||
                      knowledge.loading ||
                      knowledge.refreshing ||
                      !items.length
                    }
                    onCheckedChange={(checked) =>
                      selection.toggleAll(checked === true)
                    }
                  />
                </TableHead>
                <TableHead>标题</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-28">顺序</TableHead>
                <TableHead className="w-36 text-right">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledge.loading ? (
                <ResourceTableLoading columns={7} />
              ) : (
                items.map((item, index) => (
                  <TableRow
                    key={item.id}
                    data-state={
                      selection.selectedIds.has(item.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`选择文章 ${item.title}`}
                        checked={selection.selectedIds.has(item.id)}
                        disabled={bulkBusy || knowledge.refreshing}
                        onCheckedChange={(checked) =>
                          selection.toggle(item.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      <span className="font-data text-[11px] text-muted-foreground">
                        ID {item.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {item.category || '未分类'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={item.show ? '展示' : '隐藏'}
                        tone={item.show ? 'success' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell className="font-data text-xs text-muted-foreground">
                      {formatTime(item.updated_at)}
                    </TableCell>
                    <TableCell>
                      <ButtonGroup>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`上移 ${item.title}`}
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
                          aria-label={`下移 ${item.title}`}
                          disabled={
                            bulkBusy ||
                            pendingAction !== null ||
                            index === items.length - 1
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
                        aria-label={`${item.title} 操作`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={bulkBusy || pendingAction === item.id}
                          onClick={() => void openEdit(item)}
                        >
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`${item.title} 更多操作`}
                              disabled={bulkBusy || pendingAction === item.id}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => void toggleVisibility(item)}
                              >
                                {item.show ? (
                                  <EyeOff aria-hidden="true" />
                                ) : (
                                  <Eye aria-hidden="true" />
                                )}
                                {item.show ? '隐藏' : '展示'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleteTarget(item)}
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
        {!knowledge.loading && !items.length ? (
          <ResourceEmpty
            title="还没有知识文章"
            description="创建常见问题、客户端教程或服务说明，并按用户阅读顺序排列。"
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                新增文章
              </Button>
            }
          />
        ) : null}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          共 {items.length} 篇文章 · {categories.length} 个分类
        </div>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => !saving && !loadingDetail && setFormOpen(next)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? '编辑知识文章' : '新增知识文章'}
            </DialogTitle>
            <DialogDescription>
              分类可以复用现有值或直接创建新分类；语言代码使用五字符格式。
            </DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
              <LoaderCircle
                className="mr-2 inline size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              正在读取文章详情
            </div>
          ) : (
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(formErrors.category)}>
                  <FieldLabel htmlFor="knowledge-category">
                    分类
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    id="knowledge-category"
                    list="knowledge-categories"
                    value={form.category}
                    aria-invalid={Boolean(formErrors.category)}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                  />
                  <datalist id="knowledge-categories">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                  <FieldError
                    errors={formErrors.category?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={Boolean(formErrors.language)}>
                  <FieldLabel htmlFor="knowledge-language">
                    语言
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Select
                    value={form.language}
                    onValueChange={(language) => setForm({ ...form, language })}
                  >
                    <SelectTrigger
                      id="knowledge-language"
                      className="w-full"
                      aria-invalid={Boolean(formErrors.language)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="zh-CN">简体中文（zh-CN）</SelectItem>
                        <SelectItem value="en-US">English（en-US）</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError
                    errors={formErrors.language?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>
              <Field data-invalid={Boolean(formErrors.title)}>
                <FieldLabel htmlFor="knowledge-title">
                  标题
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Input
                  id="knowledge-title"
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
              <Field data-invalid={Boolean(formErrors.body)}>
                <FieldLabel htmlFor="knowledge-body">
                  正文
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Textarea
                  id="knowledge-body"
                  rows={16}
                  value={form.body}
                  aria-invalid={Boolean(formErrors.body)}
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                />
                <FieldDescription>
                  保留正文格式，用户端会按当前页面样式展示。
                </FieldDescription>
                <FieldError
                  errors={formErrors.body?.map((message) => ({ message }))}
                />
              </Field>
              <Field orientation="horizontal">
                <span>
                  <FieldLabel htmlFor="knowledge-show">用户端展示</FieldLabel>
                  <FieldDescription>
                    关闭后保留文章但不向用户显示。
                  </FieldDescription>
                </span>
                <Switch
                  id="knowledge-show"
                  checked={form.show}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, show: checked })
                  }
                />
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving || loadingDetail}
              onClick={() => setFormOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                saving ||
                loadingDetail ||
                !form.category.trim() ||
                !form.title.trim() ||
                !form.body.trim()
              }
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? '保存中' : '保存文章'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`删除文章“${deleteTarget?.title ?? ''}”？`}
        description="文章正文和用户端入口会同时删除，管理端无法撤销。"
        confirmLabel="删除文章"
        destructive
        busy={deleting}
        onConfirm={remove}
      />
    </div>
  )
}

function formatTime(value: KnowledgeSummary['updated_at']) {
  if (!value) return '—'
  const date = new Date(typeof value === 'number' ? value * 1000 : value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
