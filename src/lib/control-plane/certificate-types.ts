export type CertificateSourceType =
  | 'acme_http'
  | 'acme_dns'
  | 'path'
  | 'content'
  | 'self_signed'

export type CertificateStatus =
  | 'pending'
  | 'issuing'
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'error'

export type CertificateReference = {
  target_type: 'managed_inbound' | 'independent_inbound' | 'published_endpoint'
  target_id: string
  target_name: string
  instance_name: string
  protocol: string
  usage: 'server' | 'client' | 'issuance'
}

export type CertificateScope = 'machine' | 'panel'

export type ServerCertificate = {
  id: string
  scope?: CertificateScope
  machine_id: number | null
  name: string
  source_type: CertificateSourceType
  domains: string[]
  auto_renew: boolean
  email: string | null
  dns_provider: string | null
  dns_configured: boolean
  certificate_path: string | null
  private_key_path: string | null
  status: CertificateStatus
  not_before_at: string | null
  expires_at: string | null
  fingerprint: string | null
  last_renewed_at: string | null
  next_renewal_at: string | null
  last_error: string | null
  references: CertificateReference[]
  created_at?: string
  updated_at?: string
}

export type CertificateSelection =
  | { mode: 'server_certificate'; certificateId: string }
  | {
      mode: 'path'
      certificateId: string
      certificatePath: string
      privateKeyPath: string
    }

export const certificateSourceLabels: Record<CertificateSourceType, string> = {
  acme_http: 'ACME HTTP',
  acme_dns: 'ACME DNS',
  path: '证书路径',
  content: 'PEM 内容',
  self_signed: '自签名',
}

/** 面板作用域仅支持 caddy/updater 可以直接处理的来源。 */
export const panelSourceTypes: CertificateSourceType[] = ['acme_http', 'path', 'content']

export function sourceOptionsFor(scope: CertificateScope): [CertificateSourceType, string][] {
  const entries = Object.entries(certificateSourceLabels) as [CertificateSourceType, string][]
  return scope === 'panel' ? entries.filter(([value]) => panelSourceTypes.includes(value)) : entries
}

export const certificateStatusLabels: Record<CertificateStatus, string> = {
  pending: '待签发',
  issuing: '签发中',
  valid: '有效',
  expiring: '即将到期',
  expired: '已过期',
  error: '异常',
}

export const certificatePreviewEnabled =
  import.meta.env.DEV && import.meta.env.VITE_CERTIFICATE_PREVIEW === 'true'

export function certificateRequirementFor(
  protocol: unknown,
  security: unknown,
  transport: unknown,
): 'required' | 'conditional' | 'none' {
  const normalizedProtocol = String(protocol ?? '').trim().toLowerCase()
  const normalizedSecurity = String(security ?? '').trim().toLowerCase()
  const normalizedTransport = String(transport ?? '').trim().toLowerCase()

  if (['reality', 'reality-based'].includes(normalizedSecurity)) return 'none'
  if (['hysteria', 'hysteria2'].includes(normalizedProtocol)) return 'required'
  if (normalizedSecurity === 'tls') return 'required'
  if (
    ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http'].includes(
      normalizedProtocol,
    ) || normalizedTransport
  )
    return 'conditional'
  return 'none'
}

export function certificateStatusTone(status: CertificateStatus) {
  if (status === 'valid') return 'success' as const
  if (status === 'pending' || status === 'issuing' || status === 'expiring')
    return 'warning' as const
  if (status === 'expired' || status === 'error') return 'danger' as const
  return 'neutral' as const
}

export function certificateExpiryLabel(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return '未解析'
  const date = new Date(expiresAt)
  if (!Number.isFinite(date.getTime())) return '日期无效'
  const days = Math.ceil((date.getTime() - now) / 86400000)
  const absolute = date.toLocaleDateString('zh-CN')
  if (days < 0) return `${absolute} · 已过期 ${Math.abs(days)} 天`
  if (days === 0) return `${absolute} · 今天到期`
  return `${absolute} · 剩余 ${days} 天`
}

export function selectableCertificates(certificates: ServerCertificate[]) {
  return certificates.filter((certificate) =>
    ['valid', 'pending', 'issuing', 'expiring'].includes(certificate.status),
  )
}

export function previewPanelCertificates(): ServerCertificate[] {
  return [
    {
      id: 'cert_preview_panel_entry',
      scope: 'panel',
      machine_id: null,
      name: '面板入口证书',
      source_type: 'acme_http',
      domains: ['panel.example.test'],
      auto_renew: true,
      email: 'ops@example.test',
      dns_provider: null,
      dns_configured: false,
      certificate_path: null,
      private_key_path: null,
      status: 'valid',
      not_before_at: '2026-08-20T00:00:00Z',
      expires_at: '2026-11-18T00:00:00Z',
      fingerprint: 'SHA256:PANEL:MOCK',
      last_renewed_at: '2026-08-20T00:04:00Z',
      next_renewal_at: '2026-10-19T00:00:00Z',
      last_error: null,
      references: [],
    },
    {
      id: 'cert_preview_panel_path',
      scope: 'panel',
      machine_id: null,
      name: '既有证书挂载',
      source_type: 'path',
      domains: ['legacy.example.test'],
      auto_renew: false,
      email: null,
      dns_provider: null,
      dns_configured: false,
      certificate_path: '/etc/ssl/panel/fullchain.pem',
      private_key_path: '/etc/ssl/panel/privkey.pem',
      status: 'expiring',
      not_before_at: '2026-01-10T00:00:00Z',
      expires_at: '2026-10-03T00:00:00Z',
      fingerprint: 'SHA256:PATH:MOCK',
      last_renewed_at: null,
      next_renewal_at: null,
      last_error: null,
      references: [],
    },
  ]
}

export function previewCertificates(machineId: number): ServerCertificate[] {
  return [
    {
      id: `cert_preview_${machineId}_edge`,
      machine_id: machineId,
      name: '边缘入口证书',
      source_type: 'acme_dns',
      domains: ['edge.example.test', '*.edge.example.test'],
      auto_renew: true,
      email: 'ops@example.test',
      dns_provider: 'cloudflare',
      dns_configured: true,
      certificate_path: null,
      private_key_path: null,
      status: 'valid',
      not_before_at: '2026-08-20T00:00:00Z',
      expires_at: '2026-11-18T00:00:00Z',
      fingerprint: 'SHA256:7A:8B:9C:DE:MOCK',
      last_renewed_at: '2026-08-20T00:04:00Z',
      next_renewal_at: '2026-10-19T00:00:00Z',
      last_error: null,
      references: [
        {
          target_type: 'managed_inbound',
          target_id: 'inbound-443',
          target_name: '主入口 · 443',
          instance_name: '生产主节点',
          protocol: 'VLESS',
          usage: 'server',
        },
        {
          target_type: 'published_endpoint',
          target_id: 'endpoint-main',
          target_name: '用户订阅入口',
          instance_name: '生产主节点',
          protocol: 'HTTPS',
          usage: 'server',
        },
      ],
    },
    {
      id: `cert_preview_${machineId}_legacy`,
      machine_id: machineId,
      name: '兼容路径证书',
      source_type: 'path',
      domains: ['node.example.test'],
      auto_renew: false,
      email: null,
      dns_provider: null,
      dns_configured: false,
      certificate_path: '/etc/ssl/xboard/node/fullchain.pem',
      private_key_path: '/etc/ssl/xboard/node/privkey.pem',
      status: 'expiring',
      not_before_at: '2026-01-10T00:00:00Z',
      expires_at: '2026-10-03T00:00:00Z',
      fingerprint: 'SHA256:PATH:MOCK',
      last_renewed_at: null,
      next_renewal_at: null,
      last_error: null,
      references: [],
    },
    {
      id: `cert_preview_${machineId}_pending`,
      machine_id: machineId,
      name: '备用域名证书',
      source_type: 'acme_http',
      domains: ['backup.example.test'],
      auto_renew: true,
      email: 'ops@example.test',
      dns_provider: null,
      dns_configured: false,
      certificate_path: null,
      private_key_path: null,
      status: 'pending',
      not_before_at: null,
      expires_at: null,
      fingerprint: null,
      last_renewed_at: null,
      next_renewal_at: null,
      last_error: null,
      references: [],
    },
  ]
}
