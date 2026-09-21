import * as React from 'react'
import { OnlineUsageCell, ServerUsageSheet, defaultTrafficPolicy, type TrafficPolicy } from '@/components/usage/server-usage-sheet'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Cpu,
  HardDrive,
  Layers3,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/data/status-badge'
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
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  BulkActions,
  ColumnVisibility,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import { useAdminApi } from '@/lib/auth'
import { useAdminQuery, getErrorMessage } from '@/hooks/use-admin-query'
import { useListSelection } from '@/hooks/use-list-selection'
import { useVisibleColumns } from '@/hooks/use-visible-columns'
import { certificatePreviewEnabled } from '@/lib/control-plane/certificate-types'
import {
  formatPercent,
  formatRate,
  formatResourceUsage,
  machineLastSeen,
  machineLastSeenLabel,
  machineLoadMetrics,
  machineStatus,
} from '@/lib/control-plane/runtime-api'
import type {
  Machine,
  MachineLoadMetrics,
  MachineStatus,
} from '@/lib/control-plane/runtime-api'

const serverColumns = [
  { key: 'identity', label: '服务器', required: true },
  { key: 'status', label: '状态', required: true },
  { key: 'online', label: '在线人数 / 设备' },
  { key: 'instances', label: '实例' },
  { key: 'heartbeat', label: '最后心跳' },
  { key: 'load', label: '系统负载' },
  { key: 'network', label: '实时网络' },
] as const

const statusCopy: Record<
  MachineStatus,
  { label: string; tone: 'neutral' | 'success' | 'danger' }
> = {
  disabled: { label: '停用', tone: 'neutral' },
  online: { label: '在线', tone: 'success' },
  offline: { label: '离线', tone: 'danger' },
}

function installStatusLabel(machine: Machine) {
  const updater = machine.updater
  if (!updater) {
    return machineStatus(machine) === 'online'
      ? 'Agent 在线，等待 Updater 首次心跳'
      : '已登记，等待 Agent 上线'
  }
  if (updater.blocked) return 'Updater 已阻断，需先处理回滚状态'
  if (updater.ready) {
    return `Updater ${updater.updater_version ?? '未知版本'} 在线，可执行版本更新`
  }
  if (updater.online) return 'Updater 在线，但协议尚未就绪'
  return 'Updater 已登记，等待最近心跳'
}

function previewMachines(): Machine[] {
  return [
    {
      id: 1,
      name: 'GJHK 预览服务器',
      notes: '本地 UI 预览数据，不会连接远程服务器。',
      is_active: true,
      last_seen_at: '2026-09-17T08:30:00Z',
      servers_count: 0,
      load_status: {
        cpu: 18,
        mem: { total: 16, used: 6 },
        disk: { total: 200, used: 74 },
        net: { in_speed: 12, out_speed: 8 },
        updated_at: '2026-09-17T08:30:00Z',
      },
    },
    {
      id: 2,
      name: 'US3 CloudCone 预览服务器',
      notes: '用于检查安装方式和节点登记状态的本地预览。',
      is_active: true,
      last_seen_at: null,
      servers_count: 1,
      load_status: null,
    },
  ]
}

export function ServersPage() {
  const api = useAdminApi()
  const query = useAdminQuery(
    React.useCallback(
      (signal) => certificatePreviewEnabled
        ? Promise.resolve(previewMachines())
        : api.get<Machine[]>('server/machine/fetch', undefined, signal),
      [api],
    ),
  )
  React.useEffect(() => {
    const timer = window.setInterval(query.reload, 15000)
    return () => window.clearInterval(timer)
  }, [query.reload])
  const [edit, setEdit] = React.useState<Partial<Machine> | null>(null)
  const [information, setInformation] = React.useState<{ machine: Machine; tab: string } | null>(null)
  const [trafficPolicies, setTrafficPolicies] = React.useState<Record<number, TrafficPolicy>>({})
  const [remove, setRemove] = React.useState<Machine | null>(null)
  const [saveBusy, setSaveBusy] = React.useState(false)
  const [removeBusy, setRemoveBusy] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [installingId, setInstallingId] = React.useState<number | null>(null)
  const [installTarget, setInstallTarget] = React.useState<Machine | null>(null)
  const [installMode, setInstallMode] = React.useState<'compose' | 'docker' | 'systemd'>('compose')
  const [installChannel, setInstallChannel] = React.useState<'dev' | 'stable'>('dev')
  const [installVersions, setInstallVersions] = React.useState<string[]>([])
  const [versionsBusy, setVersionsBusy] = React.useState(false)
  const [installVersion, setInstallVersion] = React.useState('')
  const [command, setCommand] = React.useState('')
  async function loadInstallVersions(channel: 'dev' | 'stable') {
    setVersionsBusy(true)
    try {
      const releases = await api.get<{ version: string }[]>('update/node-releases', { channel })
      const versions = releases.map((item) => item.version)
      setInstallVersions(versions)
      setInstallVersion((current) => (versions.includes(current) ? current : versions[0] ?? ''))
    } catch (error) {
      toast.error(getErrorMessage(error, '无法读取版本列表，请重试。'))
      setInstallVersions([])
      setInstallVersion('')
    } finally {
      setVersionsBusy(false)
    }
  }
  const [search, setSearch] = React.useState('')
  const machines = React.useMemo(() => query.data ?? [], [query.data])
  const filteredMachines = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return machines
    return machines.filter((item) =>
      [item.name, item.notes ?? '', String(item.id)].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    )
  }, [machines, search])
  const selection = useListSelection(filteredMachines)
  const visibleColumns = useVisibleColumns(
    'xboard-admin-servers-columns-v2',
    serverColumns,
  )
  const readBusy = query.loading || query.refreshing
  const writeBusy = saveBusy || removeBusy || bulkBusy || installingId !== null
  const pageBusy = readBusy || writeBusy
  const tableColumnCount = visibleColumns.visible.length + 2
  const loaded = query.data !== null

  async function setMachineActive(machine: Machine, isActive: boolean) {
    const latest = (await api.get<Machine[]>('server/machine/fetch')).find(
      (item) => item.id === machine.id,
    )
    if (!latest) throw new Error('服务器已不存在，请刷新列表')
    return api.post('server/machine/save', {
      id: machine.id,
      name: latest.name,
      is_active: isActive,
    })
  }

  const bulkActions = [
    {
      id: 'enable',
      label: '批量启用',
      description: '启用所选服务器，恢复运行其关联实例。',
      icon: Power,
      run: (machine: Machine) => setMachineActive(machine, true),
    },
    {
      id: 'disable',
      label: '批量停用',
      description: '停止所选服务器的全部关联实例，现有连接会中断。',
      icon: PowerOff,
      destructive: true,
      run: (machine: Machine) => setMachineActive(machine, false),
    },
    {
      id: 'remove',
      label: '批量移除',
      description:
        '移除服务器登记、停止关联实例并解除节点关联。该操作不可撤销。',
      icon: Trash2,
      destructive: true,
      run: (machine: Machine) =>
        api.post('server/machine/drop', { id: machine.id }),
    },
  ] as const

  async function save() {
    if (readBusy) return
    if (!edit?.name?.trim()) {
      toast.error('请输入服务器名称')
      return
    }
    setSaveBusy(true)
    try {
      const result = await api.post<{ id?: number }>(
        'server/machine/save',
        {
          ...(edit.id ? { id: edit.id } : {}),
          name: edit.name.trim(),
          notes: edit.notes?.trim() || null,
          is_active: edit.is_active ?? true,
        },
      )
      setEdit(null)
      selection.clear()
      query.reload()
      toast.success('服务器已保存')
      // 新建服务器后直接进入安装引导：登记本身不会安装任何组件。
      if (result?.id) {
        setInstallTarget({
          id: result.id,
          name: edit.name.trim(),
          notes: edit.notes?.trim() || null,
          is_active: edit.is_active ?? true,
          last_seen_at: null,
          servers_count: 0,
          load_status: null,
          updater: null,
        })
        setInstallMode('compose')
        setCommand('')
        void loadInstallVersions(installChannel)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaveBusy(false)
    }
  }

  function showInstallCommand(machine: Machine) {
    setInstallTarget(machine)
    setInstallMode('compose')
    setInstallVersion('')
    setCommand('')
    void loadInstallVersions(installChannel)
  }

  async function generateInstallCommand() {
    if (!installTarget) return
    if (!installVersion) {
      toast.error('请选择 Xboard-Node 版本。')
      return
    }
    setInstallingId(installTarget.id)
    try {
      const result = await api.post<{ command?: string }>(
        'server/machine/installCommand',
        { id: installTarget.id, version: installVersion, mode: installMode },
      )
      if (!result?.command) throw new Error('后端没有返回安装命令。')
      setCommand(result.command)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="服务器管理"
        description="查看服务器状态并管理运行实例。"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={readBusy || writeBusy}
              onClick={query.reload}
            >
              <RefreshCw
                data-icon="inline-start"
                className={
                  query.refreshing
                    ? 'animate-spin motion-reduce:animate-none'
                    : undefined
                }
              />
              刷新
            </Button>
            <Button
              disabled={pageBusy}
              onClick={() => setEdit({ name: '', notes: '', is_active: true })}
            >
              <Plus data-icon="inline-start" />
              添加服务器
            </Button>
          </div>
        }
      />
      {query.error ? (
        <ResourceError
          title="无法读取服务器"
          message={query.error}
          onRetry={query.reload}
        />
      ) : null}
      <section aria-label="服务器统计" className="mb-4 grid grid-cols-3 gap-3">
        {[
          {
            label: '服务器总数',
            value: loaded ? machines.length : '—',
            hint: '已登记的服务器',
            icon: Server,
          },
          {
            label: '在线服务器',
            value: loaded
              ? machines.filter((item) => machineStatus(item) === 'online')
                  .length
              : '—',
            hint: '最近两分钟有心跳',
            icon: Activity,
          },
          {
            label: '关联实例',
            value: loaded
              ? machines.reduce((sum, item) => sum + item.servers_count, 0)
              : '—',
            hint: '关联到这些机器的节点',
            icon: Layers3,
          },
        ].map(({ label, value, hint, icon: Icon }) => (
          <Card key={label} className="gap-3 py-4 shadow-none">
            <CardHeader className="flex flex-row items-start justify-between px-3 sm:px-4">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-xs sm:text-sm">{label}</CardTitle>
                <CardDescription className="hidden sm:block">
                  {hint}
                </CardDescription>
              </div>
              <Icon
                className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent className="px-3 font-data text-2xl font-semibold tracking-tight sm:px-4">
              {value}
            </CardContent>
          </Card>
        ))}
      </section>
      {information && <ServerUsageSheet key={information.machine.id + information.tab} machine={information.machine} initialTab={information.tab} policy={trafficPolicies[information.machine.id] ?? defaultTrafficPolicy(information.machine.id)} onSave={policy => setTrafficPolicies(previous => ({ ...previous, [information.machine.id]: policy }))} onClose={() => setInformation(null)} />}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              aria-label="搜索服务器"
              placeholder="搜索名称、备注或 SID"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                selection.clear()
              }}
              className="max-w-lg"
            />
            {search ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  selection.clear()
                }}
              >
                清除
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectionSummary
              selected={selection.count}
              total={filteredMachines.length}
              onClear={selection.clear}
            />
            <ColumnVisibility
              columns={serverColumns}
              visible={visibleColumns.visible}
              onChange={visibleColumns.setVisible}
            />
            <BulkActions<Machine>
              selected={selection.selectedRows}
              actions={bulkActions}
              getLabel={(machine) => `${machine.name} · SID ${machine.id}`}
              onComplete={(failedIds) => {
                selection.retain(failedIds)
                query.reload()
              }}
              onBusyChange={setBulkBusy}
              disabled={pageBusy}
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <Checkbox
                  aria-label="选择当前列表中的全部服务器"
                  checked={selection.checked}
                  disabled={pageBusy || !filteredMachines.length}
                  onCheckedChange={(checked) =>
                    selection.toggleAll(checked === true)
                  }
                />
              </TableHead>
              {visibleColumns.has('identity') ? (
                <TableHead>服务器</TableHead>
              ) : null}
              {visibleColumns.has('status') ? (
                <TableHead>状态</TableHead>
              ) : null}
              {visibleColumns.has('instances') ? (
                <TableHead>实例</TableHead>
              ) : null}
              {visibleColumns.has('online') ? <TableHead>在线人数 / 设备</TableHead> : null}
              {visibleColumns.has('heartbeat') ? (
                <TableHead>最后心跳</TableHead>
              ) : null}
              {visibleColumns.has('load') ? (
                <TableHead>系统负载</TableHead>
              ) : null}
              {visibleColumns.has('network') ? (
                <TableHead>实时网络</TableHead>
              ) : null}
              <TableHead className="text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.loading ? (
              <ResourceTableLoading columns={tableColumnCount} />
            ) : (
              filteredMachines.map((machine) => {
                const status = machineStatus(machine)
                const load = machineLoadMetrics(machine)
                const seen = machineLastSeen(machine)
                return (
                  <TableRow
                    key={machine.id}
                    data-state={
                      selection.selectedIds.has(machine.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`选择 ${machine.name}`}
                        checked={selection.selectedIds.has(machine.id)}
                        disabled={pageBusy}
                        onCheckedChange={(checked) =>
                          selection.toggle(machine.id, checked === true)
                        }
                      />
                    </TableCell>
                    {visibleColumns.has('identity') ? (
                      <TableCell className="w-52 min-w-52 max-w-52">
                        <div className="flex items-start gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border bg-muted">
                            <Server
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </div>
                          <div className="min-w-0">
                            <div
                              className="max-w-36 truncate font-medium"
                              title={machine.name}
                            >
                              {machine.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className="font-data">
                                SID {machine.id}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  machine.notes ? 'max-w-36 truncate' : 'italic'
                                }
                                title={machine.notes ?? undefined}
                              >
                                {machine.notes || 'Xboard-Node Agent'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.has('status') ? (
                      <TableCell>
                        <StatusBadge
                          label={statusCopy[status].label}
                          tone={statusCopy[status].tone}
                        />
                      </TableCell>
                    ) : null}
                    {visibleColumns.has('instances') ? (
                      <TableCell>
                        <div className="font-data text-sm">
                          {machine.servers_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          关联实例
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.has('online') ? <TableCell><OnlineUsageCell serverId={machine.id} /></TableCell> : null}
                    {visibleColumns.has('heartbeat') ? (
                      <TableCell className="min-w-20">
                        {seen ? (
                          <time
                            dateTime={seen.toISOString()}
                            title={seen.toLocaleString()}
                            className="font-data text-xs"
                          >
                            {machineLastSeenLabel(machine)}
                          </time>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            尚未连接
                          </span>
                        )}
                      </TableCell>
                    ) : null}
                    {visibleColumns.has('load') ? (
                      <TableCell>
                        <MachineLoadCell metrics={load} />
                      </TableCell>
                    ) : null}
                    {visibleColumns.has('network') ? (
                      <TableCell>
                        <NetworkLoadCell metrics={load} />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card">
                      <ButtonGroup aria-label={`${machine.name} 操作`} className="ml-auto">
                        <Button variant="outline" size="sm" onClick={() => setInformation({ machine, tab: 'history' })}>信息</Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={'/servers/' + machine.id + '/certificates'}>
                            配置
                            <ArrowRight data-icon="inline-end" />
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              disabled={pageBusy}
                              aria-label={`${machine.name} 更多操作`}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => setEdit(machine)}>
                                <Pencil aria-hidden="true" />
                                编辑
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setInformation({ machine, tab: 'traffic' })}>
                                <Activity aria-hidden="true" />
                                流量管理
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void showInstallCommand(machine)}
                              >
                                <TerminalSquare aria-hidden="true" />
                                安装
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setRemove(machine)}
                              >
                                <Trash2 aria-hidden="true" />
                                移除
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
            {!query.loading &&
            !query.error &&
            loaded &&
            filteredMachines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={tableColumnCount}
                  className="h-28 text-center text-muted-foreground"
                >
                  {machines.length === 0
                    ? '尚未登记机器，请添加服务器并运行安装命令。'
                    : '没有匹配的服务器，请更换搜索条件。'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(open) => !open && !saveBusy && setEdit(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? '编辑服务器' : '添加服务器'}</DialogTitle>
            <DialogDescription>登记服务器并获取安装命令。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="machine-name">服务器名称</FieldLabel>
              <Input
                id="machine-name"
                value={edit?.name ?? ''}
                disabled={saveBusy || readBusy}
                onChange={(event) =>
                  setEdit({ ...edit, name: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="machine-notes">备注</FieldLabel>
              <Input
                id="machine-notes"
                value={edit?.notes ?? ''}
                disabled={saveBusy || readBusy}
                onChange={(event) =>
                  setEdit({ ...edit, notes: event.target.value })
                }
              />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="machine-enabled">启用 Agent</FieldLabel>
              <Switch
                id="machine-enabled"
                checked={edit?.is_active ?? true}
                disabled={saveBusy || readBusy}
                onCheckedChange={(checked) =>
                  setEdit({ ...edit, is_active: checked })
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saveBusy}
              onClick={() => setEdit(null)}
            >
              取消
            </Button>
            <Button disabled={saveBusy || readBusy} onClick={() => void save()}>
              {saveBusy ? '保存中' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(installTarget)}
        onOpenChange={(open) => !open && !installingId && (setCommand(''), setInstallTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安装 Xboard-Node Agent</DialogTitle>
            <DialogDescription>
              选择准确版本和安装方式后生成一次性注册命令。命令只应在目标机器上执行。
            </DialogDescription>
          </DialogHeader>
          {installTarget && <>
            <div className="rounded-xl border bg-muted/30 p-3 text-sm"><div className="font-medium">{installTarget.name}</div><div className="mt-1 text-xs text-muted-foreground">SID {installTarget.id} · {installStatusLabel(installTarget)}</div></div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="machine-install-channel">版本分支</FieldLabel>
                <Select value={installChannel} disabled={Boolean(command) || installingId !== null || versionsBusy} onValueChange={(value) => {
                  const channel = value as 'dev' | 'stable'
                  setInstallChannel(channel)
                  void loadInstallVersions(channel)
                }}>
                  <SelectTrigger id="machine-install-channel"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="dev">Dev（开发版）</SelectItem><SelectItem value="stable">主线（正式版）</SelectItem></SelectGroup></SelectContent>
                </Select>
                <FieldDescription>切换分支后重新读取该分支的已发布版本。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="machine-install-version">Xboard-Node 版本</FieldLabel>
                <Select value={installVersion} disabled={Boolean(command) || installingId !== null || versionsBusy} onValueChange={setInstallVersion}>
                  <SelectTrigger id="machine-install-version"><SelectValue placeholder={versionsBusy ? '正在读取版本…' : '选择版本'} /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {installVersions.map((version) => <SelectItem key={version} value={version}>{version}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
                <FieldDescription>仅列出已发布的准确版本，默认选择所选分支的最新版本；不能使用 latest 或滚动地址。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="machine-install-mode">安装方式</FieldLabel>
                <Select value={installMode} disabled={Boolean(command) || installingId !== null} onValueChange={(value) => setInstallMode(value as typeof installMode)}>
                  <SelectTrigger id="machine-install-mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="compose">Docker Compose（推荐）</SelectItem><SelectItem value="docker">Docker</SelectItem><SelectItem value="systemd">原生 systemd</SelectItem></SelectGroup></SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            {command ? <Field>
              <FieldLabel htmlFor="machine-command">安装命令</FieldLabel>
              <Input id="machine-command" type="password" value={command} readOnly />
              <FieldDescription>复制后通过你的机器管理工具执行；Updater 以兼容协议在线后，面板才会允许版本更新。</FieldDescription>
            </Field> : <p className="text-sm text-muted-foreground">当前状态只代表服务器已登记。命令执行和首次心跳需要在目标机器上完成。</p>}
          </>}
          <DialogFooter>
            {command ? <Button onClick={() => {
                void navigator.clipboard
                  .writeText(command)
                  .then(() => toast.success('已复制安装命令'))
                  .catch((error) =>
                    toast.error(
                      getErrorMessage(error, '复制失败，请检查浏览器权限。'),
                    ),
                  )
              }}>复制命令</Button> : <Button disabled={installingId !== null} onClick={() => void generateInstallCommand()}>{installingId !== null ? '正在生成…' : '生成安装命令'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(remove)}
        onOpenChange={(open) => !open && !removeBusy && setRemove(null)}
        title="移除服务器"
        description="移除机器登记并解除节点关联。机器上的节点连接会停止。"
        destructive
        busy={removeBusy || readBusy}
        onConfirm={async () => {
          if (!remove || removeBusy || readBusy) return
          const target = remove
          setRemoveBusy(true)
          try {
            await api.post('server/machine/drop', { id: target.id })
            setRemove(null)
            selection.clear()
            query.reload()
            toast.success('服务器已移除')
          } catch (error) {
            toast.error(getErrorMessage(error))
          } finally {
            setRemoveBusy(false)
          }
        }}
      />
    </div>
  )
}

function MachineLoadCell({ metrics }: { metrics: MachineLoadMetrics }) {
  const hasLoad =
    metrics.cpu !== null ||
    metrics.memory.used !== null ||
    metrics.memory.total !== null ||
    metrics.disk.used !== null ||
    metrics.disk.total !== null

  if (!hasLoad) {
    return <span className="text-xs text-muted-foreground">暂无负载数据</span>
  }

  return (
    <div className="grid min-w-48 gap-1.5">
      <LoadMetricRow
        icon={Cpu}
        label="CPU"
        value={formatPercent(metrics.cpu)}
        percent={metrics.cpu}
      />
      <LoadMetricRow
        icon={Activity}
        label="内存"
        value={formatResourceUsage(metrics.memory)}
        percent={metrics.memory.percent}
      />
      <LoadMetricRow
        icon={HardDrive}
        label="磁盘"
        value={formatResourceUsage(metrics.disk)}
        percent={metrics.disk.percent}
      />
      {metrics.updatedAt ? (
        <span
          className="text-[10px] text-muted-foreground"
          title={metrics.updatedAt.toLocaleString()}
        >
          采样于 {metrics.updatedAt.toLocaleTimeString()}
        </span>
      ) : null}
    </div>
  )
}

function LoadMetricRow({
  icon: Icon,
  label,
  value,
  percent,
}: {
  icon: typeof Cpu
  label: string
  value: string
  percent: number | null
}) {
  return (
    <div className="grid grid-cols-[2.75rem_minmax(2.5rem,1fr)_auto] items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      {percent === null ? (
        <span className="text-[10px] text-muted-foreground">暂无比例</span>
      ) : (
        <Progress
          value={percent}
          aria-label={`${label}使用率 ${formatPercent(percent)}`}
          className="h-1.5 min-w-10"
        />
      )}
      <span className="font-data text-right text-[11px]">{value}</span>
    </div>
  )
}

function NetworkLoadCell({ metrics }: { metrics: MachineLoadMetrics }) {
  if (metrics.netIn === null && metrics.netOut === null) {
    return <span className="text-xs text-muted-foreground">暂无速率数据</span>
  }

  return (
    <div className="grid min-w-28 gap-1.5">
      <div className="flex items-center gap-2 text-xs">
        <ArrowUp
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-muted-foreground">上行</span>
        <span className="ml-auto font-data">{formatRate(metrics.netOut)}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <ArrowDown
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-muted-foreground">下行</span>
        <span className="ml-auto font-data">{formatRate(metrics.netIn)}</span>
      </div>
      {metrics.updatedAt ? (
        <span
          className="text-[10px] text-muted-foreground"
          title={metrics.updatedAt.toLocaleString()}
        >
          采样于 {metrics.updatedAt.toLocaleTimeString()}
        </span>
      ) : null}
    </div>
  )
}
