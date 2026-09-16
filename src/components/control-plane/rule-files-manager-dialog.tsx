import * as React from 'react'
import { ArrowLeft, Download, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmActionDialog } from './confirm-action-dialog'
import { WireEditor } from './wire-editor'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { useAdminApi } from '@/lib/auth'
import type { CatalogTab } from '@/lib/control-plane/catalog-types'
import type { JsonObject } from '@/lib/control-plane/xray-wire'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type RuleFile = {
  id: string | number
  name: string
  size?: number | string | null
  updated_at?: string | number | null
  source?: string | null
  url?: string | null
  auto_update?: boolean
  update_interval_hours?: number | null
  built_in?: boolean
  read_only?: boolean
  downloadable?: boolean
}

type RuleFileResponse = {
  files?: RuleFile[]
}

type Editor = {
  file?: RuleFile
}

const ruleFileCatalog: CatalogTab[] = [
  {
    id: 'file',
    title: '规则文件',
    description: '文件会保存到当前节点的 Xray GeoData 目录。',
    sections: [
      {
        id: 'source',
        title: '来源与更新',
        description: '远程来源必须由服务端安全校验后下载；内置文件由 Xboard Node 提供。',
        fields: [
          {
            key: 'name',
            label: '规则文件名',
            control: 'text',
            placeholder: 'geoip.dat、geosite.dat 或 custom.srs',
            required: true,
          },
          {
            key: 'source',
            label: '来源',
            control: 'select',
            defaultValue: 'remote',
            options: [
              { value: 'remote', label: '远程下载地址' },
              { value: 'node-default', label: 'Xboard Node 内置 GeoData' },
              { value: 'managed', label: '服务器已托管文件' },
            ],
          },
          {
            key: 'url',
            label: '下载地址',
            control: 'text',
            placeholder: 'https://example.com/rules/geosite.dat',
            required: true,
            showWhen: { field: 'source', equals: 'remote' },
            description: '只接受服务端允许的 HTTPS/HTTP 来源；保存前会由服务端验证。',
            span: 2,
          },
          {
            key: 'auto_update',
            label: '自动更新',
            control: 'switch',
            defaultValue: true,
            description: '按设置的间隔检查并原子替换文件；失败时继续保留上一次可用版本。',
          },
          {
            key: 'update_interval_hours',
            label: '检查间隔（小时）',
            control: 'number',
            defaultValue: 24,
            placeholder: '24',
            showWhen: { field: 'auto_update', equals: true },
          },
        ],
      },
    ],
  },
]

function sourceLabel(source?: string | null) {
  switch (source) {
    case 'node-default':
    case 'builtin':
      return 'Xboard Node 内置'
    case 'remote':
      return '远程下载'
    case 'managed':
      return '服务器托管'
    default:
      return source?.trim() || '未标注'
  }
}

function formatSize(value: RuleFile['size']) {
  const size = Number(value)
  if (!Number.isFinite(size) || size < 0) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatUpdatedAt(value: RuleFile['updated_at']) {
  if (value === null || value === undefined || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function metadata(file?: RuleFile) {
  return [
    ['规则文件名', file?.name || '新增后生成'],
    ['当前大小', formatSize(file?.size)],
    ['更新时间', formatUpdatedAt(file?.updated_at)],
    ['来源', sourceLabel(file?.source)],
  ] as const
}

export function RuleFilesManagerDialog({
  nodeId,
  open,
  onOpenChange,
}: {
  nodeId: number | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const api = useAdminApi()
  const [editor, setEditor] = React.useState<Editor | null>(null)
  const [downloadingId, setDownloadingId] = React.useState<string | number | null>(null)
  const [updatingId, setUpdatingId] = React.useState<string | number | null>(null)
  const [removing, setRemoving] = React.useState<RuleFile | null>(null)
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        nodeId && open
          ? api.get<RuleFileResponse>('server/xray/rule-file/fetch', { node_id: nodeId }, signal)
          : Promise.resolve({ files: [] }),
      [api, nodeId, open],
    ),
  )
  const files = query.data?.files ?? []
  const busy = query.loading || query.refreshing || downloadingId !== null || updatingId !== null

  function close(next: boolean) {
    if (!next) {
      setEditor(null)
      setRemoving(null)
    }
    onOpenChange(next)
  }

  async function download(file: RuleFile) {
    if (!nodeId) return
    setDownloadingId(file.id)
    try {
      await api.post('server/xray/rule-file/download', {
        node_id: nodeId,
        id: file.id,
      })
      toast.success(`${file.name} 已提交下载更新`)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDownloadingId(null)
    }
  }

  async function updateAuto(file: RuleFile, autoUpdate: boolean) {
    if (!nodeId) return
    setUpdatingId(file.id)
    try {
      await api.post('server/xray/rule-file/save', {
        node_id: nodeId,
        id: file.id,
        auto_update: autoUpdate,
      })
      toast.success(autoUpdate ? `${file.name} 已开启自动更新` : `${file.name} 已关闭自动更新`)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setUpdatingId(null)
    }
  }

  async function saveFile(value: JsonObject, checkOnly = false) {
    if (!nodeId) throw new Error('请先选择运行实例')
    const name = String(value.name ?? '').trim()
    const source = String(value.source ?? 'remote').trim()
    const url = String(value.url ?? '').trim()
    if (!name) throw new Error('请输入规则文件名')
    if (!editor?.file && source !== 'remote')
      throw new Error('新增规则文件请提供远程下载地址')
    if (source === 'remote' && !/^https?:\/\//i.test(url))
      throw new Error('下载地址必须以 http:// 或 https:// 开头')
    await api.post(
      checkOnly ? 'server/xray/rule-file/validate' : 'server/xray/rule-file/save',
      {
        node_id: nodeId,
        id: editor?.file?.id,
        name,
        source,
        url: source === 'remote' ? url : null,
        auto_update: Boolean(value.auto_update),
        update_interval_hours: Number(value.update_interval_hours ?? 24),
      },
    )
    if (!checkOnly) {
      toast.success(editor?.file ? '规则文件已保存' : '规则文件已新增')
      setEditor(null)
      query.reload()
    }
  }

  async function removeFile() {
    if (!nodeId || !removing) return
    const file = removing
    setRemoving(null)
    try {
      await api.post('server/xray/rule-file/drop', {
        node_id: nodeId,
        id: file.id,
      })
      toast.success(`${file.name} 已移除`)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const editingFile = editor?.file
  const metadataRows = metadata(editingFile)
  return (
    <Dialog open={open} onOpenChange={close}>
      {open ? (
        <DialogContent className="max-h-[92dvh] sm:max-w-6xl" bodyClassName="min-w-0">
          {editor ? (
            <div className="min-w-0 space-y-4">
              <DialogHeader>
                <DialogTitle>{editingFile ? '编辑规则文件' : '新增规则文件'}</DialogTitle>
                <DialogDescription>
                  规则文件通过当前节点的 Xray GeoData 目录提供给 `geoip:`、`geosite:` 与扩展规则引用。
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border text-sm sm:grid-cols-2">
                {metadataRows.map(([label, value]) => (
                  <div key={label} className="bg-background px-4 py-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-all font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <WireEditor
                tabs={ruleFileCatalog}
                value={{
                  name: editingFile?.name ?? '',
                  source: editingFile?.source ?? 'remote',
                  url: editingFile?.url ?? '',
                  auto_update: editingFile?.auto_update ?? true,
                  update_interval_hours: editingFile?.update_interval_hours ?? 24,
                }}
                title={editingFile ? '规则文件配置' : '规则文件来源'}
                description="保存后由服务端校验路径和来源，下载操作不会覆盖仍在使用的上一版本。"
                headerActions={
                  <Button variant="outline" onClick={() => setEditor(null)}>
                    <ArrowLeft data-icon="inline-start" />
                    返回列表
                  </Button>
                }
                onValidate={(value) => saveFile(value, true)}
                onSave={(value) => saveFile(value)}
                errorPrefix="rule_file"
              />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>规则文件管理</DialogTitle>
                <DialogDescription>
                  管理本服务器 Xray 所需的 GeoIP、GeoSite 和自定义规则文件。内置文件、下载来源和自动更新状态会在这里统一显示。
                </DialogDescription>
              </DialogHeader>
              {query.error ? (
                <Alert variant="destructive">
                  <AlertTitle>规则文件未能读取</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>{getErrorMessage(query.error)}</span>
                    <Button size="sm" variant="outline" onClick={query.reload}>
                      <RefreshCw data-icon="inline-start" />
                      重试
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>规则文件名</TableHead>
                        <TableHead>大小</TableHead>
                        <TableHead>更新时间</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>自动更新</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={String(file.id)}>
                          <TableCell>
                            <div className="font-medium">{file.name}</div>
                            {file.url ? (
                              <div className="max-w-64 truncate text-xs text-muted-foreground" title={file.url}>
                                {file.url}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-data">{formatSize(file.size)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatUpdatedAt(file.updated_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{sourceLabel(file.source)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                size="sm"
                                aria-label={`${file.name} 自动更新`}
                                checked={Boolean(file.auto_update)}
                                disabled={busy}
                                onCheckedChange={(checked) => void updateAuto(file, checked)}
                              />
                              <span className="text-xs text-muted-foreground">
                                {file.auto_update ? '开启' : '关闭'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ButtonGroup className="ml-auto" aria-label={`${file.name} 操作`}>
                              <Button
                                aria-label={`下载或更新 ${file.name}`}
                                variant="outline"
                                size="icon-sm"
                                disabled={busy || file.downloadable === false}
                                onClick={() => void download(file)}
                              >
                                <Download />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setEditor({ file })}
                              >
                                编辑
                              </Button>
                              <Button
                                aria-label={`删除 ${file.name}`}
                                variant="outline"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                disabled={busy || Boolean(file.built_in || file.read_only)}
                                onClick={() => setRemoving(file)}
                              >
                                <Trash2 />
                              </Button>
                            </ButtonGroup>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!query.loading && files.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                            当前实例尚未登记规则文件。新增远程文件，或在路由引用 `geoip:` / `geosite:` 后让节点自动发现内置 GeoData。
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
              <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
                <ButtonGroup>
                  <Button variant="outline" disabled={busy} onClick={query.reload}>
                    <RefreshCw data-icon="inline-start" />
                    刷新
                  </Button>
                  <Button disabled={busy || !nodeId} onClick={() => setEditor({})}>
                    <Plus data-icon="inline-start" />
                    新增规则文件
                  </Button>
                </ButtonGroup>
                <Button variant="outline" disabled={busy} onClick={() => close(false)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      ) : null}
      <ConfirmActionDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="移除规则文件"
        description={
          removing
            ? `移除 ${removing.name} 后，仍引用它的路由可能无法应用。`
            : '移除后可能影响路由。'
        }
        confirmLabel="移除文件"
        destructive
        onConfirm={removeFile}
      />
    </Dialog>
  )
}
