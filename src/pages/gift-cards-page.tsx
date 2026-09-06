import * as React from 'react'
import {
  CircleCheckBig,
  Download,
  Gift,
  History,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  TicketCheck,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { useListSelection } from '@/hooks/use-list-selection'
import { ApiError } from '@/lib/api'
import { useAdminApi } from '@/lib/auth'

type Paginator<T> = {
  data: T[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}
type JsonMap = Record<string, unknown>
type Template = {
  id: number
  name: string
  description?: string | null
  type: number
  type_name?: string
  status: boolean | number
  conditions?: JsonMap | null
  rewards: JsonMap
  limits?: JsonMap | null
  special_config?: JsonMap | null
  icon?: string | null
  background_image?: string | null
  theme_color?: string | null
  sort?: number
  codes_count?: number
  used_count?: number
  created_at?: number | string
}
type Code = {
  id: number
  template_id: number
  template_name?: string
  template?: Template | null
  code: string
  batch_id?: string | null
  status: number
  status_name?: string
  user_id?: number | null
  user_email?: string | null
  user?: { email?: string } | null
  used_at?: number | string | null
  expires_at?: number | string | null
  usage_count?: number
  max_usage?: number
  created_at?: number | string
}
type Usage = {
  id: number
  code?: string
  code_id?: number
  code_relation?: { code?: string } | null
  template_name?: string
  template?: Template | null
  user_email?: string
  user?: { email?: string } | null
  invite_user_email?: string | null
  invite_user?: { email?: string } | null
  rewards_given?: JsonMap | null
  invite_rewards?: JsonMap | null
  multiplier_applied?: number | null
  created_at?: number | string
}
type Statistics = {
  total_stats: {
    templates_count: number
    active_templates_count: number
    codes_count: number
    used_codes_count: number
    usages_count: number
  }
  daily_usages: Array<{ date: string; count: number }>
  type_stats: Array<{ template_name: string; type_name: string; count: number }>
}
type TemplateForm = {
  id?: number
  name: string
  description: string
  type: string
  status: boolean
  conditions: string
  rewards: string
  limits: string
  specialConfig: string
  icon: string
  backgroundImage: string
  themeColor: string
  sort: number | ''
}
type GenerateForm = {
  templateId: string
  count: number | ''
  prefix: string
  expiresHours: number | ''
  maxUsage: number | ''
}
type CodeForm = {
  id: number
  expiresAt: string
  maxUsage: number | ''
  status: string
}
type ConfirmTarget =
  | { kind: 'template-delete'; template: Template }
  | { kind: 'code-toggle' | 'code-delete' | 'code-export'; code: Code }
  | null

const codeStates: Record<
  number,
  { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'warning' }
> = {
  0: { label: '未使用', tone: 'success' },
  1: { label: '已使用', tone: 'info' },
  2: { label: '已过期', tone: 'neutral' },
  3: { label: '已禁用', tone: 'danger' },
}

const ConfigEditor = React.lazy(() =>
  import('@/components/ui/config-editor').then((module) => ({
    default: module.ConfigEditor,
  })),
)

export function GiftCardsPage() {
  const api = useAdminApi()
  const [tab, setTab] = React.useState('templates')
  const [templatePage, setTemplatePage] = React.useState(1)
  const [codePage, setCodePage] = React.useState(1)
  const [usagePage, setUsagePage] = React.useState(1)
  const [templateForm, setTemplateForm] = React.useState<TemplateForm | null>(
    null,
  )
  const [templateErrors, setTemplateErrors] = React.useState<
    Record<string, string[]>
  >({})
  const [generateForm, setGenerateForm] = React.useState<GenerateForm | null>(
    null,
  )
  const [codeForm, setCodeForm] = React.useState<CodeForm | null>(null)
  const [confirmTarget, setConfirmTarget] = React.useState<ConfirmTarget>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(
    async (signal: AbortSignal) => {
      const [templates, codes, usages, statistics, types] = await Promise.all([
        api.get<Paginator<Template>>(
          'gift-card/templates',
          { page: templatePage, per_page: 20 },
          signal,
        ),
        api.get<Paginator<Code>>(
          'gift-card/codes',
          { page: codePage, per_page: 20 },
          signal,
        ),
        api.get<Paginator<Usage>>(
          'gift-card/usages',
          { page: usagePage, per_page: 20 },
          signal,
        ),
        api.get<Statistics>('gift-card/statistics', undefined, signal),
        api.get<Record<string, string>>('gift-card/types', undefined, signal),
      ])
      return { templates, codes, usages, statistics, types }
    },
    [api, codePage, templatePage, usagePage],
  )
  const query = useAdminQuery(load)
  const templates = query.data?.templates.data ?? []
  const codes = query.data?.codes.data ?? []
  const usages = query.data?.usages.data ?? []
  const types = query.data?.types ?? {
    '1': '通用礼品卡',
    '2': '套餐礼品卡',
    '3': '盲盒礼品卡',
  }
  const stats = query.data?.statistics.total_stats
  const activeTemplates = templates.filter((template) =>
    Boolean(template.status),
  )
  const templateSelection = useListSelection(
    templates,
    `gift-templates:${templatePage}`,
  )
  const codeSelection = useListSelection(codes, `gift-codes:${codePage}`)
  const [templateBulkBusy, setTemplateBulkBusy] = React.useState(false)
  const [codeBulkBusy, setCodeBulkBusy] = React.useState(false)
  const pageBusy = saving || templateBulkBusy || codeBulkBusy

  const templateBulkActions = [
    {
      id: 'delete',
      label: '批量删除模板',
      description: '永久删除所选模板。仍有关联兑换码的模板会保留。',
      icon: Trash2,
      destructive: true,
      run: (template: Template) =>
        api.post<unknown>('gift-card/delete-template', { id: template.id }),
    },
    {
      id: 'enable',
      label: '批量启用模板',
      description: '启用所选礼品卡模板；启用后可生成和兑换新码。',
      icon: Power,
      run: (template: Template) =>
        api.post<Template>('gift-card/update-template', {
          id: template.id,
          status: true,
        }),
    },
    {
      id: 'disable',
      label: '批量停用模板',
      description: '停用所选礼品卡模板；已发出的兑换码和历史记录不会被删除。',
      icon: PowerOff,
      run: (template: Template) =>
        api.post<Template>('gift-card/update-template', {
          id: template.id,
          status: false,
        }),
    },
  ] as const
  const codeBulkActions = [
    {
      id: 'enable',
      label: '批量启用兑换码',
      description: '启用所选已禁用兑换码；启用后仍需符合有效期和使用次数限制。',
      icon: Power,
      run: async (code: Code) => {
        if (code.status !== 3) throw new Error('只有已禁用的兑换码可以启用。')
        return api.post<unknown>('gift-card/toggle-code', {
          id: code.id,
          action: 'enable',
        })
      },
    },
    {
      id: 'disable',
      label: '批量停用兑换码',
      description: '停用所选未使用兑换码；使用记录会保留。',
      icon: PowerOff,
      run: async (code: Code) => {
        if (code.status !== 0) throw new Error('只有未使用的兑换码可以停用。')
        return api.post<unknown>('gift-card/toggle-code', {
          id: code.id,
          action: 'disable',
        })
      },
    },
    {
      id: 'delete',
      label: '批量删除兑换码',
      description:
        '顺序删除所选未使用兑换码；已使用或有使用记录的项目会保留并报告失败。',
      icon: Trash2,
      destructive: true,
      run: async (code: Code) => {
        if (code.status === 1 || (code.usage_count ?? 0) > 0)
          throw new Error('已使用或已有使用记录的兑换码不能删除。')
        return api.post<unknown>('gift-card/delete-code', { id: code.id })
      },
    },
  ] as const

  function openTemplate(template?: Template) {
    setTemplateErrors({})
    setTemplateForm(
      template
        ? {
            id: template.id,
            name: template.name,
            description: template.description ?? '',
            type: String(template.type),
            status: Boolean(template.status),
            conditions: formatJson(template.conditions),
            rewards: formatJson(template.rewards),
            limits: formatJson(template.limits),
            specialConfig: formatJson(template.special_config),
            icon: template.icon ?? '',
            backgroundImage: template.background_image ?? '',
            themeColor: template.theme_color ?? '#171717',
            sort: template.sort ?? 0,
          }
        : {
            name: '',
            description: '',
            type: '1',
            status: true,
            conditions: '{}',
            rewards: '{\n  "balance": 0\n}',
            limits: '{}',
            specialConfig: '{}',
            icon: '',
            backgroundImage: '',
            themeColor: '#171717',
            sort: 0,
          },
    )
  }

  async function saveTemplate() {
    if (!templateForm) return
    const parsed = parseTemplateJson(templateForm)
    if (!parsed.ok) {
      setTemplateErrors(parsed.errors)
      return
    }
    setSaving(true)
    setTemplateErrors({})
    try {
      const payload = {
        ...(templateForm.id ? { id: templateForm.id } : {}),
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
        type: Number(templateForm.type),
        status: templateForm.status,
        ...parsed.value,
        icon: templateForm.icon.trim() || null,
        background_image: templateForm.backgroundImage.trim() || null,
        theme_color: templateForm.themeColor || '#171717',
        sort: Number(templateForm.sort || 0),
      }
      await api.post<Template>(
        templateForm.id
          ? 'gift-card/update-template'
          : 'gift-card/create-template',
        payload,
      )
      toast.success(templateForm.id ? '礼品卡模板已更新' : '礼品卡模板已创建')
      setTemplateForm(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setTemplateErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, '礼品卡模板保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleTemplate(template: Template) {
    setSaving(true)
    try {
      await api.post<Template>('gift-card/update-template', {
        id: template.id,
        status: !template.status,
      })
      toast.success(template.status ? '模板已禁用' : '模板已启用')
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '模板状态更新失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function generateCodes() {
    if (!generateForm) return
    setSaving(true)
    try {
      const file = await api.download('gift-card/generate-codes', {
        template_id: Number(generateForm.templateId),
        count: Number(generateForm.count),
        prefix: generateForm.prefix.trim().toUpperCase() || 'GC',
        expires_hours:
          generateForm.expiresHours === ''
            ? null
            : Number(generateForm.expiresHours),
        max_usage: Number(generateForm.maxUsage || 1),
        download_csv: true,
      })
      saveBlob(file.blob, file.filename)
      toast.success(
        `已生成 ${generateForm.count} 个兑换码，敏感码值已下载为 CSV`,
      )
      setGenerateForm(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '兑换码生成失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function saveCode() {
    if (!codeForm) return
    setSaving(true)
    try {
      await api.post<Code>('gift-card/update-code', {
        id: codeForm.id,
        expires_at: dateToEpoch(codeForm.expiresAt),
        max_usage: Number(codeForm.maxUsage),
        status: Number(codeForm.status),
      })
      toast.success('兑换码已更新')
      setCodeForm(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '兑换码保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function runConfirmedAction() {
    if (!confirmTarget) return
    setSaving(true)
    try {
      if (confirmTarget.kind === 'template-delete') {
        await api.post<boolean>('gift-card/delete-template', {
          id: confirmTarget.template.id,
        })
        toast.success('礼品卡模板已删除')
      } else if (confirmTarget.kind === 'code-toggle') {
        const enable = confirmTarget.code.status === 3
        await api.post<unknown>('gift-card/toggle-code', {
          id: confirmTarget.code.id,
          action: enable ? 'enable' : 'disable',
        })
        toast.success(enable ? '兑换码已启用' : '兑换码已禁用')
      } else if (confirmTarget.kind === 'code-delete') {
        await api.post<unknown>('gift-card/delete-code', {
          id: confirmTarget.code.id,
        })
        toast.success('兑换码已删除')
      } else {
        const batchId = confirmTarget.code.batch_id
        if (!batchId) throw new Error('该兑换码没有可导出的批次号。')
        const file = await api.download(
          `gift-card/export-codes?batch_id=${encodeURIComponent(batchId)}`,
          undefined,
          undefined,
          'GET',
        )
        saveBlob(file.blob, file.filename)
        toast.success('完整兑换码批次已下载')
      }
      setConfirmTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '礼品卡操作失败。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="礼品卡管理"
        description="模板定义奖励与使用条件；页面展示兑换码掩码，完整码值可在确认后下载。"
        action={
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={() =>
                setGenerateForm({
                  templateId: activeTemplates[0]
                    ? String(activeTemplates[0].id)
                    : 'none',
                  count: 1,
                  prefix: 'GC',
                  expiresHours: '',
                  maxUsage: 1,
                })
              }
              disabled={!activeTemplates.length}
            >
              <Gift data-icon="inline-start" aria-hidden="true" />
              生成兑换码
            </Button>
            {!query.loading && !activeTemplates.length ? (
              <span className="text-[11px] text-muted-foreground">
                请先创建并启用模板
              </span>
            ) : null}
          </div>
        }
      />
      {query.error ? (
        <ResourceError
          title="礼品卡读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      {stats ? (
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            {
              label: '模板',
              value: stats.templates_count,
              detail: '全部模板',
              icon: Layers3,
            },
            {
              label: '启用模板',
              value: stats.active_templates_count,
              detail: '当前可生成',
              icon: ShieldCheck,
            },
            {
              label: '兑换码',
              value: stats.codes_count,
              detail: '全量码数',
              icon: TicketCheck,
            },
            {
              label: '已使用兑换码',
              value: stats.used_codes_count,
              detail: '已产生兑换',
              icon: CircleCheckBig,
            },
            {
              label: '兑换记录',
              value: stats.usages_count,
              detail: '全量记录',
              icon: History,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <Card
              key={label}
              className="py-0 shadow-none last:col-span-2 xl:last:col-span-1"
            >
              <CardHeader className="gap-2 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <CardDescription>{label}</CardDescription>
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <CardTitle className="font-data text-xl sm:text-2xl">
                  {value}
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">
                  {detail}
                </span>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-1 text-xs text-muted-foreground sm:hidden">
          左右滑动切换礼品卡视图
        </div>
        <TabsList
          variant="line"
          className="mb-3 max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsTrigger value="templates">
            <Layers3 aria-hidden="true" />
            模板
          </TabsTrigger>
          <TabsTrigger value="codes">
            <TicketCheck aria-hidden="true" />
            兑换码
          </TabsTrigger>
          <TabsTrigger value="usages">
            <History aria-hidden="true" />
            使用记录
          </TabsTrigger>
          <TabsTrigger value="statistics">
            <CircleCheckBig aria-hidden="true" />
            统计
          </TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">奖励模板</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  配置兑换奖励和使用条件。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SelectionSummary
                  selected={templateSelection.count}
                  total={templates.length}
                  onClear={templateSelection.clear}
                />
                <BulkActions<Template>
                  selected={templateSelection.selectedRows}
                  actions={templateBulkActions}
                  getLabel={(template) =>
                    template.name + ' · 模板 #' + template.id
                  }
                  onComplete={(failedIds) => {
                    templateSelection.retain(failedIds)
                    query.reload()
                  }}
                  onBusyChange={setTemplateBulkBusy}
                  disabled={query.loading || query.refreshing || pageBusy}
                />
                <Button
                  size="sm"
                  disabled={pageBusy}
                  onClick={() => openTemplate()}
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  新增模板
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        aria-label="选择当前页全部礼品卡模板"
                        checked={templateSelection.checked}
                        disabled={query.loading || query.refreshing || pageBusy}
                        onCheckedChange={(checked) =>
                          templateSelection.toggleAll(checked === true)
                        }
                      />
                    </TableHead>
                    <TableHead>模板</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>奖励摘要</TableHead>
                    <TableHead>兑换码 / 使用</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">操作</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.loading ? (
                    <ResourceTableLoading columns={8} />
                  ) : (
                    templates.map((template) => (
                      <TableRow
                        key={template.id}
                        data-state={
                          templateSelection.selectedIds.has(template.id)
                            ? 'selected'
                            : undefined
                        }
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            aria-label={'选择模板 ' + template.name}
                            checked={templateSelection.selectedIds.has(
                              template.id,
                            )}
                            disabled={
                              query.loading || query.refreshing || pageBusy
                            }
                            onCheckedChange={(checked) =>
                              templateSelection.toggle(
                                template.id,
                                checked === true,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-sm pl-4">
                          <div className="font-medium">{template.name}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {template.description || '无描述'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {template.type_name ??
                              types[String(template.type)] ??
                              `类型 ${template.type}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {summarizeObject(template.rewards)}
                        </TableCell>
                        <TableCell className="font-data text-xs">
                          {template.codes_count ?? '—'} /{' '}
                          {template.used_count ?? '—'}
                        </TableCell>
                        <TableCell className="font-data">
                          {template.sort ?? 0}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={template.status ? '启用' : '禁用'}
                            tone={template.status ? 'success' : 'neutral'}
                          />
                        </TableCell>
                        <TableCell>
                          <ButtonGroup className="ml-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pageBusy}
                              onClick={() => openTemplate(template)}
                            >
                              编辑
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={pageBusy}
                                  aria-label={`${template.name} 操作`}
                                >
                                  <MoreHorizontal aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void toggleTemplate(template)
                                    }
                                  >
                                    {template.status ? '禁用模板' : '启用模板'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!template.status}
                                    onSelect={() =>
                                      setGenerateForm({
                                        templateId: String(template.id),
                                        count: 1,
                                        prefix: 'GC',
                                        expiresHours: '',
                                        maxUsage: 1,
                                      })
                                    }
                                  >
                                    生成兑换码
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    setConfirmTarget({
                                      kind: 'template-delete',
                                      template,
                                    })
                                  }
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
            {!query.loading && !templates.length ? (
              <ResourceEmpty
                title="还没有礼品卡模板"
                description="先创建模板并定义奖励与使用条件，启用后才能生成兑换码。"
                action={
                  <Button size="sm" onClick={() => openTemplate()}>
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    新增模板
                  </Button>
                }
              />
            ) : null}
            <ResourcePagination
              page={templatePage}
              disabled={pageBusy}
              loading={query.loading || query.refreshing}
              pageSize={query.data?.templates.per_page ?? 20}
              total={query.data?.templates.total ?? 0}
              onPageChange={setTemplatePage}
            />
          </Card>
        </TabsContent>
        <TabsContent value="codes">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">兑换码</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  启用、停用或删除当前页选中的兑换码。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SelectionSummary
                  selected={codeSelection.count}
                  total={codes.length}
                  onClear={codeSelection.clear}
                />
                <BulkActions<Code>
                  selected={codeSelection.selectedRows}
                  actions={codeBulkActions}
                  getLabel={(code) =>
                    '兑换码 #' + code.id + ' · ' + maskCode(code.code)
                  }
                  onComplete={(failedIds) => {
                    codeSelection.retain(failedIds)
                    query.reload()
                  }}
                  onBusyChange={setCodeBulkBusy}
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
                        aria-label="选择当前页全部兑换码"
                        checked={codeSelection.checked}
                        disabled={query.loading || query.refreshing || pageBusy}
                        onCheckedChange={(checked) =>
                          codeSelection.toggleAll(checked === true)
                        }
                      />
                    </TableHead>
                    <TableHead>兑换码</TableHead>
                    <TableHead>模板</TableHead>
                    <TableHead>批次</TableHead>
                    <TableHead>使用次数</TableHead>
                    <TableHead>到期时间</TableHead>
                    <TableHead>使用者</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">操作</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.loading ? (
                    <ResourceTableLoading columns={9} />
                  ) : (
                    codes.map((code) => {
                      const state = codeStates[code.status] ?? {
                        label: code.status_name ?? `状态 ${code.status}`,
                        tone: 'neutral' as const,
                      }
                      return (
                        <TableRow
                          key={code.id}
                          data-state={
                            codeSelection.selectedIds.has(code.id)
                              ? 'selected'
                              : undefined
                          }
                        >
                          <TableCell className="pl-4">
                            <Checkbox
                              aria-label={'选择兑换码 ' + code.id}
                              checked={codeSelection.selectedIds.has(code.id)}
                              disabled={
                                query.loading || query.refreshing || pageBusy
                              }
                              onCheckedChange={(checked) =>
                                codeSelection.toggle(code.id, checked === true)
                              }
                            />
                          </TableCell>
                          <TableCell className="pl-4 font-data text-xs">
                            {maskCode(code.code)}
                          </TableCell>
                          <TableCell>
                            {code.template_name ??
                              code.template?.name ??
                              `模板 #${code.template_id}`}
                          </TableCell>
                          <TableCell className="font-data text-xs">
                            {maskBatch(code.batch_id)}
                          </TableCell>
                          <TableCell className="font-data text-xs">
                            {code.usage_count ?? 0} / {code.max_usage ?? 1}
                          </TableCell>
                          <TableCell className="font-data text-xs">
                            {formatDate(code.expires_at, '长期有效')}
                          </TableCell>
                          <TableCell className="text-xs">
                            {maskEmail(code.user_email ?? code.user?.email)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={state.label}
                              tone={state.tone}
                            />
                          </TableCell>
                          <TableCell>
                            <ButtonGroup className="ml-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pageBusy}
                                onClick={() =>
                                  setCodeForm({
                                    id: code.id,
                                    expiresAt: dateLikeToLocal(code.expires_at),
                                    maxUsage: code.max_usage ?? 1,
                                    status: String(code.status),
                                  })
                                }
                              >
                                编辑
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    disabled={pageBusy}
                                    aria-label={`兑换码 ${code.id} 操作`}
                                  >
                                    <MoreHorizontal aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuGroup>
                                    <DropdownMenuItem
                                      disabled={
                                        code.status === 1 || code.status === 2
                                      }
                                      onSelect={() =>
                                        setConfirmTarget({
                                          kind: 'code-toggle',
                                          code,
                                        })
                                      }
                                    >
                                      {code.status === 3 ? '启用' : '禁用'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={!code.batch_id}
                                      onSelect={() =>
                                        setConfirmTarget({
                                          kind: 'code-export',
                                          code,
                                        })
                                      }
                                    >
                                      <Download aria-hidden="true" />
                                      导出完整批次
                                    </DropdownMenuItem>
                                  </DropdownMenuGroup>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={code.status === 1}
                                    onSelect={() =>
                                      setConfirmTarget({
                                        kind: 'code-delete',
                                        code,
                                      })
                                    }
                                  >
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </ButtonGroup>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {!query.loading && !codes.length ? (
              <ResourceEmpty
                title="还没有兑换码"
                description="从已启用模板生成兑换码；完整码值只在下载文件中交付。"
              />
            ) : null}
            <ResourcePagination
              page={codePage}
              disabled={pageBusy}
              loading={query.loading || query.refreshing}
              pageSize={query.data?.codes.per_page ?? 20}
              total={query.data?.codes.total ?? 0}
              onPageChange={setCodePage}
            />
          </Card>
        </TabsContent>
        <TabsContent value="usages">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">记录</TableHead>
                    <TableHead>模板</TableHead>
                    <TableHead>兑换码</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>邀请人</TableHead>
                    <TableHead>奖励摘要</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.loading ? (
                    <ResourceTableLoading columns={7} />
                  ) : (
                    usages.map((usage) => (
                      <TableRow key={usage.id}>
                        <TableCell className="pl-4 font-data text-xs">
                          #{usage.id}
                        </TableCell>
                        <TableCell>
                          {usage.template_name ?? usage.template?.name ?? '—'}
                        </TableCell>
                        <TableCell className="font-data text-xs">
                          {maskCode(
                            usage.code ?? usage.code_relation?.code ?? '',
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {maskEmail(usage.user_email ?? usage.user?.email)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {maskEmail(
                            usage.invite_user_email ?? usage.invite_user?.email,
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {summarizeObject(usage.rewards_given)}
                        </TableCell>
                        <TableCell className="font-data text-xs text-muted-foreground">
                          {formatDate(usage.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!query.loading && !usages.length ? (
              <ResourceEmpty
                title="还没有兑换记录"
                description="用户兑换礼品卡后，这里会显示用户与奖励摘要，敏感信息在页面中以掩码展示。"
              />
            ) : null}
            <ResourcePagination
              page={usagePage}
              disabled={pageBusy}
              loading={query.loading || query.refreshing}
              pageSize={query.data?.usages.per_page ?? 20}
              total={query.data?.usages.total ?? 0}
              onPageChange={setUsagePage}
            />
          </Card>
        </TabsContent>
        <TabsContent value="statistics">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>每日兑换</CardTitle>
                <CardDescription>最近 30 天的兑换趋势。</CardDescription>
              </CardHeader>
              <CardContent>
                {query.data?.statistics.daily_usages.length ? (
                  <div className="flex flex-col gap-2">
                    {query.data.statistics.daily_usages.map((item) => (
                      <div
                        key={item.date}
                        className="flex items-center justify-between rounded-xl border px-3 py-2"
                      >
                        <span className="font-data text-sm">{item.date}</span>
                        <Badge variant="secondary">{item.count} 次</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ResourceEmpty
                    title="暂无每日数据"
                    description="当前统计周期没有兑换记录。"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>模板类型分布</CardTitle>
                <CardDescription>按实际兑换记录聚合。</CardDescription>
              </CardHeader>
              <CardContent>
                {query.data?.statistics.type_stats.length ? (
                  <div className="flex flex-col gap-2">
                    {query.data.statistics.type_stats.map((item) => (
                      <div
                        key={`${item.template_name}-${item.type_name}`}
                        className="flex items-center justify-between rounded-xl border px-3 py-2"
                      >
                        <span>
                          <span className="text-sm">{item.template_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.type_name}
                          </span>
                        </span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ResourceEmpty
                    title="暂无类型数据"
                    description="模板产生兑换后会在这里聚合。"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <TemplateDialog
        form={templateForm}
        setForm={setTemplateForm}
        errors={templateErrors}
        types={types}
        saving={saving}
        onSave={saveTemplate}
      />
      <GenerateDialog
        form={generateForm}
        setForm={setGenerateForm}
        templates={activeTemplates}
        saving={saving}
        onSave={generateCodes}
      />
      <CodeDialog
        form={codeForm}
        setForm={setCodeForm}
        saving={saving}
        onSave={saveCode}
      />
      <ConfirmActionDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTitle(confirmTarget)}
        description={confirmDescription(confirmTarget)}
        confirmLabel={confirmLabel(confirmTarget)}
        destructive={
          confirmTarget?.kind === 'template-delete' ||
          confirmTarget?.kind === 'code-delete' ||
          (confirmTarget?.kind === 'code-toggle' &&
            confirmTarget.code.status !== 3)
        }
        busy={saving}
        onConfirm={runConfirmedAction}
      />
    </div>
  )
}

function TemplateDialog({
  form,
  setForm,
  errors,
  types,
  saving,
  onSave,
}: {
  form: TemplateForm | null
  setForm: React.Dispatch<React.SetStateAction<TemplateForm | null>>
  errors: Record<string, string[]>
  types: Record<string, string>
  saving: boolean
  onSave: () => void
}) {
  if (!form) return null
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {form.id ? '编辑礼品卡模板' : '新增礼品卡模板'}
          </DialogTitle>
          <DialogDescription>
            奖励与条件使用 JSON 配置。金额奖励 `balance` 使用分值整数，流量奖励
            `transfer_enable` 使用字节。
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>奖励配置会直接作用于用户资产</AlertTitle>
          <AlertDescription>
            通用卡可配置
            balance、transfer_enable、device_limit、expire_days、reset_package；套餐卡使用
            plan_id 与 plan_validity_days；盲盒可使用 random_rewards 与 weight。
          </AlertDescription>
        </Alert>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="gift-name"
              label="模板名称"
              value={form.name}
              errors={errors.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <Field>
              <FieldLabel htmlFor="gift-type">类型</FieldLabel>
              <Select
                value={form.type}
                onValueChange={(type) => setForm({ ...form, type })}
              >
                <SelectTrigger id="gift-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(types).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="gift-description">描述</FieldLabel>
            <Textarea
              id="gift-description"
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </Field>
          <JsonField
            id="gift-rewards"
            label="奖励 rewards（必填）"
            value={form.rewards}
            error={errors.rewards?.[0]}
            onChange={(rewards) => setForm({ ...form, rewards })}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <JsonField
              id="gift-conditions"
              label="使用条件 conditions"
              value={form.conditions}
              error={errors.conditions?.[0]}
              onChange={(conditions) => setForm({ ...form, conditions })}
            />
            <JsonField
              id="gift-limits"
              label="限制 limits"
              value={form.limits}
              error={errors.limits?.[0]}
              onChange={(limits) => setForm({ ...form, limits })}
            />
            <JsonField
              id="gift-special"
              label="特殊配置 special_config"
              value={form.specialConfig}
              error={errors.special_config?.[0]}
              onChange={(specialConfig) => setForm({ ...form, specialConfig })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              id="gift-icon"
              label="图标标识"
              value={form.icon}
              onChange={(icon) => setForm({ ...form, icon })}
            />
            <TextField
              id="gift-background"
              label="背景图 URL"
              value={form.backgroundImage}
              errors={errors.background_image}
              onChange={(backgroundImage) =>
                setForm({ ...form, backgroundImage })
              }
            />
            <Field>
              <FieldLabel htmlFor="gift-color">主题色</FieldLabel>
              <Input
                id="gift-color"
                type="color"
                className="h-10 w-full"
                value={form.themeColor}
                onChange={(event) =>
                  setForm({ ...form, themeColor: event.target.value })
                }
              />
            </Field>
            <NumberField
              id="gift-sort"
              label="排序"
              value={form.sort}
              min={0}
              onChange={(sort) => setForm({ ...form, sort })}
            />
          </div>
          <Field orientation="horizontal" className="rounded-2xl border p-4">
            <span>
              <FieldLabel htmlFor="gift-status">启用模板</FieldLabel>
              <FieldDescription>
                只有启用模板才能生成和兑换新码。
              </FieldDescription>
            </span>
            <Switch
              id="gift-status"
              checked={form.status}
              onCheckedChange={(status) => setForm({ ...form, status })}
            />
          </Field>
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
            disabled={saving || !form.name.trim() || !form.rewards.trim()}
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : null}
            {saving ? '保存中' : '保存模板'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GenerateDialog({
  form,
  setForm,
  templates,
  saving,
  onSave,
}: {
  form: GenerateForm | null
  setForm: React.Dispatch<React.SetStateAction<GenerateForm | null>>
  templates: Template[]
  saving: boolean
  onSave: () => void
}) {
  if (!form) return null
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>生成兑换码</DialogTitle>
          <DialogDescription>
            完整兑换码及奖励配置会下载为 CSV，列表中仅显示兑换码掩码。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gift-code-template">模板</FieldLabel>
            <Select
              value={form.templateId}
              onValueChange={(templateId) => setForm({ ...form, templateId })}
            >
              <SelectTrigger id="gift-code-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">请选择模板</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              id="gift-code-count"
              label="数量"
              value={form.count}
              min={1}
              max={10000}
              onChange={(count) => setForm({ ...form, count })}
            />
            <TextField
              id="gift-code-prefix"
              label="前缀"
              value={form.prefix}
              description="仅大写字母和数字，最长 10 位。"
              onChange={(prefix) =>
                setForm({
                  ...form,
                  prefix: prefix
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 10),
                })
              }
            />
            <NumberField
              id="gift-code-expire"
              label="有效小时"
              value={form.expiresHours}
              min={1}
              description="留空长期有效。"
              onChange={(expiresHours) => setForm({ ...form, expiresHours })}
            />
            <NumberField
              id="gift-code-max"
              label="最大使用次数"
              value={form.maxUsage}
              min={1}
              max={1000}
              onChange={(maxUsage) => setForm({ ...form, maxUsage })}
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
              form.templateId === 'none' ||
              Number(form.count) < 1 ||
              Number(form.count) > 10000 ||
              Number(form.maxUsage) < 1
            }
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : (
              <Download data-icon="inline-start" aria-hidden="true" />
            )}
            {saving ? '生成中' : '生成并下载 CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CodeDialog({
  form,
  setForm,
  saving,
  onSave,
}: {
  form: CodeForm | null
  setForm: React.Dispatch<React.SetStateAction<CodeForm | null>>
  saving: boolean
  onSave: () => void
}) {
  if (!form) return null
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑兑换码 #{form.id}</DialogTitle>
          <DialogDescription>
            不展示完整兑换码。直接改变已使用/过期状态可能与真实兑换记录冲突，请谨慎修改。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gift-code-expired-at">到期时间</FieldLabel>
            <Input
              id="gift-code-expired-at"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) =>
                setForm({ ...form, expiresAt: event.target.value })
              }
            />
            <FieldDescription>留空为长期有效。</FieldDescription>
          </Field>
          <NumberField
            id="gift-code-max-usage"
            label="最大使用次数"
            value={form.maxUsage}
            min={1}
            max={1000}
            onChange={(maxUsage) => setForm({ ...form, maxUsage })}
          />
          <Field>
            <FieldLabel htmlFor="gift-code-status">状态</FieldLabel>
            <Select
              value={form.status}
              onValueChange={(status) => setForm({ ...form, status })}
            >
              <SelectTrigger id="gift-code-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(codeStates).map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
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
            disabled={saving || Number(form.maxUsage) < 1}
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : null}
            {saving ? '保存中' : '保存兑换码'}
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
  min,
  max,
  description,
}: {
  id: string
  label: string
  value: number | ''
  onChange: (value: number | '') => void
  min?: number
  max?: number
  description?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step="1"
        onChange={(event) =>
          onChange(event.target.value === '' ? '' : Number(event.target.value))
        }
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
function JsonField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
      <React.Suspense
        fallback={
          <div
            className="h-52 animate-pulse rounded-2xl border bg-muted/40"
            aria-label={`正在加载${label}`}
          />
        }
      >
        <ConfigEditor
          label={label}
          language="json"
          rows={7}
          value={value}
          onChange={onChange}
        />
      </React.Suspense>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  )
}

function parseTemplateJson(form: TemplateForm):
  | {
      ok: true
      value: {
        conditions: JsonMap | null
        rewards: JsonMap
        limits: JsonMap | null
        special_config: JsonMap | null
      }
    }
  | { ok: false; errors: Record<string, string[]> } {
  const fields = [
    ['conditions', form.conditions],
    ['rewards', form.rewards],
    ['limits', form.limits],
    ['special_config', form.specialConfig],
  ] as const
  const parsed: Record<string, JsonMap | null> = {}
  const errors: Record<string, string[]> = {}
  for (const [key, text] of fields) {
    try {
      const value: unknown = JSON.parse(text || '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value))
        errors[key] = ['必须是 JSON 对象。']
      else
        parsed[key] = Object.keys(value as JsonMap).length
          ? (value as JsonMap)
          : null
    } catch {
      errors[key] = ['JSON 格式不正确。']
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      conditions: parsed.conditions,
      rewards: parsed.rewards ?? {},
      limits: parsed.limits,
      special_config: parsed.special_config,
    },
  }
}

function formatJson(value: JsonMap | null | undefined) {
  return JSON.stringify(value ?? {}, null, 2)
}
function summarizeObject(value: JsonMap | null | undefined) {
  const keys = Object.keys(value ?? {})
  return keys.length
    ? keys.slice(0, 3).join(' · ') +
        (keys.length > 3 ? ` +${keys.length - 3}` : '')
    : '未配置'
}
function maskCode(value: string) {
  if (!value) return '—'
  if (value.length <= 8) return `${value.slice(0, 2)}••••${value.slice(-2)}`
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`
}
function maskBatch(value: string | null | undefined) {
  if (!value) return '—'
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}
function maskEmail(value: string | null | undefined) {
  if (!value) return '—'
  const [local, domain] = value.split('@')
  return domain ? `${local.slice(0, 3)}***@***` : '***'
}
function formatDate(value: number | string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', { hour12: false })
}
function dateLikeToLocal(value: number | string | null | undefined) {
  if (!value) return ''
  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}
function dateToEpoch(value: string) {
  return value ? Math.floor(new Date(value).getTime() / 1000) : null
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
function confirmTitle(target: ConfirmTarget) {
  if (!target) return '确认礼品卡操作'
  if (target.kind === 'template-delete')
    return `删除模板“${target.template.name}”？`
  if (target.kind === 'code-export')
    return `导出批次 ${maskBatch(target.code.batch_id)} 的完整兑换码？`
  if (target.kind === 'code-delete') return `删除兑换码 #${target.code.id}？`
  return `${target.code.status === 3 ? '启用' : '禁用'}兑换码 #${target.code.id}？`
}
function confirmDescription(target: ConfirmTarget) {
  if (!target) return ''
  if (target.kind === 'template-delete')
    return '只有没有关联兑换码的模板才能删除；删除后不可恢复。'
  if (target.kind === 'code-export')
    return '下载文件包含可直接兑换的完整凭据。请仅保存到受控设备并通过安全渠道分发。'
  if (target.kind === 'code-delete')
    return '已使用或存在使用记录的兑换码不能删除；其他兑换码删除后不可恢复。'
  return target.code.status === 3
    ? '启用后，只要仍满足有效期和次数限制，兑换码会立即恢复可用。'
    : '禁用后兑换码立即不可用，但使用记录会保留。'
}
function confirmLabel(target: ConfirmTarget) {
  if (target?.kind === 'code-export') return '下载完整批次'
  if (target?.kind === 'template-delete' || target?.kind === 'code-delete')
    return '确认删除'
  return target?.kind === 'code-toggle' && target.code.status === 3
    ? '确认启用'
    : '确认禁用'
}
