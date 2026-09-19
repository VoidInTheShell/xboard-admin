import * as React from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { useAdminApi } from '@/lib/auth'
import { useAdminQuery } from '@/hooks/use-admin-query'
import {
  certificateExpiryLabel,
  certificatePreviewEnabled,
  certificateSourceLabels,
  certificateStatusLabels,
  previewCertificates,
  selectableCertificates,
  type CertificateSelection,
  type ServerCertificate,
} from '@/lib/control-plane/certificate-types'
import { CertificateDialog } from '@/components/control-plane/certificate-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function CertificateSelector({
  machineId,
  value,
  onChange,
  required = false,
  disabled = false,
}: {
  machineId: number
  value: CertificateSelection | null
  onChange: (value: CertificateSelection | null) => void
  required?: boolean
  disabled?: boolean
}) {
  const api = useAdminApi()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [localCertificates, setLocalCertificates] = React.useState<{
    source: ServerCertificate[] | null
    value: ServerCertificate[]
  } | null>(null)
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        certificatePreviewEnabled
          ? Promise.resolve(previewCertificates(machineId))
          : api.get<ServerCertificate[]>('server/certificate/fetch', { machine_id: machineId }, signal),
      [api, machineId],
    ),
  )
  const certificates = localCertificates?.source === query.data
    ? localCertificates.value
    : query.data ?? []
  const available = selectableCertificates(certificates)
  const mode = value?.mode ?? 'server_certificate'
  const selected = value?.mode === 'server_certificate' || value?.mode === 'path'
    ? available.find((certificate) => certificate.id === value.certificateId)
    : undefined
  const setMode = (next: string) => {
    if (next === 'server_certificate') {
      const fallback = value?.mode === 'server_certificate' ? value.certificateId : available[0]?.id
      onChange(fallback ? { mode: 'server_certificate', certificateId: fallback } : null)
      return
    }
    const pathValue = value?.mode === 'path' ? value : {
      mode: 'path' as const,
      certificateId: '',
      certificatePath: '',
      privateKeyPath: '',
    }
    onChange({
      ...pathValue,
      certificateId: pathCertificateId(machineId, pathValue.certificatePath, pathValue.privateKeyPath),
    })
  }
  const updatePath = (key: 'certificatePath' | 'privateKeyPath', next: string) => {
    const current = value?.mode === 'path' ? value : {
      mode: 'path' as const,
      certificateId: '',
      certificatePath: '',
      privateKeyPath: '',
    }
    const nextValue = { ...current, [key]: next }
    onChange({
      ...nextValue,
      certificateId: pathCertificateId(machineId, nextValue.certificatePath, nextValue.privateKeyPath),
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <FieldLabel>服务器证书</FieldLabel>
          <FieldDescription>
            选择当前服务器的证书资源，或登记一个宿主机证书路径。运行实例只保存证书 ID。
          </FieldDescription>
        </div>
        <Badge variant={required ? 'default' : 'outline'}>{required ? '必填' : '可选'}</Badge>
      </div>
      <ToggleGroup
        type="single"
        value={mode}
        disabled={disabled}
        onValueChange={setMode}
        variant="outline"
        className="w-full flex-wrap justify-start"
        aria-label="证书来源模式"
      >
        <ToggleGroupItem value="server_certificate">选择现有证书</ToggleGroupItem>
        <ToggleGroupItem value="path">选择证书路径</ToggleGroupItem>
      </ToggleGroup>
      {mode === 'server_certificate' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={value?.mode === 'server_certificate' ? value.certificateId : ''}
              disabled={disabled || query.loading || !available.length}
              onValueChange={(certificateId) => onChange({ mode: 'server_certificate', certificateId })}
            >
              <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={query.loading ? '正在读取证书…' : '选择当前服务器证书'} /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {available.map((certificate) => (
                    <SelectItem key={certificate.id} value={certificate.id}>
                      {certificate.name} · {certificate.domains[0] ?? '未填写域名'} · {certificateStatusLabels[certificate.status]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" disabled={disabled} onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />新增证书
            </Button>
          </div>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              <span>{selected.domains.join(' · ')}</span>
              <span>·</span>
              <span>{certificateSourceLabels[selected.source_type]}</span>
              <span>·</span>
              <span>{certificateExpiryLabel(selected.expires_at)}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {query.error ? query.error : available.length ? '请选择一份证书。' : '当前服务器没有可用证书，可在这里新增。'}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="certificate-selector-path">证书绝对路径</FieldLabel>
            <Input id="certificate-selector-path" disabled={disabled} value={value?.mode === 'path' ? value.certificatePath : ''} onChange={(event) => updatePath('certificatePath', event.target.value)} placeholder="/etc/ssl/.../fullchain.pem" />
          </Field>
          <Field>
            <FieldLabel htmlFor="certificate-selector-key-path">私钥绝对路径</FieldLabel>
            <Input id="certificate-selector-key-path" disabled={disabled} value={value?.mode === 'path' ? value.privateKeyPath : ''} onChange={(event) => updatePath('privateKeyPath', event.target.value)} placeholder="/etc/ssl/.../privkey.pem" />
          </Field>
          <FieldDescription className="sm:col-span-2">保存前会检查路径可读性，并登记为当前服务器的路径证书资源。</FieldDescription>
        </div>
      )}
      <CertificateDialog
        key={createOpen ? 'open' : 'closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        machineId={machineId}
        onSaved={(certificate) => {
          setLocalCertificates({
            source: query.data,
            value: [certificate, ...certificates.filter((item) => item.id !== certificate.id)],
          })
          onChange({ mode: 'server_certificate', certificateId: certificate.id })
        }}
      />
    </div>
  )
}

function pathCertificateId(machineId: number, certificatePath: string, privateKeyPath: string) {
  const value = `${machineId}:${certificatePath.trim()}:${privateKeyPath.trim()}`
  return `path_${Array.from(value).reduce((hash, character) => ((hash * 31 + character.charCodeAt(0)) >>> 0), 7).toString(16)}`
}
