import * as React from 'react'
import { Check, ChevronDown, ChevronRight, Plus, RefreshCw, RotateCw, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { CertificateDialog } from '@/components/control-plane/certificate-dialog'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/data/status-badge'
import {
  certificateExpiryLabel,
  certificatePreviewEnabled,
  certificateSourceLabels,
  certificateStatusLabels,
  certificateStatusTone,
  previewCertificates,
  type ServerCertificate,
} from '@/lib/control-plane/certificate-types'

function previewRenewedCertificate(record: ServerCertificate): ServerCertificate {
  const now = Date.now()
  return {
    ...record,
    status: 'valid',
    last_renewed_at: new Date(now).toISOString(),
    expires_at: new Date(now + 90 * 86400000).toISOString(),
    next_renewal_at: new Date(now + 60 * 86400000).toISOString(),
    last_error: null,
  }
}

export function CertificateWorkspace({ machineId }: { machineId: number }) {
  const api = useAdminApi()
  const [localRecords, setLocalRecords] = React.useState<{
    source: ServerCertificate[] | null
    value: ServerCertificate[]
  } | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ServerCertificate | undefined>()
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [remove, setRemove] = React.useState<ServerCertificate | null>(null)
  const [renewing, setRenewing] = React.useState<string | null>(null)
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        certificatePreviewEnabled
          ? Promise.resolve(previewCertificates(machineId))
          : api.get<ServerCertificate[]>('server/certificate/fetch', { machine_id: machineId }, signal),
      [api, machineId],
    ),
  )
  const records = localRecords?.source === query.data ? localRecords.value : query.data ?? []

  function updateRecord(record: ServerCertificate) {
    setLocalRecords({
      source: query.data,
      value: [record, ...records.filter((item) => item.id !== record.id)],
    })
    setEditing(undefined)
    query.reload()
  }

  async function renew(record: ServerCertificate) {
    setRenewing(record.id)
    try {
      const updated = certificatePreviewEnabled
        ? previewRenewedCertificate(record)
        : await api.post<ServerCertificate>('server/certificate/renew', {
            id: record.id,
            machine_id: machineId,
            expected_change_version: record.updated_at ?? record.id,
            confirmation: 'CONFIRM server.certificate.renew',
          })
      updateRecord(updated)
      toast.success(`已提交 ${record.name} 的续签`)
    } catch (error) {
      toast.error(getErrorMessage(error, '证书续签失败'))
    } finally {
      setRenewing(null)
    }
  }

  async function drop(record: ServerCertificate) {
    if (record.references.length) return
    try {
      if (!certificatePreviewEnabled)
        await api.post('server/certificate/drop', {
          id: record.id,
          machine_id: machineId,
          expected_change_version: record.updated_at ?? record.id,
          confirmation: 'CONFIRM server.certificate.drop',
        })
      setLocalRecords({ source: query.data, value: records.filter((item) => item.id !== record.id) })
      setRemove(null)
      toast.success('证书资源已删除')
    } catch (error) {
      toast.error(getErrorMessage(error, '证书删除失败'))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">服务器证书</h2>
          <p className="mt-1 text-sm text-muted-foreground">统一管理当前服务器的证书资源、有效期和所有配置引用。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={query.reload} disabled={query.loading || query.refreshing}><RefreshCw data-icon="inline-start" />刷新</Button>
          <Button onClick={() => { setEditing(undefined); setCreateOpen(true) }}><Plus data-icon="inline-start" />新增证书</Button>
        </div>
      </div>
      {query.error ? <Card><CardContent className="p-6 text-sm text-destructive">{query.error}</CardContent></Card> : null}
      {query.loading ? <Skeleton className="h-72 w-full" role="status" aria-label="正在读取证书" /> : records.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyTitle>当前服务器还没有证书</EmptyTitle>
            <EmptyDescription>先创建或登记一份证书，之后新增运行实例和 TLS 配置可以直接选择它。</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => { setEditing(undefined); setCreateOpen(true) }}><Plus data-icon="inline-start" />新增第一份证书</Button>
        </Empty>
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="border-b px-4 py-4 sm:px-5">
            <CardTitle className="text-base">证书资源清单</CardTitle>
            <CardDescription>路径证书只登记引用，不会因为删除资源而删除宿主机文件。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-5">名称 / 域名</th>
                    <th className="px-4 py-3 font-medium">来源</th>
                    <th className="px-4 py-3 font-medium">自动续签</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">到期时间</th>
                    <th className="px-4 py-3 font-medium">引用</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const isExpanded = expanded === record.id
                    return <React.Fragment key={record.id}>
                      <tr className="border-t align-top">
                        <td className="px-4 py-4 sm:px-5"><div className="font-medium">{record.name}</div><div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={record.domains.join(', ')}>{record.domains.join(', ')}</div></td>
                        <td className="px-4 py-4">{certificateSourceLabels[record.source_type]}</td>
                        <td className="px-4 py-4">{record.auto_renew ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}</td>
                        <td className="px-4 py-4"><StatusBadge tone={certificateStatusTone(record.status)} label={certificateStatusLabels[record.status]} />{record.last_error && <p className="mt-1 max-w-40 text-xs text-destructive">{record.last_error}</p>}</td>
                        <td className="px-4 py-4"><span className={record.status === 'expired' || record.status === 'expiring' ? 'font-medium text-destructive' : ''}>{certificateExpiryLabel(record.expires_at)}</span><div className="mt-1 text-xs text-muted-foreground">最近续签：{record.last_renewed_at ? new Date(record.last_renewed_at).toLocaleDateString('zh-CN') : '尚未续签'}</div></td>
                        <td className="px-4 py-4"><button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-data text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setExpanded(isExpanded ? null : record.id)} aria-expanded={isExpanded}>{record.references.length}<span className="font-sans text-muted-foreground">个</span>{isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button></td>
                        <td className="px-4 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => void renew(record)} disabled={renewing === record.id || record.status === 'issuing'}><RotateCw data-icon="inline-start" />{renewing === record.id ? '续签中…' : '续签'}</Button><Button variant="ghost" size="sm" onClick={() => { setEditing(record); setCreateOpen(true) }}>编辑</Button><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`删除 ${record.name}`} onClick={() => setRemove(record)}><Trash2 /></Button></div></td>
                      </tr>
                      {isExpanded && <tr className="border-t bg-muted/15"><td colSpan={7} className="px-4 py-4 sm:px-5"><ReferenceList record={record} /></td></tr>}
                    </React.Fragment>
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <CertificateDialog key={`${editing?.id ?? 'new'}:${createOpen ? 'open' : 'closed'}`} open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditing(undefined) }} machineId={machineId} certificate={editing} onSaved={updateRecord} />
      <ConfirmActionDialog
        open={Boolean(remove && !remove.references.length)}
        onOpenChange={(open) => !open && setRemove(null)}
        title={remove?.references.length ? '证书仍被引用' : `删除 ${remove?.name ?? '证书'}？`}
        description={remove?.references.length ? '这份证书仍被配置引用，删除前请先解除下面列出的引用。' : '删除只移除服务器证书资源，不会删除 path 来源指向的宿主机文件。'}
        destructive={!remove?.references.length}
        busy={false}
        onConfirm={async () => { if (remove) await drop(remove) }}
      />
      {remove?.references.length ? <ReferenceBlockDialog record={remove} onClose={() => setRemove(null)} /> : null}
    </div>
  )
}

function ReferenceList({ record }: { record: ServerCertificate }) {
  if (!record.references.length) return <p className="text-sm text-muted-foreground">暂无配置引用，可以安全删除或编辑。</p>
  return <div className="flex flex-col gap-2"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" aria-hidden="true" />引用清单</div><div className="grid gap-2 md:grid-cols-2">{record.references.map((reference) => <div key={`${reference.target_type}:${reference.target_id}:${reference.usage}`} className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{reference.target_name}</span><Badge variant="outline">{reference.usage === 'server' ? '服务端' : reference.usage === 'client' ? '客户端' : '签发'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{reference.instance_name} · {reference.protocol} · {reference.target_type}</p></div>)}</div></div>
}

function ReferenceBlockDialog({ record, onClose }: { record: ServerCertificate; onClose: () => void }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="证书引用清单" onClick={onClose}><div className="w-full max-w-lg rounded-2xl border bg-background p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">无法删除：证书仍被引用</h2><p className="mt-1 text-sm text-muted-foreground">先处理以下 {record.references.length} 个引用，再执行删除。</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭引用清单" onClick={onClose}>×</Button></div><div className="mt-4"><ReferenceList record={record} /></div><div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}><Check data-icon="inline-start" />知道了</Button></div></div></div>
}
