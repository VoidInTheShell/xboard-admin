import * as React from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Braces,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { WireDialog, WireEditor } from '@/components/control-plane/wire-editor'
import { RuntimeNodeDialog } from '@/components/control-plane/runtime-node-dialog'
import { ResourceError } from '@/components/control-plane/resource-states'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import { StatusBadge } from '@/components/data/status-badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import {
  BulkActions,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import { useListSelection } from '@/hooks/use-list-selection'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { ApiError } from '@/lib/api'
import { serverWorkspaceTabs } from '@/lib/navigation'
import {
  runtimeIndependentInboundCatalog,
  runtimeInboundCatalog,
  runtimeOutboundCatalog,
  runtimeRuleCatalog,
  runtimeXrayCatalog,
  publicationCatalog,
} from '@/lib/control-plane/runtime-catalog'
import {
  applyEffectiveChanges,
  object,
  replaceIndependentInbounds,
} from '@/lib/control-plane/xray-wire'
import type { JsonObject } from '@/lib/control-plane/xray-wire'
import type {
  Machine,
  RuntimeNode,
  XrayResource,
  OutboundCandidate,
} from '@/lib/control-plane/runtime-api'
import {
  applicationError,
  applicationFieldErrors,
  machineStatus,
} from '@/lib/control-plane/runtime-api'
import type { CatalogTab } from '@/lib/control-plane/catalog-types'
import {
  certificateCatalog,
  certificateConfigForSave,
} from '@/lib/control-plane/certificate-catalog'

const rawCatalog: CatalogTab[] = [
  {
    id: 'raw',
    title: '原生配置',
    sections: [
      {
        id: 'raw',
        title: 'Xray 原生配置',
        fields: [
          {
            key: 'config',
            label: 'Xray 配置',
            control: 'code',
            language: 'json',
            sensitive: true,
          },
        ],
      },
    ],
  },
]
type Editor = {
  kind: 'outbound' | 'rule' | 'raw' | 'defaults' | 'independent-inbound'
  index?: number
  value: JsonObject
} | null

export function ServerWorkspacePage() {
  const navigate = useNavigate()
  const params = useParams()
  const machineId = Number(params.serverId ?? params.id)
  const active = params.tab ?? params.section ?? 'inbounds'
  const api = useAdminApi()
  const [search, setSearch] = useSearchParams()
  const query = useAdminQuery(
    React.useCallback(
      async (signal) => {
        const [machines, nodes] = await Promise.all([
          api.get<Machine[]>('server/machine/fetch', undefined, signal),
          api.get<RuntimeNode[]>('server/manage/getNodes', undefined, signal),
        ])
        return {
          machine: machines.find((item) => item.id === machineId),
          nodes: nodes.filter((item) => item.machine_id === machineId),
        }
      },
      [api, machineId],
    ),
  )
  const candidates = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<OutboundCandidate[]>(
          'server/outbound/fetch',
          undefined,
          signal,
        ),
      [api],
    ),
  )
  const nodes = query.data?.nodes ?? []
  const selected = Number(search.get('instance'))
  const node = nodes.find((item) => item.id === selected) ?? nodes[0]
  const [createNode, setCreateNode] = React.useState(false)
  const [editNode, setEditNode] = React.useState(false)
  const [editor, setEditor] = React.useState<Editor>(null)
  const [remove, setRemove] = React.useState<{
    kind: 'outbound' | 'rule' | 'independent-inbound'
    index: number
  } | null>(null)
  const [bindingId, setBindingId] = React.useState('')
  const [bulkRunning, setBulkBusy] = React.useState(false)
  const [conversion, setConversion] = React.useState<
    'shared' | 'private' | null
  >(null)
  const resource = useAdminQuery(
    React.useCallback(
      (signal) =>
        node
          ? api.get<XrayResource>(
              'server/xray/fetch',
              { node_id: node.id },
              signal,
            )
          : Promise.resolve(null),
      [api, node],
    ),
  )
  React.useEffect(() => {
    if (!node) return
    const timer = window.setInterval(resource.reload, 5000)
    return () => clearInterval(timer)
  }, [node, resource.reload])
  const snapshot =
    resource.data && resource.data.node_id === node?.id
      ? {
          ...resource.data,
          outbound_bindings: resource.data.outbound_bindings ?? [],
        }
      : null
  const bulkBusy =
    bulkRunning ||
    resource.loading ||
    resource.refreshing ||
    candidates.loading ||
    candidates.refreshing
  const config = snapshot?.xray_config ?? {}
  const effective = snapshot?.effective_config ?? {}
  const reload = () => {
    query.reload()
    candidates.reload()
    resource.reload()
  }
  async function save(
    next: JsonObject,
    bindings = snapshot?.outbound_bindings ?? [],
    clientSettings?: JsonObject,
  ) {
    if (!node || !snapshot) throw new Error('请先选择已加载的运行实例')
    const saved = await api.post<XrayResource>('server/xray/save', {
      node_id: node.id,
      expected_revision: snapshot.config_revision,
      xray_config: next,
      outbound_bindings: bindings,
      ...(clientSettings ? { client_settings: clientSettings } : {}),
    })
    resource.reload()
    if (node.enabled && machine && machineStatus(machine) === 'online') {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const current = await api.get<XrayResource>('server/xray/fetch', {
          node_id: node.id,
        })
        const application = current.application
        if (
          application &&
          ['failed', 'rejected'].includes(String(application.status)) &&
          Number(application.desired_revision) === saved.config_revision
        ) {
          const fields = applicationFieldErrors(application)
          throw new ApiError(applicationError(application), 422, {
            errors: fields,
          })
        }
        if (
          current.application?.status === 'applied' &&
          Number(current.application.applied_revision) === saved.config_revision
        )
          return
        await new Promise((resolve) => window.setTimeout(resolve, 500))
      }
    }
  }
  async function saveNode(next: JsonObject) {
    if (!node) return
    await api.post('server/manage/save', {
      ...node,
      server_port: node.server_port ?? node.port,
      ...next,
      show: typeof next.show === 'boolean' ? Number(next.show) : node.show,
    })
    reload()
  }
  async function validate(
    next: JsonObject,
    bindings = snapshot?.outbound_bindings ?? [],
    clientSettings?: JsonObject,
  ) {
    if (!node || !snapshot) throw new Error('请先选择已加载的运行实例')
    await api.post('server/xray/validate', {
      node_id: node.id,
      expected_revision: snapshot.config_revision,
      xray_config: next,
      outbound_bindings: bindings,
      ...(clientSettings ? { client_settings: clientSettings } : {}),
    })
  }
  async function managedInboundAction(input: JsonObject, checkOnly = false) {
    if (!snapshot || !node) throw new Error('请先选择已加载的运行实例')
    const value = structuredClone(input)
    const publicEncryption = object(value.clientSettings).encryption
    delete value.clientSettings
    const next = applyEffectiveChanges(
      object((config.inbounds as unknown[] | undefined)?.[0]),
      snapshot.effective_inbound,
      value,
    )
    delete next.protocol
    delete next.tag
    for (const key of ['clients', 'accounts', 'auth', 'password'])
      delete object(next.settings)[key]
    const decryption = String(
      object(value.settings).decryption ?? 'none',
    ).trim()
    await (checkOnly ? validate : save)(
      { ...config, inbounds: [next, ...independentInbounds] },
      snapshot.outbound_bindings,
      node.type === 'vless'
        ? {
            encryption: {
              enabled: Boolean(decryption && decryption !== 'none'),
              encryption:
                decryption && decryption !== 'none'
                  ? publicEncryption || null
                  : null,
            },
          }
        : undefined,
    )
  }
  const bound = Boolean(snapshot?.outbound_bindings.length)
  const outbounds: JsonObject[] = bound
    ? snapshot!.outbound_bindings.map((binding) => {
        const candidate = candidates.data?.find(
          (item) => item.id === binding.outbound_id,
        )
        return {
          ...candidate?.config,
          tag: binding.tag || candidate?.config.tag,
          bindingEnabled: binding.enabled !== false,
        }
      })
    : ((effective.outbounds as JsonObject[] | undefined) ?? [])
  const independentInbounds =
    (effective.inbounds as JsonObject[] | undefined)?.slice(1) ?? []
  const rules =
    (object(effective.routing).rules as JsonObject[] | undefined) ?? []
  async function updateList(
    kind: 'outbound' | 'rule',
    list: JsonObject[],
    checkOnly = false,
  ) {
    if (kind === 'outbound') {
      if (bound) throw new Error('请先转为实例独立出站')
      await (checkOnly ? validate : save)({ ...config, outbounds: list }, [])
    } else
      await (checkOnly ? validate : save)({
        ...config,
        routing: { ...object(effective.routing), rules: list },
      })
  }
  async function move(
    kind: 'outbound' | 'rule',
    index: number,
    direction: number,
  ) {
    if (kind === 'outbound' && bound && snapshot) {
      const bindings = [...snapshot.outbound_bindings]
      if (index + direction < 0 || index + direction >= bindings.length) return
      ;[bindings[index], bindings[index + direction]] = [
        bindings[index + direction],
        bindings[index],
      ]
      try {
        await save(config, bindings)
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
      return
    }
    const list = [...(kind === 'outbound' ? outbounds : rules)]
    if (index + direction < 0 || index + direction >= list.length) return
    ;[list[index], list[index + direction]] = [
      list[index + direction],
      list[index],
    ]
    try {
      await updateList(kind, list)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }
  async function saveEditor(value: JsonObject, checkOnly = false) {
    if (!editor) return
    if (editor.kind === 'raw' || editor.kind === 'defaults') {
      if (
        !value.config ||
        typeof value.config !== 'object' ||
        Array.isArray(value.config)
      )
        throw new Error('请输入 JSON 对象')
      if (editor.kind === 'raw')
        await (checkOnly ? validate : save)(object(value.config))
      else {
        await api.post(
          checkOnly ? 'server/xray/validate' : 'server/xray/machine',
          {
            machine_id: machineId,
            xray_config: value.config,
          },
        )
        if (!checkOnly) reload()
      }
      return
    }
    if (editor.kind === 'independent-inbound') {
      const list = [...independentInbounds]
      if (editor.index === undefined) list.push(value)
      else list[editor.index] = value
      await (checkOnly ? validate : save)(
        replaceIndependentInbounds(config, list),
      )
      return
    }
    const list = [...(editor.kind === 'outbound' ? outbounds : rules)]
    if (editor.index === undefined) list.push(value)
    else list[editor.index] = value
    await updateList(editor.kind, list, checkOnly)
  }
  const applied = snapshot?.application
  const appliedCurrent =
    applied?.status === 'applied' &&
    Number(applied.applied_revision) === snapshot?.config_revision
  const failed = Boolean(
    applied &&
      ['failed', 'rejected'].includes(String(applied.status)) &&
      Number(applied.desired_revision) === snapshot?.config_revision,
  )
  const machine = query.data?.machine
  const handledFailure = React.useRef('')
  React.useEffect(() => {
    if (!failed || !node || !applied) return
    const path = String(applied.error_path ?? '').replace(/\[(\d+)\]/g, '.$1')
    const marker = `${node.id}:${applied.desired_revision}:${path}`
    if (handledFailure.current === marker) return
    handledFailure.current = marker
    const inbound = path.match(/^xray_config\.inbounds\.(\d+)/)
    const outbound = path.match(/^xray_config\.outbounds\.(\d+)/)
    const rule = path.match(/^xray_config\.routing\.rules\.(\d+)/)
    const route = path.startsWith('cert_config')
      ? 'certificates'
      : inbound
        ? 'inbounds'
        : outbound
          ? 'outbounds'
          : rule
            ? 'routing'
            : 'xray-config'
    void navigate(`/servers/${machineId}/${route}?instance=${node.id}`)
    const index = Number(inbound?.[1] ?? outbound?.[1] ?? rule?.[1])
    const timer = window.setTimeout(() => {
      if (inbound && index > 0 && independentInbounds[index - 1])
        setEditor({
          kind: 'independent-inbound',
          index: index - 1,
          value: independentInbounds[index - 1],
        })
      else if (outbound && !bound && outbounds[index])
        setEditor({ kind: 'outbound', index, value: outbounds[index] })
      else if (rule && rules[index])
        setEditor({ kind: 'rule', index, value: rules[index] })
    })
    return () => window.clearTimeout(timer)
    // This effect is keyed by the immutable failure receipt. The list
    // projections come from the same render and only identify its target row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, failed, machineId, navigate, node?.id])
  const runtimeIssues = failed ? applicationFieldErrors(applied) : undefined
  const listKind = active === 'outbounds' ? 'outbound' : 'rule'
  const list = active === 'outbounds' ? outbounds : rules
  const selectionScope = `${node?.id}:${active}:${snapshot?.config_revision}`
  const inboundRows = independentInbounds.map((item, index) => ({
    id: index + 1,
    item,
  }))
  const inboundSelection = useListSelection(inboundRows, selectionScope)
  const listRows = list
    .map((item, index) => ({ id: index + 1, item }))
    .filter(
      ({ item }) =>
        listKind !== 'outbound' ||
        !['direct', 'block'].includes(String(item.tag)),
    )
  const listSelection = useListSelection(listRows, selectionScope)
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/servers">
          <ArrowLeft data-icon="inline-start" />
          服务器管理
        </Link>
      </Button>
      <PageHeader
        title={machine?.name ?? '服务器配置'}
        description="配置此服务器上的入站、出站和流量路由。"
        action={
          <>
            <Button variant="outline" onClick={reload}>
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
            <Button onClick={() => setCreateNode(true)}>
              <Plus data-icon="inline-start" />
              新增运行实例
            </Button>
          </>
        }
      />
      {query.error && (
        <ResourceError
          title="服务器加载失败"
          message={query.error}
          onRetry={query.reload}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <label htmlFor="runtime-instance" className="text-sm font-medium">
          运行实例
        </label>
        <Select
          value={node ? String(node.id) : ''}
          onValueChange={(value) => setSearch({ instance: value })}
        >
          <SelectTrigger id="runtime-instance" className="w-full sm:w-72">
            <SelectValue placeholder="选择运行实例" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {nodes.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name} · {item.type}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {node && (
          <>
            <Badge variant="outline">
              {node.type} · :{node.server_port ?? node.port}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setEditNode(true)}>
              实例属性
            </Button>
            <StatusBadge
              tone={
                !node.enabled
                  ? 'neutral'
                  : appliedCurrent
                    ? 'success'
                    : failed
                      ? 'danger'
                      : 'neutral'
              }
              label={
                !node.enabled
                  ? '已停用'
                  : appliedCurrent
                    ? '已生效 v' + snapshot?.config_revision
                    : failed
                      ? '应用失败'
                      : '待生效'
              }
            />
          </>
        )}
      </div>
      <nav aria-label="服务器配置" className="mb-4 overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {serverWorkspaceTabs.map((tab) => (
            <Button
              key={tab.value}
              asChild
              variant="ghost"
              className={
                active === tab.value
                  ? 'rounded-b-none border-b-2 border-primary bg-muted'
                  : 'rounded-b-none'
              }
            >
              <Link
                aria-current={active === tab.value ? 'page' : undefined}
                to={
                  '/servers/' +
                  machineId +
                  '/' +
                  tab.value +
                  (node ? '?instance=' + node.id : '')
                }
              >
                <tab.icon data-icon="inline-start" />
                {tab.title}
              </Link>
            </Button>
          ))}
        </div>
      </nav>
      {resource.error && (
        <ResourceError
          title="配置加载失败"
          message={resource.error}
          onRetry={resource.reload}
        />
      )}
      {active === 'outbounds' && candidates.error && (
        <ResourceError
          title="共享出站加载失败"
          message={candidates.error}
          onRetry={candidates.reload}
        />
      )}
      {failed && applied && (
        <ResourceError
          title="节点未能应用配置"
          message={applicationError(applied)}
          onRetry={resource.reload}
        />
      )}
      {query.loading || resource.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !node ? (
        <Card>
          <CardHeader>
            <CardTitle>此机器尚无运行实例</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setCreateNode(true)}>创建第一个实例</Button>
          </CardContent>
        </Card>
      ) : (
        snapshot && (
          <>
            {active === 'inbounds' && (
              <WireEditor
                key={'in-' + node.id + '-' + snapshot.config_revision}
                tabs={runtimeInboundCatalog}
                kind="inbound"
                context={{ defaultProtocol: node.type }}
                value={{
                  ...snapshot.effective_inbound,
                  clientSettings: {
                    encryption:
                      object(snapshot.client_settings?.encryption).encryption ??
                      '',
                  },
                }}
                title="入站配置"
                description="配置监听地址、传输方式、安全和嗅探。"
                errorPrefix="xray_config.inbounds.0"
                initialIssues={runtimeIssues}
                onValidate={(value) => managedInboundAction(value, true)}
                onSave={(value) => managedInboundAction(value)}
              />
            )}
            {active === 'inbounds' && (
              <Card className="mt-4 gap-0 overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div>
                    <div className="font-medium">独立入站</div>
                    <p className="text-sm text-muted-foreground">
                      添加隧道、内部代理或独立接入端口，连接凭据单独设置。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BulkActions
                      selected={inboundSelection.selectedRows}
                      scope={selectionScope}
                      getLabel={({ item }) => String(item.tag)}
                      disabled={resource.loading || resource.refreshing}
                      onBusyChange={setBulkBusy}
                      onComplete={(ids) => {
                        inboundSelection.retain(ids)
                        resource.reload()
                      }}
                      actions={[
                        {
                          id: 'delete',
                          label: '删除独立入站',
                          description:
                            '删除所选独立入站，对应端口上的现有连接会中断。',
                          icon: Trash2,
                          destructive: true,
                          runAll: (items) => {
                            const ids = new Set(items.map((item) => item.id))
                            return save(
                              replaceIndependentInbounds(
                                config,
                                independentInbounds.filter(
                                  (_, index) => !ids.has(index + 1),
                                ),
                              ),
                            )
                          },
                        },
                      ]}
                    />
                    <Button
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={() =>
                        setEditor({
                          kind: 'independent-inbound',
                          value: {
                            protocol: 'tunnel',
                            tag: '',
                            listen: '127.0.0.1',
                            port: 30081,
                            settings: {
                              address: '127.0.0.1',
                              port: 80,
                              network: 'tcp',
                            },
                          },
                        })
                      }
                    >
                      <Plus />
                      新增独立入站
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label="选择独立入站"
                          checked={inboundSelection.checked}
                          disabled={bulkBusy || !inboundRows.length}
                          onCheckedChange={(checked) =>
                            inboundSelection.toggleAll(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>协议</TableHead>
                      <TableHead>监听</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {independentInbounds.map((entry, index) => (
                      <TableRow
                        key={String(entry.tag)}
                        data-state={
                          inboundSelection.selectedIds.has(index + 1)
                            ? 'selected'
                            : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={'选择入站 ' + entry.tag}
                            checked={inboundSelection.selectedIds.has(
                              index + 1,
                            )}
                            disabled={bulkBusy}
                            onCheckedChange={(checked) =>
                              inboundSelection.toggle(
                                index + 1,
                                checked === true,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>{String(entry.tag)}</TableCell>
                        <TableCell>{String(entry.protocol)}</TableCell>
                        <TableCell>
                          {String(entry.listen ?? '::')}:
                          {String(entry.port ?? '')}
                        </TableCell>
                        <TableCell>
                          <ButtonGroup
                            className="ml-auto"
                            aria-label={String(entry.tag) + ' 操作'}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={bulkBusy}
                              onClick={() =>
                                setEditor({
                                  kind: 'independent-inbound',
                                  index,
                                  value: entry,
                                })
                              }
                            >
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={bulkBusy}
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setRemove({
                                  kind: 'independent-inbound',
                                  index,
                                })
                              }
                            >
                              删除
                            </Button>
                          </ButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!independentInbounds.length && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-20 text-center text-muted-foreground"
                        >
                          尚未添加独立入站。
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="border-t px-4 py-3">
                  <SelectionSummary
                    selected={inboundSelection.count}
                    total={inboundRows.length}
                    onClear={inboundSelection.clear}
                  />
                </div>
              </Card>
            )}
            {active === 'hosts' && (
              <WireEditor
                key={'pub-' + node.id}
                tabs={publicationCatalog}
                value={{
                  name: node.name,
                  host: node.host,
                  port: node.port,
                  show: Boolean(node.show),
                }}
                title="发布端点"
                description="设置用户订阅中的连接地址和端口。"
                onSave={saveNode}
              />
            )}
            {active === 'certificates' && (
              <WireEditor
                key={'cert-' + node.id + '-' + snapshot.config_revision}
                kind="certificate"
                errorPrefix="cert_config"
                initialIssues={runtimeIssues}
                tabs={certificateCatalog(node.id)}
                value={certificateConfigForSave(
                  {
                    ...object(node.cert_config),
                    cert_mode:
                      object(node.cert_config).cert_mode ??
                      object(node.cert_config).mode ??
                      'none',
                  },
                  node.id,
                )}
                title="实例证书"
                description="申请或指定 TLS 证书。文件路径填写节点上的位置。"
                onValidate={(value) =>
                  api.post('server/xray/validate', {
                    node_id: node.id,
                    cert_config: certificateConfigForSave(value, node.id),
                  })
                }
                onSave={(value) => {
                  return saveNode({
                    cert_config: certificateConfigForSave(value, node.id),
                  })
                }}
              />
            )}
            {active === 'xray-config' && (
              <WireEditor
                key={'global-' + node.id + '-' + snapshot.config_revision}
                tabs={runtimeXrayCatalog}
                value={effective}
                title="Xray 实例配置"
                errorPrefix="xray_config"
                initialIssues={runtimeIssues}
                onValidate={(value) => {
                  const next = applyEffectiveChanges(config, effective, value)
                  if (snapshot.outbound_bindings.length) delete next.outbounds
                  return validate(next)
                }}
                description="DNS、策略、日志、均衡器、观测、Metrics、Reverse 与传输。"
                headerActions={
                  <ButtonGroup>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditor({
                          kind: 'defaults',
                          value: { config: snapshot.machine_defaults },
                        })
                      }
                    >
                      服务器默认值
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditor({ kind: 'raw', value: { config } })
                      }
                    >
                      <Braces data-icon="inline-start" />
                      原生配置
                    </Button>
                  </ButtonGroup>
                }
                onSave={(value) => {
                  const next = applyEffectiveChanges(config, effective, value)
                  if (snapshot.outbound_bindings.length) delete next.outbounds
                  return save(next)
                }}
              />
            )}
            {(active === 'outbounds' || active === 'routing') && (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                  <div className="text-sm text-muted-foreground">
                    {active === 'outbounds'
                      ? '未匹配路由的连接使用首个出站。'
                      : '按顺序首条匹配；同一规则内条件为 AND。'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BulkActions
                      selected={listSelection.selectedRows}
                      scope={selectionScope}
                      getLabel={({ id, item }) =>
                        listKind === 'outbound'
                          ? String(item.tag)
                          : '规则 ' +
                            id +
                            ' · ' +
                            String(item.outboundTag ?? item.balancerTag ?? '')
                      }
                      disabled={resource.loading || resource.refreshing}
                      onBusyChange={setBulkBusy}
                      onComplete={(ids) => {
                        listSelection.retain(ids)
                        resource.reload()
                      }}
                      actions={[
                        {
                          id: 'delete',
                          label:
                            listKind === 'outbound'
                              ? bound
                                ? '解除出站绑定'
                                : '删除实例出站'
                              : '删除路由规则',
                          description:
                            listKind === 'outbound'
                              ? '移除所选出站。仍被路由或负载均衡引用的配置需先调整引用。'
                              : '删除所选规则，后续连接按剩余规则匹配。',
                          icon: Trash2,
                          destructive: true,
                          runAll: (items) => {
                            const ids = new Set(items.map((item) => item.id))
                            return listKind === 'outbound' && bound
                              ? save(
                                  config,
                                  snapshot.outbound_bindings.filter(
                                    (_, index) => !ids.has(index + 1),
                                  ),
                                )
                              : updateList(
                                  listKind,
                                  list.filter(
                                    (_, index) => !ids.has(index + 1),
                                  ),
                                )
                          },
                        },
                      ]}
                    />
                    <Button
                      disabled={bulkBusy || (listKind === 'outbound' && bound)}
                      onClick={() =>
                        setEditor({
                          kind: listKind,
                          value:
                            listKind === 'outbound'
                              ? { tag: '', protocol: 'freedom', settings: {} }
                              : { type: 'field', outboundTag: 'direct' },
                        })
                      }
                    >
                      <Plus data-icon="inline-start" />
                      {listKind === 'outbound' ? '新增实例出站' : '新增规则'}
                    </Button>
                  </div>
                </div>
                {active === 'outbounds' && (
                  <div className="flex flex-wrap items-center gap-2 border-b p-3">
                    <Select value={bindingId} onValueChange={setBindingId}>
                      <SelectTrigger
                        aria-label="共享出站候选"
                        className="w-full sm:w-72"
                      >
                        <SelectValue placeholder="从共享出站库绑定" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {candidates.data
                            ?.filter((item) => item.enabled)
                            .map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      disabled={
                        bulkBusy ||
                        !bindingId ||
                        Array.isArray(config.outbounds)
                      }
                      onClick={() =>
                        void (async () => {
                          try {
                            const candidate = candidates.data?.find(
                              (item) => item.id === Number(bindingId),
                            )
                            await save(config, [
                              ...snapshot.outbound_bindings,
                              {
                                outbound_id: Number(bindingId),
                                tag: String(candidate?.config.tag ?? ''),
                                enabled: true,
                              },
                            ])
                            setBindingId('')
                          } catch (error) {
                            toast.error(getErrorMessage(error))
                          }
                        })()
                      }
                    >
                      绑定候选
                    </Button>
                    {Array.isArray(config.outbounds) && (
                      <Button
                        variant="ghost"
                        disabled={bulkBusy}
                        onClick={() => setConversion('shared')}
                      >
                        改用共享绑定
                      </Button>
                    )}
                    {bound && (
                      <Button
                        variant="ghost"
                        disabled={bulkBusy}
                        onClick={() => setConversion('private')}
                      >
                        转为实例独立出站
                      </Button>
                    )}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label="选择当前配置项"
                          checked={listSelection.checked}
                          disabled={bulkBusy || !listRows.length}
                          onCheckedChange={(checked) =>
                            listSelection.toggleAll(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead>顺序</TableHead>
                      <TableHead>
                        {listKind === 'outbound' ? 'Tag / 协议' : '匹配条件'}
                      </TableHead>
                      <TableHead>
                        {listKind === 'outbound' ? '类型' : '目标'}
                      </TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((item, index) => (
                      <TableRow
                        key={index}
                        data-state={
                          listSelection.selectedIds.has(index + 1)
                            ? 'selected'
                            : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={'选择配置项 ' + (index + 1)}
                            checked={listSelection.selectedIds.has(index + 1)}
                            disabled={
                              bulkBusy ||
                              !listRows.some((row) => row.id === index + 1)
                            }
                            onCheckedChange={(checked) =>
                              listSelection.toggle(index + 1, checked === true)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-data">{index + 1}</TableCell>
                        <TableCell>
                          {listKind === 'outbound' ? (
                            <>
                              {String(item.tag)}{' '}
                              <span className="text-muted-foreground">
                                {String(item.protocol)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs">
                              {Object.keys(item)
                                .filter(
                                  (key) =>
                                    ![
                                      'type',
                                      'outboundTag',
                                      'balancerTag',
                                    ].includes(key),
                                )
                                .map((key) => key + ': ' + String(item[key]))
                                .join(' · ') || '全部流量'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {listKind === 'outbound' ? (
                            index === 0 ? (
                              <Badge variant="secondary">默认出口</Badge>
                            ) : (
                              '出站'
                            )
                          ) : (
                            String(item.outboundTag ?? item.balancerTag ?? '')
                          )}
                        </TableCell>
                        <TableCell>
                          <ButtonGroup
                            className="ml-auto"
                            aria-label={'配置项 ' + (index + 1) + ' 操作'}
                          >
                            <Button
                              aria-label="上移"
                              variant="outline"
                              size="icon-sm"
                              disabled={bulkBusy || index === 0}
                              onClick={() => void move(listKind, index, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              aria-label="下移"
                              variant="outline"
                              size="icon-sm"
                              disabled={bulkBusy || index === list.length - 1}
                              onClick={() => void move(listKind, index, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            {listKind === 'outbound' && bound ? (
                              <>
                                <Button asChild variant="outline" size="sm">
                                  <Link to="/outbounds">编辑共享出站</Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={bulkBusy}
                                  onClick={() =>
                                    void save(
                                      config,
                                      snapshot.outbound_bindings.map(
                                        (binding, i) =>
                                          i === index
                                            ? {
                                                ...binding,
                                                enabled:
                                                  binding.enabled === false,
                                              }
                                            : binding,
                                      ),
                                    ).catch((error) =>
                                      toast.error(getErrorMessage(error)),
                                    )
                                  }
                                >
                                  {item.bindingEnabled ? '停用' : '启用'}
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={bulkBusy}
                                onClick={() =>
                                  setEditor({
                                    kind: listKind,
                                    index,
                                    value: item,
                                  })
                                }
                              >
                                编辑
                              </Button>
                            )}
                            <Button
                              aria-label="删除"
                              variant="outline"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              disabled={
                                bulkBusy ||
                                (listKind === 'outbound' &&
                                  ['direct', 'block'].includes(
                                    String(item.tag),
                                  ))
                              }
                              onClick={() =>
                                setRemove({ kind: listKind, index })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </ButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                    {list.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-24 text-center text-muted-foreground"
                        >
                          {listKind === 'outbound'
                            ? '尚未配置自定义出站，默认使用系统 direct'
                            : '尚未配置路由规则'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="border-t px-4 py-3">
                  <SelectionSummary
                    selected={listSelection.count}
                    total={listRows.length}
                    onClear={listSelection.clear}
                  />
                </div>
              </Card>
            )}
          </>
        )
      )}
      {(createNode || editNode) && (
        <RuntimeNodeDialog
          machineId={machineId}
          node={editNode ? node : undefined}
          onClose={() => {
            setCreateNode(false)
            setEditNode(false)
          }}
          onSaved={reload}
        />
      )}
      {editor && (
        <WireDialog
          open
          onOpenChange={(open) => !open && setEditor(null)}
          tabs={
            editor.kind === 'independent-inbound'
              ? runtimeIndependentInboundCatalog
              : editor.kind === 'outbound'
                ? runtimeOutboundCatalog
                : editor.kind === 'rule'
                  ? runtimeRuleCatalog
                  : rawCatalog
          }
          kind={
            editor.kind === 'independent-inbound'
              ? 'independent-inbound'
              : editor.kind === 'outbound'
                ? 'outbound'
                : ''
          }
          value={editor.value}
          context={
            editor.kind === 'independent-inbound'
              ? {
                  existingInbounds: [
                    object(snapshot?.effective_inbound),
                    ...independentInbounds,
                  ],
                  editingIndex:
                    editor.index === undefined ? undefined : editor.index + 1,
                }
              : undefined
          }
          title={
            editor.kind === 'independent-inbound'
              ? '独立入站'
              : editor.kind === 'outbound'
                ? '出站配置'
                : editor.kind === 'rule'
                  ? '路由规则'
                  : editor.kind === 'defaults'
                    ? '服务器 Xray 默认值'
                    : '高级配置'
          }
          onSave={saveEditor}
          onValidate={(value) => saveEditor(value, true)}
          errorPrefix={
            editor.kind === 'independent-inbound'
              ? `xray_config.inbounds.${(editor.index ?? independentInbounds.length) + 1}`
              : editor.kind === 'outbound'
                ? `xray_config.outbounds.${editor.index ?? outbounds.length}`
                : editor.kind === 'rule'
                  ? `xray_config.routing.rules.${editor.index ?? rules.length}`
                  : 'xray_config'
          }
          initialIssues={runtimeIssues}
        />
      )}
      <ConfirmActionDialog
        open={Boolean(conversion)}
        onOpenChange={(open) => !open && setConversion(null)}
        title={conversion === 'private' ? '转为实例独立出站' : '改用共享绑定'}
        description={
          conversion === 'private'
            ? '保留当前出站配置，之后不再跟随共享出站更新。'
            : '清除当前实例的独立出站列表，再从共享出站库选择。引用这些出站的规则需要先移除。'
        }
        onConfirm={async () => {
          try {
            if (conversion === 'private')
              await save({ ...config, outbounds: effective.outbounds }, [])
            else {
              const next = { ...config }
              delete next.outbounds
              await save(next, [])
            }
            setConversion(null)
          } catch (error) {
            toast.error(getErrorMessage(error))
          }
        }}
      />
      <ConfirmActionDialog
        open={Boolean(remove)}
        onOpenChange={(open) => !open && setRemove(null)}
        title="删除配置项"
        description="删除此项会影响使用它的连接。"
        destructive
        onConfirm={async () => {
          if (!remove) return
          try {
            if (remove.kind === 'independent-inbound')
              await save(
                replaceIndependentInbounds(
                  config,
                  independentInbounds.filter(
                    (_, index) => index !== remove.index,
                  ),
                ),
              )
            else if (remove.kind === 'outbound' && bound && snapshot)
              await save(
                config,
                snapshot.outbound_bindings.filter(
                  (_, index) => index !== remove.index,
                ),
              )
            else
              await updateList(
                remove.kind,
                (remove.kind === 'outbound' ? outbounds : rules).filter(
                  (_, index) => index !== remove.index,
                ),
              )
            setRemove(null)
          } catch (error) {
            toast.error(getErrorMessage(error))
          }
        }}
      />
    </div>
  )
}
