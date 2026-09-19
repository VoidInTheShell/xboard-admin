import * as React from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage } from '@/hooks/use-admin-query'
import {
  certificatePreviewEnabled,
  certificateSourceLabels,
  type CertificateSourceType,
  type ServerCertificate,
} from '@/lib/control-plane/certificate-types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type CertificateDraft = {
  name: string
  source_type: CertificateSourceType
  domains: string
  auto_renew: boolean
  email: string
  dns_provider: string
  dns_credentials: string
  certificate_path: string
  private_key_path: string
  certificate_content: string
  private_key_content: string
}

const sourceTypes = Object.entries(certificateSourceLabels) as [
  CertificateSourceType,
  string,
][]

function emptyDraft(certificate?: ServerCertificate): CertificateDraft {
  return {
    name: certificate?.name ?? '',
    source_type: certificate?.source_type ?? 'acme_http',
    domains: certificate?.domains.join(', ') ?? '',
    auto_renew: certificate?.auto_renew ?? true,
    email: certificate?.email ?? '',
    dns_provider: certificate?.dns_provider ?? '',
    dns_credentials: '',
    certificate_path: certificate?.certificate_path ?? '',
    private_key_path: certificate?.private_key_path ?? '',
    certificate_content: '',
    private_key_content: '',
  }
}

export function CertificateDialog({
  open,
  onOpenChange,
  machineId,
  certificate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineId: number
  certificate?: ServerCertificate
  onSaved: (certificate: ServerCertificate) => void
}) {
  const api = useAdminApi()
  const draftIdentity = `${certificate?.id ?? 'new'}:${open ? 'open' : 'closed'}`
  const [draftState, setDraftState] = React.useState<{
    identity: string
    value: CertificateDraft
  } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [validating, setValidating] = React.useState(false)

  const draft = draftState?.identity === draftIdentity ? draftState.value : emptyDraft(certificate)

  function update<K extends keyof CertificateDraft>(key: K, value: CertificateDraft[K]) {
    setDraftState({ identity: draftIdentity, value: { ...draft, [key]: value } })
  }

  const domains = draft.domains
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)

  async function validate() {
    if (!draft.name.trim() || !domains.length) {
      toast.error('请先填写名称和至少一个域名。')
      return
    }
    setValidating(true)
    try {
      if (!certificatePreviewEnabled) {
        await api.post('server/certificate/validate', {
          id: certificate?.id,
          machine_id: machineId,
          source_type: draft.source_type,
          domains,
          email: draft.email.trim() || null,
          dns_provider: draft.dns_provider.trim() || null,
          dns_credentials: draft.dns_credentials || undefined,
          certificate_path: draft.certificate_path.trim() || null,
          private_key_path: draft.private_key_path.trim() || null,
          certificate_content: draft.certificate_content || undefined,
          private_key_content: draft.private_key_content || undefined,
        })
      }
      toast.success('证书配置检查通过')
    } catch (error) {
      toast.error(getErrorMessage(error, '证书配置检查失败'))
    } finally {
      setValidating(false)
    }
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error('请输入证书名称。')
      return
    }
    if (!domains.length) {
      toast.error('请至少填写一个域名。')
      return
    }
    if (draft.source_type === 'path' && (!draft.certificate_path.trim() || !draft.private_key_path.trim())) {
      toast.error('路径来源需要同时填写证书和私钥绝对路径。')
      return
    }
    if (draft.source_type === 'content' && (!draft.certificate_content.trim() || !draft.private_key_content.trim())) {
      toast.error('PEM 内容来源需要同时填写证书和私钥。')
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...(certificate ? { id: certificate.id } : {}),
        machine_id: machineId,
        name: draft.name.trim(),
        source_type: draft.source_type,
        domains,
        auto_renew: draft.auto_renew,
        email: draft.email.trim() || null,
        dns_provider: draft.dns_provider.trim() || null,
        dns_credentials: draft.dns_credentials || undefined,
        certificate_path: draft.certificate_path.trim() || null,
        private_key_path: draft.private_key_path.trim() || null,
        certificate_content: draft.certificate_content || undefined,
        private_key_content: draft.private_key_content || undefined,
      }
      const saved = certificatePreviewEnabled
        ? previewSavedCertificate(machineId, certificate, payload)
        : await api.post<ServerCertificate>('server/certificate/save', payload)
      onSaved(saved)
      toast.success(certificate ? '证书资源已保存' : '证书资源已创建')
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error, '证书保存失败'))
    } finally {
      setBusy(false)
    }
  }

  const source = draft.source_type
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{certificate ? '编辑服务器证书' : '新增服务器证书'}</DialogTitle>
          <DialogDescription>
            证书属于当前服务器，保存后可被多个运行实例和发布端点引用。密钥与 DNS 凭据不会回显。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="certificate-name">名称</FieldLabel>
            <Input id="certificate-name" value={draft.name} onChange={(event) => update('name', event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="certificate-source">来源</FieldLabel>
            <Select value={source} onValueChange={(value) => update('source_type', value as CertificateSourceType)}>
              <SelectTrigger id="certificate-source"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{sourceTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="certificate-domains">域名</FieldLabel>
            <Textarea id="certificate-domains" value={draft.domains} onChange={(event) => update('domains', event.target.value)} placeholder="example.com, *.example.com" rows={2} />
            <FieldDescription>多个域名用逗号或换行分隔；第一项作为主域名。</FieldDescription>
          </Field>
          {(source === 'acme_http' || source === 'acme_dns') && (
            <Field>
              <FieldLabel htmlFor="certificate-email">ACME 联系邮箱</FieldLabel>
              <Input id="certificate-email" type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} />
            </Field>
          )}
          {source === 'acme_dns' && (
            <>
              <Field>
                <FieldLabel htmlFor="certificate-dns-provider">DNS 提供商</FieldLabel>
                <Input id="certificate-dns-provider" value={draft.dns_provider} onChange={(event) => update('dns_provider', event.target.value)} placeholder="cloudflare" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="certificate-dns-credentials">DNS 凭据</FieldLabel>
                <Textarea id="certificate-dns-credentials" value={draft.dns_credentials} onChange={(event) => update('dns_credentials', event.target.value)} placeholder="保存后只显示是否已配置" rows={3} />
                <FieldDescription>只在替换凭据时填写；保存后不会再次显示原文。</FieldDescription>
              </Field>
            </>
          )}
          {source === 'path' && (
            <>
              <Field>
                <FieldLabel htmlFor="certificate-path">证书绝对路径</FieldLabel>
                <Input id="certificate-path" value={draft.certificate_path} onChange={(event) => update('certificate_path', event.target.value)} placeholder="/etc/ssl/.../fullchain.pem" />
              </Field>
              <Field>
                <FieldLabel htmlFor="certificate-key-path">私钥绝对路径</FieldLabel>
                <Input id="certificate-key-path" value={draft.private_key_path} onChange={(event) => update('private_key_path', event.target.value)} placeholder="/etc/ssl/.../privkey.pem" />
              </Field>
              <FieldDescription className="sm:col-span-2">路径仅登记为服务器证书资源；删除资源不会删除宿主机上的外部文件。</FieldDescription>
            </>
          )}
          {source === 'content' && (
            <>
              <Field>
                <FieldLabel htmlFor="certificate-content">PEM 证书内容</FieldLabel>
                <Textarea id="certificate-content" value={draft.certificate_content} onChange={(event) => update('certificate_content', event.target.value)} rows={5} placeholder="-----BEGIN CERTIFICATE-----" />
              </Field>
              <Field>
                <FieldLabel htmlFor="certificate-key-content">PEM 私钥内容</FieldLabel>
                <Textarea id="certificate-key-content" value={draft.private_key_content} onChange={(event) => update('private_key_content', event.target.value)} rows={5} placeholder="-----BEGIN PRIVATE KEY-----" />
              </Field>
            </>
          )}
          {source === 'self_signed' && (
            <Field className="sm:col-span-2">
              <FieldDescription>保存后由目标服务器为所列域名生成自签名证书，并记录有效期和指纹。</FieldDescription>
            </Field>
          )}
          <Field orientation="horizontal" className="justify-between rounded-2xl border p-4 sm:col-span-2">
            <div>
              <FieldLabel htmlFor="certificate-auto-renew">自动续签</FieldLabel>
              <FieldDescription>关闭后不启动长期续签，但仍可手动续签。</FieldDescription>
            </div>
            <Switch id="certificate-auto-renew" checked={draft.auto_renew} onCheckedChange={(checked) => update('auto_renew', checked)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={busy || validating} onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="outline" disabled={busy || validating} onClick={() => void validate()}>
            {validating ? '检查中…' : <><ShieldCheck data-icon="inline-start" />检查配置</>}
          </Button>
          <Button disabled={busy || validating} onClick={() => void save()}>
            {busy ? '保存中…' : <><CheckCircle2 data-icon="inline-start" />保存证书</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type PreviewSavePayload = {
  name: string
  source_type: CertificateSourceType
  domains: string[]
  auto_renew: boolean
  email: string | null
  dns_provider: string | null
  certificate_path: string | null
  private_key_path: string | null
}

function previewSavedCertificate(
  machineId: number,
  previous: ServerCertificate | undefined,
  payload: PreviewSavePayload,
): ServerCertificate {
  const now = new Date().toISOString()
  return {
    id: previous?.id ?? `cert_preview_${machineId}_${Date.now()}`,
    machine_id: machineId,
    name: payload.name,
    source_type: payload.source_type,
    domains: payload.domains,
    auto_renew: payload.auto_renew,
    email: payload.email,
    dns_provider: payload.dns_provider,
    dns_configured: Boolean(payload.dns_provider),
    certificate_path: payload.certificate_path,
    private_key_path: payload.private_key_path,
    status: payload.source_type === 'path' ? 'valid' : 'pending',
    not_before_at: payload.source_type === 'path' ? now : null,
    expires_at: payload.source_type === 'path' ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
    fingerprint: payload.source_type === 'path' ? 'SHA256:PREVIEW' : null,
    last_renewed_at: null,
    next_renewal_at: null,
    last_error: null,
    references: previous?.references ?? [],
    created_at: previous?.created_at ?? now,
    updated_at: now,
  }
}
