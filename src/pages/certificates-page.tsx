import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, KeyRound, LayoutGrid, Plus, RefreshCw, RotateCw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { previewMachines } from '@/pages/servers-page'
import { CertificateDialog } from '@/components/control-plane/certificate-dialog'
import { CertificateReferenceDialog } from '@/components/control-plane/certificate-reference-dialog'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import { ResourcePagination } from '@/components/control-plane/resource-pagination'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/data/status-badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  certificateExpiryLabel,
  certificatePreviewEnabled,
  certificateSourceLabels,
  certificateStatusLabels,
  certificateStatusTone,
  previewCertificates,
  previewPanelCertificates,
  type CertificateScope,
  type ServerCertificate,
} from '@/lib/control-plane/certificate-types'
import type { Machine } from '@/lib/control-plane/runtime-api'

const PAGE_SIZE = 10
const PANEL_GROUP_LABEL = '面板'

type CertificateRow = ServerCertificate & { machineName: string }
type DialogTarget = { scope: CertificateScope; machineId: number } | null

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'valid', label: '有效' },
  { value: 'expiring', label: '即将到期' },
  { value: 'expired', label: '已过期' },
  { value: 'issuing', label: '签发中' },
  { value: 'pending', label: '待签发' },
  { value: 'error', label: '异常' },
]

export function CertificatesPage() {
  const api = useAdminApi()
  const [view, setView] = React.useState<'grouped' | 'flat'>('grouped')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [machineFilter, setMachineFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [collapsed, setCollapsed] = React.useState<string | null>(null)
  const [dialogTarget, setDialogTarget] = React.useState<DialogTarget>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CertificateRow | undefined>()
  const [renewing, setRenewing] = React.useState<string | null>(null)
  const [remove, setRemove] = React.useState<CertificateRow | null>(null)
  const [localUpdates, setLocalUpdates] = React.useState<{
    source: unknown
    rows: CertificateRow[]
  } | null>(null)

  const query = useAdminQuery(
    React.useCallback(async (signal) => {
      const machines = certificatePreviewEnabled
        ? previewMachines()
        : await api.get<Machine[]>('server/machine/fetch', undefined, signal)
      const groups = await Promise.all([
        ...machines.map(async (machine) => ({
          machine,
          certificates: certificatePreviewEnabled
            ? previewCertificates(machine.id)
            : await api.get<ServerCertificate[]>('server/certificate/fetch', { machine_id: machine.id }, signal),
        })),
      ])
      const panelCertificates = certificatePreviewEnabled
        ? previewPanelCertificates()
        : await api.get<ServerCertificate[]>('server/certificate/fetch', { scope: 'panel' }, signal)
      return [
        ...panelCertificates.map((certificate) => ({ ...certificate, scope: 'panel' as CertificateScope, machineName: PANEL_GROUP_LABEL })),
        ...groups.flatMap((group) =>
          group.certificates.map((certificate) => ({ ...certificate, machineName: group.machine.name })),
        ),
      ]
    }, [api]),
  )

  const machines = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of query.data ?? []) {
      if (row.scope === 'panel') continue
      seen.set(String(row.machine_id), row.machineName)
    }
    return [...seen.entries()].map(([id, name]) => ({ value: id, label: name }))
  }, [query.data])

  const allRows = React.useMemo(
    () => (localUpdates?.source === query.data ? localUpdates.rows : (query.data ?? [])),
    [localUpdates, query.data],
  )

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return allRows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (machineFilter === 'panel' && row.scope !== 'panel') return false
      if (machineFilter !== 'all' && machineFilter !== 'panel' && row.scope === 'panel') return false
      if (machineFilter !== 'all' && machineFilter !== 'panel' && String(row.machine_id) !== machineFilter) return false
      if (!keyword) return true
      return (
        row.name.toLowerCase().includes(keyword) ||
        row.domains.some((domain) => domain.toLowerCase().includes(keyword)) ||
        row.machineName.toLowerCase().includes(keyword)
      )
    })
  }, [allRows, search, status, machineFilter])

  const filterKey = `${search}|${status}|${machineFilter}|${view}`
  const [lastFilterKey, setLastFilterKey] = React.useState(filterKey)
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const groupedRows = React.useMemo(() => {
    const groups = new Map<string, { key: string; machineId: number | null; machineName: string; scope: CertificateScope; rows: CertificateRow[] }>()
    for (const row of pageRows) {
      const scope = (row.scope ?? 'machine') as CertificateScope
      const key = scope === 'panel' ? 'panel' : `machine:${row.machine_id}`
      const group = groups.get(key) ?? { key, machineId: scope === 'panel' ? null : row.machine_id, machineName: row.machineName, scope, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'panel' ? -1 : 1))
  }, [pageRows])

  function applyRows(rows: CertificateRow[]) {
    setLocalUpdates({ source: query.data, rows })
  }

  function scopePayload(row: CertificateRow) {
    return row.scope === 'panel' ? { scope: 'panel' as const } : { machine_id: row.machine_id }
  }

  async function renew(row: CertificateRow) {
    setRenewing(row.id)
    try {
      const updated = await api.post<ServerCertificate>('server/certificate/renew', {
        id: row.id,
        ...scopePayload(row),
        expected_change_version: row.updated_at ?? row.id,
        confirmation: 'CONFIRM server.certificate.renew',
      })
      applyRows([{ ...updated, machineName: row.machineName }, ...allRows.filter((item) => item.id !== updated.id)])
      toast.success(`已提交 ${row.name} 的续签`)
    } catch (error) {
      toast.error(getErrorMessage(error, '证书续签失败'))
    } finally {
      setRenewing(null)
    }
  }

  async function drop(row: CertificateRow) {
    if (row.references.length) return
    try {
      await api.post('server/certificate/drop', {
        id: row.id,
        ...scopePayload(row),
        expected_change_version: row.updated_at ?? row.id,
        confirmation: 'CONFIRM server.certificate.drop',
      })
      applyRows(allRows.filter((item) => item.id !== row.id))
      setRemove(null)
      toast.success('证书资源已删除')
    } catch (error) {
      toast.error(getErrorMessage(error, '证书删除失败'))
    }
  }

  const rowActions = (row: CertificateRow) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => void renew(row)} disabled={renewing === row.id || row.status === 'issuing'}>
        <RotateCw data-icon="inline-start" />
        {renewing === row.id ? '续签中…' : '续签'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(row)
          setDialogTarget({ scope: (row.scope ?? 'machine') as CertificateScope, machineId: row.machine_id ?? 0 })
        }}
      >
        编辑
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`删除 ${row.name}`} onClick={() => setRemove(row)}>
        <Trash2 />
      </Button>
    </div>
  )

  const rowCells = (row: CertificateRow, showMachine: boolean, stickyActions = false) => (
    <>
      <td className="px-4 py-4 sm:px-5">
        <div className="font-medium">{row.name}</div>
        <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={row.domains.join(', ')}>{row.domains.join(', ')}</div>
      </td>
      {showMachine ? (
        <td className="px-4 py-4">
          {row.scope === 'panel' ? (
            <Badge variant="secondary">{PANEL_GROUP_LABEL}</Badge>
          ) : (
            <Link className="text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`/servers/${row.machine_id}/inbounds`}>{row.machineName}</Link>
          )}
        </td>
      ) : null}
      <td className="whitespace-nowrap px-4 py-4">{certificateSourceLabels[row.source_type]}</td>
      <td className="px-4 py-4">{row.auto_renew ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}</td>
      <td className="px-4 py-4">
        <StatusBadge tone={certificateStatusTone(row.status)} label={certificateStatusLabels[row.status]} />
        {row.last_error && <p className="mt-1 max-w-40 text-xs text-destructive">{row.last_error}</p>}
      </td>
      <td className="px-4 py-4">
        <span className={row.status === 'expired' || row.status === 'expiring' ? 'font-medium text-destructive' : ''}>{certificateExpiryLabel(row.expires_at)}</span>
      </td>      <td className="whitespace-nowrap px-4 py-4"><span className="font-data text-xs text-muted-foreground">{row.references.length} 个</span></td>
      <td className={stickyActions
        ? 'sticky right-0 z-10 bg-background px-4 py-4 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]'
        : 'px-4 py-4'}
      >
        {rowActions(row)}
      </td>
    </>
  )

  return (
    <>
      <PageHeader
        title="证书管理"
        description="汇总面板与所有服务器的证书资源，支持按面板、服务器分组查看、检索与到期状态筛选。"
        action={
          <>
            <Button variant="outline" onClick={query.reload} disabled={query.loading || query.refreshing}><RefreshCw data-icon="inline-start" />刷新</Button>
            <Button onClick={() => {
              if (machineFilter === 'panel') {
                setEditing(undefined)
                setDialogTarget({ scope: 'panel', machineId: 0 })
              } else if (machineFilter !== 'all') {
                setEditing(undefined)
                setDialogTarget({ scope: 'machine', machineId: Number(machineFilter) })
              } else {
                setPickerOpen(true)
              }
            }}>
              <Plus data-icon="inline-start" />新增证书
            </Button>
          </>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="gap-3 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">证书资源清单</CardTitle>
              <CardDescription>面板证书由入口网关签发；路径证书只登记引用，删除资源不会删除宿主机文件。</CardDescription>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              onValueChange={(next) => { if (next) setView(next as 'grouped' | 'flat') }}
              aria-label="切换列表视图"
            >
              <ToggleGroupItem value="grouped">按归属分组</ToggleGroupItem>
              <ToggleGroupItem value="flat">平铺列表</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" placeholder="搜索名称、域名或服务器" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索证书" />
            </div>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-44" aria-label="筛选归属"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部归属</SelectItem>
                <SelectItem value="panel">{PANEL_GROUP_LABEL}</SelectItem>
                {machines.map((machine) => <SelectItem key={machine.value} value={machine.value}>{machine.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32" aria-label="筛选状态"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {query.error ? (
            <div className="p-6 text-sm text-destructive">{query.error}</div>
          ) : query.loading ? (
            <Skeleton className="h-72 w-full" role="status" aria-label="正在读取证书" />
          ) : filtered.length === 0 ? (
            <Empty className="border-0">
              <EmptyHeader>
                <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <KeyRound className="size-5" aria-hidden="true" />
                </span>
                <EmptyTitle>没有匹配的证书</EmptyTitle>
                <EmptyDescription>
                  调整搜索或筛选条件；也可以为面板或具体服务器新增证书。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              {view === 'flat' ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/35 text-left text-xs text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-3 font-medium sm:px-5">名称 / 域名</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">归属</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">来源</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">自动续签</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">到期时间</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">引用</th>
                        <th className="sticky right-0 z-20 bg-muted/50 px-4 py-3 text-right font-medium backdrop-blur">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.id} className="border-t align-top">{rowCells(row, true, true)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="divide-y">
                  {groupedRows.map((group) => {
                    const isCollapsed = collapsed === group.key
                    const isPanel = group.scope === 'panel'
                    return (
                      <section key={group.key} aria-label={`${group.machineName} 的证书`}>
                        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2 font-medium"
                            aria-expanded={!isCollapsed}
                            onClick={() => setCollapsed(isCollapsed ? null : group.key)}
                          >
                            {isCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                            {isPanel ? <LayoutGrid data-icon="inline-start" aria-hidden="true" /> : null}
                            {group.machineName}
                          </Button>
                          <Badge variant="outline">{group.rows.length} 份证书</Badge>
                          <span className="ml-auto flex items-center gap-1">
                            {group.rows.some((row) => row.status === 'expired' || row.status === 'error') && <StatusBadge tone="danger" label="存在异常" />}
                            {group.rows.some((row) => row.status === 'expiring') && <StatusBadge tone="warning" label="即将到期" />}
                          </span>
                        </div>
                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-sm">
                              <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                                <tr>
                                  <th className="px-4 py-3 font-medium sm:px-5">名称 / 域名</th>
                                  <th className="whitespace-nowrap px-4 py-3 font-medium">来源</th>
                                  <th className="whitespace-nowrap px-4 py-3 font-medium">自动续签</th>
                                  <th className="whitespace-nowrap px-4 py-3 font-medium">状态</th>
                                  <th className="px-4 py-3 font-medium">到期时间</th>
                                  <th className="whitespace-nowrap px-4 py-3 font-medium">引用</th>
                                  <th className="px-4 py-3 text-right font-medium">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row) => (
                                  <tr key={row.id} className="border-t align-top">{rowCells(row, false)}</tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {!query.loading && !query.error ? (
            <ResourcePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} loading={query.refreshing} onPageChange={setPage} />
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选择证书归属</DialogTitle>
            <DialogDescription>面板证书由入口网关自动签发；服务器证书归属于具体服务器。</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => { setEditing(undefined); setDialogTarget({ scope: 'panel', machineId: 0 }); setPickerOpen(false) }}
            >
              <LayoutGrid data-icon="inline-start" aria-hidden="true" />
              {PANEL_GROUP_LABEL}
            </Button>
            {machines.map((machine) => (
              <Button
                key={machine.value}
                variant="outline"
                className="justify-start"
                onClick={() => { setEditing(undefined); setDialogTarget({ scope: 'machine', machineId: Number(machine.value) }); setPickerOpen(false) }}
              >
                {machine.label}
              </Button>
            ))}
            {machines.length === 0 ? <p className="text-sm text-muted-foreground">尚未登记服务器。</p> : null}
          </div>
        </DialogContent>
      </Dialog>
      <CertificateDialog
        key={`${editing?.id ?? 'new'}:${dialogTarget?.scope ?? 'none'}:${dialogTarget?.machineId ?? 'none'}`}
        open={dialogTarget !== null}
        onOpenChange={(open) => { if (!open) { setDialogTarget(null); setEditing(undefined) } }}
        machineId={dialogTarget?.machineId ?? 0}
        scope={dialogTarget?.scope ?? 'machine'}
        certificate={editing}
        onSaved={(certificate) => {
          const machineName = certificate.scope === 'panel'
            ? PANEL_GROUP_LABEL
            : editing?.machineName ?? machines.find((machine) => Number(machine.value) === dialogTarget?.machineId)?.label ?? ''
          applyRows([{ ...certificate, machineName }, ...allRows.filter((item) => item.id !== certificate.id)])
          setDialogTarget(null)
          setEditing(undefined)
          query.reload()
        }}
      />
      <ConfirmActionDialog
        open={Boolean(remove && !remove.references.length)}
        onOpenChange={(open) => !open && setRemove(null)}
        title={remove?.references.length ? '证书仍被引用' : `删除 ${remove?.name ?? '证书'}？`}
        description={remove?.references.length
          ? '这份证书仍被配置引用，删除前请先解除引用。'
          : remove?.scope === 'panel'
            ? '删除只移除面板证书资源，入口网关会在下次同步时停止使用该证书。'
            : '删除只移除服务器证书资源，不会删除 path 来源指向的宿主机文件。'}
        destructive={!remove?.references.length}
        busy={false}
        onConfirm={async () => { if (remove) await drop(remove) }}
      />
      <CertificateReferenceDialog
        record={remove?.references.length ? remove : null}
        onOpenChange={(open) => !open && setRemove(null)}
      />
    </>
  )
}
