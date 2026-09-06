import * as React from 'react'
import {
  Blocks,
  LoaderCircle,
  MoreHorizontal,
  Palette,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  ResourceEmpty,
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { StatusBadge } from '@/components/data/status-badge'
import { PageHeader } from '@/components/layout/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { useAdminApi } from '@/lib/auth'

type ThemeField = {
  label?: string
  placeholder?: string
  field_name: string
  field_type: string
  select_options?: Record<string, string>
  default_value?: unknown
}
type ThemeMeta = {
  name?: string
  description?: string
  version?: string
  images?: string
  configs?: ThemeField[]
  can_delete?: boolean
  is_system?: boolean
}
type ThemePayload = { themes: Record<string, ThemeMeta>; active?: string }
type PluginField = {
  type: string
  label?: string
  placeholder?: string
  description?: string
  value?: unknown
  options?: Record<string, string> | unknown[]
}
type Plugin = {
  code: string
  name: string
  version: string
  description?: string
  author?: string
  type: string
  is_installed: boolean
  is_enabled: boolean
  is_protected: boolean
  can_be_deleted: boolean
  config?: Record<string, PluginField>
  readme?: string
  need_upgrade?: boolean
  admin_menus?: unknown
  admin_crud?: unknown
}
type PluginPayload = { data: Plugin[] }
type ExtensionAction =
  | { target: 'theme'; action: 'switch' | 'delete'; name: string }
  | {
      target: 'plugin'
      action:
        'install' | 'uninstall' | 'enable' | 'disable' | 'upgrade' | 'delete'
      plugin: Plugin
    }
  | null
type UploadKind = 'theme' | 'plugin' | null
type ThemeConfigState = {
  name: string
  schema: ThemeField[]
  values: Record<string, unknown>
}
type PluginConfigState = {
  plugin: Plugin
  schema: Record<string, PluginField>
  values: Record<string, unknown>
  secrets: Record<string, unknown>
}

export function ExtensionsPage() {
  const api = useAdminApi()
  const [pluginType, setPluginType] = React.useState('all')
  const load = React.useCallback(
    async (signal: AbortSignal) => {
      const [themes, plugins] = await Promise.all([
        api.get<ThemePayload>('theme/getThemes', undefined, signal),
        api.get<PluginPayload>(
          'plugin/getPlugins',
          pluginType === 'all' ? undefined : { type: pluginType },
          signal,
        ),
      ])
      return { themes, plugins: plugins.data ?? [] }
    },
    [api, pluginType],
  )
  const query = useAdminQuery(load)
  const [pending, setPending] = React.useState<ExtensionAction>(null)
  const [uploadKind, setUploadKind] = React.useState<UploadKind>(null)
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [themeConfig, setThemeConfig] = React.useState<ThemeConfigState | null>(
    null,
  )
  const [pluginConfig, setPluginConfig] =
    React.useState<PluginConfigState | null>(null)
  const [loadingConfig, setLoadingConfig] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const themes = query.data?.themes.themes ?? {}
  const activeTheme = query.data?.themes.active ?? ''
  const plugins = query.data?.plugins ?? []

  async function runAction() {
    if (!pending) return
    setSaving(true)
    try {
      if (pending.target === 'theme') {
        if (pending.action === 'switch')
          await api.post<boolean>('config/save', {
            frontend_theme: pending.name,
          })
        else await api.post<boolean>('theme/delete', { name: pending.name })
        toast.success(
          pending.action === 'switch' ? '用户端主题设置已切换' : '主题包已删除',
        )
      } else {
        await api.post<unknown>(`plugin/${pending.action}`, {
          code: pending.plugin.code,
        })
        toast.success(pluginActionSuccess(pending.action))
      }
      setPending(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '扩展操作失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function uploadPackage() {
    if (!uploadKind || !uploadFile) return
    setSaving(true)
    const body = new FormData()
    body.set('file', uploadFile)
    try {
      await api.post<unknown>(`${uploadKind}/upload`, body)
      toast.success(uploadKind === 'theme' ? '主题包已上传' : '插件包已上传')
      setUploadKind(null)
      setUploadFile(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, 'ZIP 包上传失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function openThemeConfig(name: string, meta: ThemeMeta) {
    setLoadingConfig(true)
    try {
      const values = await api.post<Record<string, unknown>>(
        'theme/getThemeConfig',
        { name },
      )
      setThemeConfig({ name, schema: meta.configs ?? [], values: values ?? {} })
    } catch (error) {
      toast.error(getErrorMessage(error, '主题配置读取失败。'))
    } finally {
      setLoadingConfig(false)
    }
  }

  async function saveThemeConfig() {
    if (!themeConfig) return
    setSaving(true)
    try {
      await api.post<Record<string, unknown>>('theme/saveThemeConfig', {
        name: themeConfig.name,
        config: themeConfig.values,
      })
      toast.success('主题配置已保存')
      setThemeConfig(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '主题配置保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  async function openPluginConfig(plugin: Plugin) {
    setLoadingConfig(true)
    try {
      const response = await api.get<{ data: Record<string, PluginField> }>(
        'plugin/config',
        { code: plugin.code },
      )
      const schema = response.data ?? {}
      const values: Record<string, unknown> = {}
      const secrets: Record<string, unknown> = {}
      Object.entries(schema).forEach(([key, field]) => {
        if (isSensitivePluginField(key, field)) {
          secrets[key] = field.value
          values[key] = ''
        } else values[key] = field.value ?? ''
      })
      setPluginConfig({ plugin, schema, values, secrets })
    } catch (error) {
      toast.error(getErrorMessage(error, '插件配置读取失败。'))
    } finally {
      setLoadingConfig(false)
    }
  }

  async function savePluginConfig() {
    if (!pluginConfig) return
    setSaving(true)
    const config = Object.fromEntries(
      Object.entries(pluginConfig.schema).map(([key, field]) => [
        key,
        isSensitivePluginField(key, field) &&
        (pluginConfig.values[key] === '' ||
          pluginConfig.values[key] === undefined)
          ? (pluginConfig.secrets[key] ?? '')
          : pluginConfig.values[key],
      ]),
    )
    try {
      await api.post<unknown>('plugin/config', {
        code: pluginConfig.plugin.code,
        config,
      })
      toast.success('插件配置已保存')
      setPluginConfig(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '插件配置保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="扩展管理" description="管理用户端主题和功能插件。" />
      {query.error ? (
        <ResourceError
          title="扩展信息读取失败"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <Alert className="mb-4">
        <Blocks aria-hidden="true" />
        <AlertTitle>仅使用可信扩展</AlertTitle>
        <AlertDescription>
          安装或启用扩展可能执行代码并修改数据，请只上传来源可信、版本明确的扩展包。
        </AlertDescription>
      </Alert>
      <Tabs defaultValue="themes">
        <TabsList variant="line" className="mb-3">
          <TabsTrigger value="themes">
            <Palette aria-hidden="true" />
            主题
          </TabsTrigger>
          <TabsTrigger value="plugins">
            <Blocks aria-hidden="true" />
            插件
          </TabsTrigger>
        </TabsList>
        <TabsContent value="themes">
          <div className="mb-3 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setUploadFile(null)
                setUploadKind('theme')
              }}
            >
              <Upload data-icon="inline-start" aria-hidden="true" />
              上传主题 ZIP
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {query.loading
              ? Array.from({ length: 3 }, (_, index) => (
                  <Card
                    key={index}
                    className="h-56 animate-pulse bg-muted/40 shadow-none"
                  />
                ))
              : Object.entries(themes).map(([name, meta]) => (
                  <Card key={name} className="shadow-none">
                    <div className="flex h-full flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid size-10 place-items-center rounded-xl border bg-muted">
                          <Palette className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex gap-1">
                          {meta.is_system ? (
                            <Badge variant="secondary">系统</Badge>
                          ) : (
                            <Badge variant="outline">用户上传</Badge>
                          )}
                          {activeTheme === name ? (
                            <StatusBadge label="当前" tone="success" />
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold">{meta.name || name}</h3>
                        <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {meta.description || '无主题描述'}
                        </p>
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-data text-xs text-muted-foreground">
                          v{meta.version || '—'}
                        </span>
                        <ButtonGroup aria-label={`${meta.name || name} 操作`}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={loadingConfig}
                            onClick={() => void openThemeConfig(name, meta)}
                          >
                            配置
                          </Button>
                          {activeTheme !== name ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPending({
                                  target: 'theme',
                                  action: 'switch',
                                  name,
                                })
                              }
                            >
                              切换
                            </Button>
                          ) : null}
                          {meta.can_delete ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setPending({
                                  target: 'theme',
                                  action: 'delete',
                                  name,
                                })
                              }
                            >
                              删除
                            </Button>
                          ) : null}
                        </ButtonGroup>
                      </div>
                    </div>
                  </Card>
                ))}
          </div>
          {!query.loading && !Object.keys(themes).length ? (
            <Card className="shadow-none">
              <ResourceEmpty
                title="没有可用主题"
                description="上传主题包后可在此配置和切换。"
              />
            </Card>
          ) : null}
        </TabsContent>
        <TabsContent value="plugins">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={pluginType} onValueChange={setPluginType}>
              <SelectTrigger className="w-full sm:w-44" aria-label="插件类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部插件</SelectItem>
                  <SelectItem value="feature">功能插件</SelectItem>
                  <SelectItem value="payment">支付插件</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setUploadFile(null)
                setUploadKind('plugin')
              }}
            >
              <Upload data-icon="inline-start" aria-hidden="true" />
              上传插件 ZIP
            </Button>
          </div>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">插件</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>安装状态</TableHead>
                    <TableHead>运行状态</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">操作</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.loading ? (
                    <ResourceTableLoading columns={7} />
                  ) : (
                    plugins.map((plugin) => (
                      <TableRow key={plugin.code}>
                        <TableCell className="max-w-lg pl-4">
                          <div className="font-medium">{plugin.name}</div>
                          <div className="font-data text-[11px] text-muted-foreground">
                            {plugin.code}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {plugin.description || '无描述'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {plugin.type === 'payment' ? '支付' : '功能'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-data text-xs">
                            v{plugin.version}
                          </div>
                          {plugin.need_upgrade ? (
                            <Badge variant="secondary" className="mt-1">
                              可升级
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {plugin.author || '未知'}
                          {plugin.is_protected ? (
                            <div className="mt-1 text-muted-foreground">
                              核心保护
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={plugin.is_installed ? '已安装' : '未安装'}
                            tone={plugin.is_installed ? 'info' : 'neutral'}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={plugin.is_enabled ? '运行中' : '未启用'}
                            tone={plugin.is_enabled ? 'success' : 'neutral'}
                          />
                        </TableCell>
                        <TableCell>
                          <PluginMenu
                            plugin={plugin}
                            loading={loadingConfig}
                            onConfig={() => void openPluginConfig(plugin)}
                            onAction={(action) =>
                              setPending({ target: 'plugin', action, plugin })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!query.loading && !plugins.length ? (
              <ResourceEmpty
                title="没有匹配的插件"
                description="请调整类型筛选或上传插件包。"
              />
            ) : null}
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              共 {plugins.length} 个插件 · 核心插件不可删除
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(uploadKind)}
        onOpenChange={(open) => !saving && !open && setUploadKind(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              上传{uploadKind === 'theme' ? '主题' : '插件'} ZIP
            </DialogTitle>
            <DialogDescription>
              上传主题或插件安装包。同名主题仅支持升级版本；请只安装可信来源的插件。
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="extension-file">ZIP 文件</FieldLabel>
            <Input
              id="extension-file"
              type="file"
              accept="application/zip,.zip"
              onChange={(event) =>
                setUploadFile(event.target.files?.[0] ?? null)
              }
            />
            <FieldDescription>
              文件最大 10 MiB，请上传格式完整的安装包。
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setUploadKind(null)}
            >
              取消
            </Button>
            <Button
              disabled={
                saving || !uploadFile || uploadFile.size > 10 * 1024 * 1024
              }
              onClick={() => void uploadPackage()}
            >
              {saving ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : (
                <Upload data-icon="inline-start" aria-hidden="true" />
              )}
              {saving ? '上传中' : '确认上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ThemeConfigDialog
        state={themeConfig}
        setState={setThemeConfig}
        saving={saving}
        onSave={saveThemeConfig}
      />
      <PluginConfigDialog
        state={pluginConfig}
        setState={setPluginConfig}
        saving={saving}
        onSave={savePluginConfig}
      />
      <ConfirmActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={extensionActionTitle(pending)}
        description={extensionActionDescription(pending)}
        confirmLabel={extensionActionLabel(pending)}
        destructive={isDestructiveAction(pending)}
        busy={saving}
        onConfirm={runAction}
      />
    </div>
  )
}

function PluginMenu({
  plugin,
  loading,
  onConfig,
  onAction,
}: {
  plugin: Plugin
  loading: boolean
  onConfig: () => void
  onAction: (
    action:
      'install' | 'uninstall' | 'enable' | 'disable' | 'upgrade' | 'delete',
  ) => void
}) {
  return (
    <ButtonGroup className="ml-auto" aria-label={`${plugin.name} 操作`}>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => (plugin.is_installed ? onConfig() : onAction('install'))}
      >
        {plugin.is_installed ? '配置' : '安装'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`${plugin.name} 操作`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{plugin.name}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {plugin.is_installed && !plugin.is_enabled ? (
              <DropdownMenuItem onSelect={() => onAction('enable')}>
                启用
              </DropdownMenuItem>
            ) : null}
            {plugin.is_enabled ? (
              <DropdownMenuItem onSelect={() => onAction('disable')}>
                禁用
              </DropdownMenuItem>
            ) : null}
            {plugin.need_upgrade ? (
              <DropdownMenuItem onSelect={() => onAction('upgrade')}>
                升级到目录版本
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          {plugin.is_installed || plugin.can_be_deleted ? (
            <DropdownMenuSeparator />
          ) : null}
          <DropdownMenuGroup>
            {plugin.is_installed ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={plugin.is_enabled}
                onSelect={() => onAction('uninstall')}
              >
                卸载
              </DropdownMenuItem>
            ) : null}
            {!plugin.is_installed && plugin.can_be_deleted ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onAction('delete')}
              >
                删除插件文件
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

function ThemeConfigDialog({
  state,
  setState,
  saving,
  onSave,
}: {
  state: ThemeConfigState | null
  setState: React.Dispatch<React.SetStateAction<ThemeConfigState | null>>
  saving: boolean
  onSave: () => void
}) {
  if (!state) return null
  return (
    <Dialog open onOpenChange={(open) => !saving && !open && setState(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>配置主题 {state.name}</DialogTitle>
          <DialogDescription>
            字段由主题包 config.json 定义。自定义
            HTML/脚本会在用户端执行，请只填写已审计内容。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <FieldGroup>
            {state.schema.length ? (
              state.schema.map((field) => (
                <ThemeFieldControl
                  key={field.field_name}
                  field={field}
                  value={
                    state.values[field.field_name] ?? field.default_value ?? ''
                  }
                  onChange={(value) =>
                    setState({
                      ...state,
                      values: { ...state.values, [field.field_name]: value },
                    })
                  }
                />
              ))
            ) : (
              <ResourceEmpty
                title="该主题没有可配置字段"
                description="主题包未在 configs 中声明设置项。"
              />
            )}
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setState(null)}
          >
            取消
          </Button>
          <Button disabled={saving || !state.schema.length} onClick={onSave}>
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : null}
            {saving ? '保存中' : '保存主题配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ThemeFieldControl({
  field,
  value,
  onChange,
}: {
  field: ThemeField
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.field_type === 'select')
    return (
      <Field>
        <FieldLabel htmlFor={`theme-${field.field_name}`}>
          {field.label || field.field_name}
        </FieldLabel>
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={`theme-${field.field_name}`} className="w-full">
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.entries(field.select_options ?? {}).map(
                ([optionValue, label]) => (
                  <SelectItem key={optionValue} value={optionValue}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    )
  if (field.field_type === 'textarea')
    return (
      <Field>
        <FieldLabel htmlFor={`theme-${field.field_name}`}>
          {field.label || field.field_name}
        </FieldLabel>
        <Textarea
          id={`theme-${field.field_name}`}
          rows={8}
          className="font-data text-xs"
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldDescription>
          此字段可能包含 HTML/JS；保存前请完成安全审计。
        </FieldDescription>
      </Field>
    )
  return (
    <Field>
      <FieldLabel htmlFor={`theme-${field.field_name}`}>
        {field.label || field.field_name}
      </FieldLabel>
      <Input
        id={`theme-${field.field_name}`}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

function PluginConfigDialog({
  state,
  setState,
  saving,
  onSave,
}: {
  state: PluginConfigState | null
  setState: React.Dispatch<React.SetStateAction<PluginConfigState | null>>
  saving: boolean
  onSave: () => void
}) {
  if (!state) return null
  return (
    <Dialog open onOpenChange={(open) => !saving && !open && setState(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>配置插件 {state.plugin.name}</DialogTitle>
          <DialogDescription>
            密钥、令牌和密码不会回显；留空可保留已保存的值。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(state.schema).map(([key, field]) => (
                <PluginFieldControl
                  key={key}
                  fieldKey={key}
                  field={field}
                  value={state.values[key]}
                  onChange={(value) =>
                    setState({
                      ...state,
                      values: { ...state.values, [key]: value },
                    })
                  }
                />
              ))}
            </div>
            {!Object.keys(state.schema).length ? (
              <ResourceEmpty
                title="该插件没有可配置字段"
                description="可以直接管理安装和启用状态。"
              />
            ) : null}
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setState(null)}
          >
            取消
          </Button>
          <Button
            disabled={saving || !Object.keys(state.schema).length}
            onClick={onSave}
          >
            {saving ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : null}
            {saving ? '保存中' : '保存插件配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PluginFieldControl({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string
  field: PluginField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = `plugin-${fieldKey}`
  const sensitive = isSensitivePluginField(fieldKey, field)
  if (field.type === 'boolean')
    return (
      <Field
        orientation="horizontal"
        className="rounded-2xl border p-4 sm:col-span-2"
      >
        <span>
          <FieldLabel htmlFor={id}>{field.label || fieldKey}</FieldLabel>
          {field.description ? (
            <FieldDescription>{field.description}</FieldDescription>
          ) : null}
        </span>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </Field>
    )
  const options = Array.isArray(field.options)
    ? field.options.map((item) =>
        typeof item === 'object' && item !== null
          ? (item as { value: string; label: string })
          : { value: String(item), label: String(item) },
      )
    : Object.entries(field.options ?? {}).map(([optionValue, label]) => ({
        value: optionValue,
        label: String(label),
      }))
  if (options.length)
    return (
      <Field>
        <FieldLabel htmlFor={id}>{field.label || fieldKey}</FieldLabel>
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {field.description ? (
          <FieldDescription>{field.description}</FieldDescription>
        ) : null}
      </Field>
    )
  if (field.type === 'text')
    return (
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={id}>{field.label || fieldKey}</FieldLabel>
        <Textarea
          id={id}
          rows={6}
          value={String(value ?? '')}
          placeholder={sensitive ? '留空保留现有敏感值' : field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.description ? (
          <FieldDescription>{field.description}</FieldDescription>
        ) : null}
      </Field>
    )
  return (
    <Field>
      <FieldLabel htmlFor={id}>{field.label || fieldKey}</FieldLabel>
      <Input
        id={id}
        type={sensitive ? 'password' : 'text'}
        autoComplete={sensitive ? 'new-password' : undefined}
        value={String(value ?? '')}
        placeholder={sensitive ? '留空保留现有敏感值' : field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? (
        <FieldDescription>{field.description}</FieldDescription>
      ) : null}
    </Field>
  )
}

function isSensitivePluginField(key: string, field: PluginField) {
  return /secret|token|password|private|api.?key|webhook.?key|(^|_)key$/i.test(
    `${key} ${field.label ?? ''}`,
  )
}
function pluginActionSuccess(
  action: Exclude<ExtensionAction, null> extends infer T
    ? T extends { target: 'plugin'; action: infer A }
      ? A & string
      : never
    : never,
) {
  return (
    (
      {
        install: '插件已安装',
        uninstall: '插件已卸载',
        enable: '插件已启用',
        disable: '插件已禁用',
        upgrade: '插件已升级',
        delete: '插件文件已删除',
      } as Record<string, string>
    )[action] ?? '插件操作已完成'
  )
}
function extensionActionTitle(action: ExtensionAction) {
  if (!action) return '确认扩展操作'
  if (action.target === 'theme')
    return `${action.action === 'switch' ? '切换到' : '删除'}主题“${action.name}”？`
  const labels: Record<string, string> = {
    install: '安装',
    uninstall: '卸载',
    enable: '启用',
    disable: '禁用',
    upgrade: '升级',
    delete: '删除文件',
  }
  return `${labels[action.action]}插件“${action.plugin.name}”？`
}
function extensionActionDescription(action: ExtensionAction) {
  if (!action) return ''
  if (action.target === 'theme')
    return action.action === 'switch'
      ? '切换后，用户将看到所选主题。'
      : '主题目录、公共资源与保存的主题配置会被删除，且无法从管理端恢复。'
  const descriptions: Record<string, string> = {
    install: '安装会执行插件迁移或初始化逻辑并写入数据库，但不会自动启用插件。',
    uninstall:
      '卸载会移除插件注册和数据库状态；插件必须先禁用。目录文件仍会保留。',
    enable:
      '启用后插件服务端代码会进入运行路径，可能注册支付、通知、路由或计划任务。',
    disable: '禁用会停止插件能力，依赖该插件的支付或通知功能会立即不可用。',
    upgrade:
      '升级会执行目录中较新版本的迁移逻辑；请确认代码包已经审计且具备备份。',
    delete: '删除会移除插件目录文件，仅允许非核心且未安装的插件。',
  }
  return descriptions[action.action]
}
function extensionActionLabel(action: ExtensionAction) {
  if (!action) return '确认'
  if (action.target === 'theme')
    return action.action === 'switch' ? '确认切换主题' : '删除主题'
  const labels: Record<string, string> = {
    install: '确认安装',
    uninstall: '确认卸载',
    enable: '确认启用',
    disable: '确认禁用',
    upgrade: '确认升级',
    delete: '删除插件文件',
  }
  return labels[action.action]
}
function isDestructiveAction(action: ExtensionAction) {
  return action?.target === 'theme'
    ? action.action === 'delete'
    : Boolean(
        action && ['uninstall', 'disable', 'delete'].includes(action.action),
      )
}
