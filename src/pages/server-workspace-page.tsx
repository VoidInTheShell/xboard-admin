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
import { RuleFilesManagerDialog } from '@/components/control-plane/rule-files-manager-dialog'
import { FallbackSiteEditor } from '@/components/control-plane/fallback-site-editor'
import { ResourceError } from '@/components/control-plane/resource-states'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import { StatusBadge } from '@/components/data/status-badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
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

function hasTag(value: unknown, tag: string) {
  const values = Array.isArray(value) ? value : [value]
  return values.some((item) => String(item) === tag)
}

function hasEveryTag(value: unknown, tags: string[]) {
  return tags.every((tag) => hasTag(value, tag))
}

const ruleConditionLabels: Record<string, string> = {
  sourceIP: '源 IP',
  localIP: '本地 IP',
  sourcePort: '源端口',
  localPort: '本地端口',
  vlessRoute: 'VLESS 端口',
  network: '网络',
  protocol: '协议',
  ip: '目标 IP',
  domain: '目标域名',
  user: '用户',
  process: '进程',
  inboundTag: '入站',
  attrs: '属性',
  port: '目标端口',
  ruleTag: '规则标签',
  webhook: 'Webhook',
}

function formatRuleConditionValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function describeRuleConditions(rule: JsonObject) {
  return (
    Object.entries(rule)
      .filter(
        ([key, value]) =>
          !['type', 'outboundTag', 'balancerTag', 'enabled'].includes(key) &&
          value !== null &&
          value !== '' &&
          (!Array.isArray(value) || value.length > 0),
      )
      .map(
        ([key, value]) =>
          `${ruleConditionLabels[key] ?? key}: ${formatRuleConditionValue(value)}`,
      )
      .join(' · ') || '全部流量'
  )
}

function hasRuleMatch(rule: JsonObject) {
  return Object.entries(rule).some(([key, value]) => {
    if (['type', 'outboundTag', 'balancerTag', 'enabled', 'ruleTag', 'webhook'].includes(key))
      return false
    if (typeof value === 'string') return value.trim() !== ''
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === 'object') return Object.keys(value).length > 0
    return value !== null && value !== undefined
  })
}

type Editor = {
  kind: 'rule' | 'raw' | 'defaults' | 'independent-inbound'
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
  const nodes = query.data?.nodes ?? []
  const selected = Number(search.get('instance'))
  const node = nodes.find((item) => item.id === selected) ?? nodes[0]
  const [createNode, setCreateNode] = React.useState(false)
  const [editNode, setEditNode] = React.useState(false)
  const [ruleFilesOpen, setRuleFilesOpen] = React.useState(false)
  const [editor, setEditor] = React.useState<Editor>(null)
  const [remove, setRemove] = React.useState<{
    kind: 'rule' | 'independent-inbound'
    index: number
  } | null>(null)
  const [bulkRunning, setBulkBusy] = React.useState(false)
  const [defaultOutboundBusy, setDefaultOutboundBusy] = React.useState(false)
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
    resource.refreshing
  const config = snapshot?.xray_config ?? {}
  const effective = snapshot?.effective_config ?? {}
  const reload = () => {
    query.reload()
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
  const independentInbounds =
    (effective.inbounds as JsonObject[] | undefined)?.slice(1) ?? []
  const rules =
    (object(effective.routing).rules as JsonObject[] | undefined) ?? []
  const effectiveOutbounds =
    (effective.outbounds as JsonObject[] | undefined) ?? []
  const defaultOutboundTag = String(
    snapshot?.default_outbound_tag ?? 'direct',
  )
  const defaultOutboundOptions: Array<{ tag: string; protocol: string }> = []
  const seenDefaultOutboundTags = new Set<string>()
  for (const outbound of [
    { tag: 'direct', protocol: 'freedom' },
    ...effectiveOutbounds,
  ]) {
    const tag = String(outbound.tag ?? '').trim()
    if (!tag || tag === 'api' || seenDefaultOutboundTags.has(tag)) continue
    seenDefaultOutboundTags.add(tag)
    defaultOutboundOptions.push({
      tag,
      protocol: String(outbound.protocol ?? ''),
    })
  }
  const apiRuleIndex = rules.findIndex(
    (rule) =>
      hasTag(rule.inboundTag, 'api') && String(rule.outboundTag ?? '') === 'api',
  )
  const mainlandIPRuleIndex = rules.findIndex(
    (rule) =>
      String(rule.outboundTag ?? '') === 'block' && hasTag(rule.ip, 'geoip:cn'),
  )
  const mainlandDomainRuleIndex = rules.findIndex(
    (rule) =>
      String(rule.outboundTag ?? '') === 'block' &&
      hasEveryTag(rule.domain, [
        'geosite:cn',
        'domain:googleapis.cn',
        'domain:google.cn',
        'geosite:google-play@cn',
        'domain:ping0.cc',
      ]),
  )
  const systemRuleIndexes = new Set(
    [apiRuleIndex, mainlandIPRuleIndex, mainlandDomainRuleIndex].filter(
      (index) => index >= 0,
    ),
  )
  const manageableRuleIndexes = rules
    .map((_, index) => index)
    .filter((index) => index !== apiRuleIndex)
  async function updateRules(list: JsonObject[], checkOnly = false) {
    await (checkOnly ? validate : save)({
      ...config,
      routing: { ...object(effective.routing), rules: list },
    })
  }
  async function moveRule(index: number, direction: number) {
    const position = manageableRuleIndexes.indexOf(index)
    const targetIndex = manageableRuleIndexes[position + direction]
    if (position < 0 || targetIndex === undefined) return
    const list = [...rules]
    ;[list[index], list[targetIndex]] = [list[targetIndex], list[index]]
    try {
      await updateRules(list)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }
  async function toggleRule(index: number, enabled: boolean) {
    const list = [...rules]
    if (!list[index]) return
    list[index] = { ...list[index], enabled }
    try {
      await updateRules(list)
      toast.success(enabled ? '路由规则已启用' : '路由规则已停用')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }
  async function changeDefaultOutbound(tag: string) {
    if (!node || !snapshot || tag === defaultOutboundTag) return
    setDefaultOutboundBusy(true)
    try {
      await api.post<XrayResource>('server/xray/default-outbound', {
        node_id: node.id,
        expected_revision: snapshot.config_revision,
        default_outbound_tag: tag,
      })
      resource.reload()
      toast.success(`默认出站已切换为 ${tag}`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDefaultOutboundBusy(false)
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
    if (!hasRuleMatch(value))
      throw new Error('请至少配置一个匹配条件；未命中流量由默认出站处理。')
    const list = [...rules]
    if (editor.index === undefined) list.push(value)
    else list[editor.index] = value
    await updateRules(list, checkOnly)
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
  const handledFailure = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    if (!node || !applied) return
    const path = String(applied.error_path ?? '').replace(/\[(\d+)\]/g, '.$1')
    const marker = `${node.id}:${applied.status}:${applied.desired_revision}:${path}`
    if (handledFailure.current === undefined) {
      handledFailure.current = marker
      return
    }
    if (!failed || handledFailure.current === marker) {
      handledFailure.current = marker
      return
    }
    handledFailure.current = marker
    const inbound = path.match(/^xray_config\.inbounds\.(\d+)/)
    const outbound = path.match(/^xray_config\.outbounds\.(\d+)/)
    const rule = path.match(/^xray_config\.routing\.rules\.(\d+)/)
    const route = path.startsWith('cert_config')
      ? 'certificates'
      : inbound
        ? 'inbounds'
        : outbound
          ? 'xray-config'
          : rule
            ? 'routing'
            : 'xray-config'
    void navigate(`/servers/${machineId}/${route}?instance=${node.id}`)
    const index = Number(inbound?.[1] ?? rule?.[1])
    const timer = window.setTimeout(() => {
      if (inbound && index > 0 && independentInbounds[index - 1])
        setEditor({
          kind: 'independent-inbound',
          index: index - 1,
          value: independentInbounds[index - 1],
        })
      else if (outbound) setEditor({ kind: 'raw', value: { config } })
      else if (rule && rules[index])
        setEditor({ kind: 'rule', index, value: rules[index] })
    })
    return () => window.clearTimeout(timer)
    // Ignore the receipt already present when the workspace mounts. A later
    // immutable failure receipt can still focus the field that just failed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, failed, machineId, navigate, node?.id])
  const runtimeIssues = failed ? applicationFieldErrors(applied) : undefined
  const selectionScope = `${node?.id}:${active}:${snapshot?.config_revision}`
  const inboundRows = independentInbounds.map((item, index) => ({
    id: index + 1,
    item,
  }))
  const inboundSelection = useListSelection(inboundRows, selectionScope)
  const listRows = manageableRuleIndexes.map((index) => ({
    id: index + 1,
    item: rules[index],
  }))
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
                      onClick={() => setRuleFilesOpen(true)}
                    >
                      规则文件管理
                    </Button>
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
            {active === 'fallback' && (
              <FallbackSiteEditor
                key={'fallback-' + node.id + '-' + snapshot.config_revision}
                node={node}
                effectiveInbound={snapshot.effective_inbound}
                onSave={(value) => saveNode({ fallback_site: value })}
              />
            )}
            {active === 'routing' && (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div>
                    <div className="font-medium">规则列表</div>
                    <p className="text-sm text-muted-foreground">
                      按顺序首条匹配；同一规则内条件为 AND。来源列区分系统维护规则和用户新增规则，未命中时使用默认出站。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BulkActions
                      selected={listSelection.selectedRows}
                      scope={selectionScope}
                      getLabel={({ id, item }) =>
                        '规则 ' +
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
                          label: '删除规则',
                          description:
                            '删除所选规则，后续连接按剩余规则匹配。内部 API 规则不会被选中。',
                          icon: Trash2,
                          destructive: true,
                          runAll: (items) => {
                            const ids = new Set(items.map((item) => item.id))
                            return updateRules(
                              rules.filter((_, index) => !ids.has(index + 1)),
                            )
                          },
                        },
                      ]}
                    />
                    <Button
                      disabled={bulkBusy}
                      onClick={() =>
                        setEditor({
                          kind: 'rule',
                          value: { type: 'field', outboundTag: 'direct' },
                        })
                      }
                    >
                      <Plus data-icon="inline-start" />
                      新增规则
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label="选择全部可管理规则"
                          checked={listSelection.checked}
                          disabled={bulkBusy || !listRows.length}
                          onCheckedChange={(checked) =>
                            listSelection.toggleAll(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead>顺序</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>匹配条件</TableHead>
                      <TableHead>目标</TableHead>
                      <TableHead>启用</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((item, index) => {
                      const isSystem = systemRuleIndexes.has(index)
                      const isLockedSystem = index === apiRuleIndex
                      const manageablePosition =
                        manageableRuleIndexes.indexOf(index)
                      return (
                        <TableRow
                          key={index}
                          data-state={
                            !isLockedSystem &&
                            listSelection.selectedIds.has(index + 1)
                              ? 'selected'
                              : undefined
                          }
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={
                                isLockedSystem
                                  ? `规则 ${index + 1} 由系统维护`
                                  : `选择规则 ${index + 1}`
                              }
                              checked={
                                !isLockedSystem &&
                                listSelection.selectedIds.has(index + 1)
                              }
                              disabled={bulkBusy || isLockedSystem}
                              onCheckedChange={(checked) =>
                                listSelection.toggle(index + 1, checked === true)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-data">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isSystem ? 'secondary' : 'outline'}>
                              {isSystem ? '系统' : '用户'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {describeRuleConditions(item)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {String(
                                item.outboundTag ??
                                  item.balancerTag ??
                                  '未设置',
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                size="sm"
                                aria-label={`规则 ${index + 1} 启用状态`}
                                checked={item.enabled !== false}
                                disabled={bulkBusy || isLockedSystem}
                                onCheckedChange={(checked) =>
                                  void toggleRule(index, checked)
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                {isLockedSystem
                                  ? '固定启用'
                                  : item.enabled !== false
                                    ? '启用'
                                    : '停用'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {isLockedSystem ? (
                              <Badge variant="secondary">系统维护</Badge>
                            ) : (
                              <ButtonGroup
                                className="ml-auto"
                                aria-label={'规则 ' + (index + 1) + ' 操作'}
                              >
                                <Button
                                  aria-label="上移"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={
                                    bulkBusy || manageablePosition <= 0
                                  }
                                  onClick={() => void moveRule(index, -1)}
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  aria-label="下移"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={
                                    bulkBusy ||
                                    manageablePosition ===
                                      manageableRuleIndexes.length - 1
                                  }
                                  onClick={() => void moveRule(index, 1)}
                                >
                                  <ArrowDown />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={bulkBusy}
                                  onClick={() =>
                                    setEditor({
                                      kind: 'rule',
                                      index,
                                      value: item,
                                    })
                                  }
                                >
                                  编辑
                                </Button>
                                <Button
                                  aria-label="删除"
                                  variant="outline"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  disabled={bulkBusy}
                                  onClick={() =>
                                    setRemove({ kind: 'rule', index })
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </ButtonGroup>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {rules.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-muted-foreground"
                        >
                          尚未配置匹配规则；未命中流量将使用表中的默认出站。
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell>
                        <Checkbox aria-label="默认兜底路径" disabled />
                      </TableCell>
                      <TableCell className="font-data">默认</TableCell>
                      <TableCell>
                        <Badge variant="secondary">系统</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">未命中任何规则</div>
                        <div className="text-xs text-muted-foreground">
                          位于规则列表末尾，使用此节点选择的默认出站。
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={defaultOutboundTag}
                          disabled={defaultOutboundBusy || resource.refreshing}
                          onValueChange={(tag) =>
                            void changeDefaultOutbound(tag)
                          }
                        >
                          <SelectTrigger
                            className="w-[11rem]"
                            aria-label="修改节点默认出站"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {defaultOutboundOptions.map((outbound) => (
                                <SelectItem
                                  key={outbound.tag}
                                  value={outbound.tag}
                                >
                                  {outbound.tag}
                                  {outbound.protocol
                                    ? ` · ${outbound.protocol}`
                                    : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone="info" label="生效路径" />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        表内修改
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <div className="border-t px-4 py-3">
                  <SelectionSummary
                    selected={listSelection.count}
                    total={rules.length}
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
              : editor.kind === 'rule'
                ? runtimeRuleCatalog
                : rawCatalog
          }
          kind={
            editor.kind === 'independent-inbound'
              ? 'independent-inbound'
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
              : editor.kind === 'rule'
                ? `xray_config.routing.rules.${editor.index ?? rules.length}`
                : 'xray_config'
          }
          initialIssues={runtimeIssues}
        />
      )}
      <RuleFilesManagerDialog
        nodeId={node?.id}
        open={ruleFilesOpen}
        onOpenChange={setRuleFilesOpen}
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
            else
              await updateRules(
                rules.filter((_, index) => index !== remove.index),
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
