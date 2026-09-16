import * as React from 'react'
import { Braces, Check, FileUp, Globe2, LayoutTemplate, Network } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAdminApi } from '@/lib/auth'
import { cn } from '@/lib/utils'
import type { JsonObject } from '@/lib/control-plane/xray-wire'
import type { RuntimeNode } from '@/lib/control-plane/runtime-api'

const ConfigEditor = React.lazy(() =>
  import('@/components/ui/config-editor').then((module) => ({
    default: module.ConfigEditor,
  })),
)

type FallbackMode = 'builtin' | 'upload' | 'proxy' | 'raw'

type Template = {
  id: string
  name: string
  description: string
}

type TemplateResponse = {
  default: string
  templates: Template[]
  max_upload_bytes: number
}

type FallbackDraft = {
  enabled: boolean
  mode: FallbackMode
  template: string
  asset: string
  assetName: string
  upstreamHost: string
  upstreamPort: string
  upstreamScheme: 'auto' | 'http' | 'https'
  raw: unknown
}

const modes: Array<{
  value: FallbackMode
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'builtin', label: '内置模板', icon: LayoutTemplate },
  { value: 'upload', label: '上传页面', icon: FileUp },
  { value: 'proxy', label: '现有服务', icon: Network },
  { value: 'raw', label: '原始配置', icon: Braces },
]

export function FallbackSiteEditor({
  node,
  effectiveInbound,
  onSave,
}: {
  node: RuntimeNode
  effectiveInbound: JsonObject
  onSave: (value: JsonObject) => Promise<void>
}) {
  const api = useAdminApi()
  const compatibility = React.useMemo(
    () => fallbackCompatibility(node, effectiveInbound),
    [effectiveInbound, node],
  )
  const [draft, setDraft] = React.useState<FallbackDraft>(() =>
    readDraft(node.fallback_site, compatibility.supported),
  )
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [rawText, setRawText] = React.useState(() =>
    JSON.stringify(
      readDraft(node.fallback_site, compatibility.supported).raw ??
        rawExample(compatibility.kind),
      null,
      2,
    ),
  )
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let alive = true
    void api
      .get<TemplateResponse>('server/fallback/templates')
      .then((response) => {
        if (alive) setTemplates(response.templates)
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : '内置模板加载失败'))
    return () => {
      alive = false
    }
  }, [api])

  const update = <K extends keyof FallbackDraft>(key: K, value: FallbackDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  async function upload(file?: File) {
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('page', file)
      const result = await api.post<{ asset: string; name: string; size: number }>(
        'server/fallback/upload',
        body,
      )
      setDraft((current) => ({
        ...current,
        mode: 'upload',
        asset: result.asset,
        assetName: result.name,
      }))
      toast.success('页面已上传，保存后应用到节点')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '页面上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (draft.enabled && !compatibility.supported) {
      toast.error(compatibility.description)
      return
    }
    let raw = draft.raw
    if (draft.mode === 'raw') {
      try {
        raw = JSON.parse(rawText)
      } catch {
        toast.error('原始配置不是有效的 JSON')
        return
      }
      if (compatibility.kind === 'xray' && !Array.isArray(raw)) {
        toast.error('Xray 回落原始配置必须是 JSON 数组')
        return
      }
    }

    const value: JsonObject = {
      enabled: draft.enabled,
      mode: draft.mode,
      ...(draft.mode === 'builtin' ? { template: draft.template } : {}),
      ...(draft.mode === 'upload'
        ? { asset: draft.asset, asset_name: draft.assetName }
        : {}),
      ...(draft.mode === 'proxy'
        ? {
            upstream: {
              host: draft.upstreamHost.trim(),
              port: Number(draft.upstreamPort),
              scheme: draft.upstreamScheme,
            },
          }
        : {}),
      ...(draft.mode === 'raw' ? { raw: raw as never } : {}),
    }

    setBusy(true)
    try {
      await onSave(value)
      setDraft((current) => ({ ...current, raw }))
      toast.success('回落站点配置已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回落站点保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex-col items-stretch justify-between gap-4 border-b p-6 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>回落站点</CardTitle>
            <Badge variant={compatibility.supported ? 'secondary' : 'outline'}>
              {compatibility.label}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {compatibility.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
          <Label htmlFor="fallback-enabled" className="text-sm">
            {draft.enabled ? '已启用' : '已停用'}
          </Label>
          <Switch
            id="fallback-enabled"
            checked={draft.enabled}
            disabled={!compatibility.supported && !draft.enabled}
            onCheckedChange={(checked) => update('enabled', checked)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="overflow-x-auto border-b">
          <div className="flex min-w-max gap-1">
            {modes.map((mode) => {
              const Icon = mode.icon
              return (
                <Button
                  key={mode.value}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'rounded-b-none',
                    draft.mode === mode.value && 'border-b-2 border-primary bg-muted',
                  )}
                  onClick={() => update('mode', mode.value)}
                >
                  <Icon data-icon="inline-start" />
                  {mode.label}
                </Button>
              )
            })}
          </div>
        </div>

        {draft.mode === 'builtin' && (
          <div className="grid gap-3 lg:grid-cols-3">
            {templates.map((template) => {
              const selected = draft.template === template.id
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    'relative min-h-32 rounded-xl border p-5 text-left transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    selected && 'border-primary bg-muted/60',
                  )}
                  onClick={() => update('template', template.id)}
                >
                  {selected && <Check className="absolute right-4 top-4 size-4" />}
                  <div className="font-medium">{template.name}</div>
                  <p className="mt-2 pr-6 text-sm leading-6 text-muted-foreground">
                    {template.description}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {draft.mode === 'upload' && (
          <div className="grid gap-4 rounded-xl border p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="font-medium">
                {draft.asset ? draft.assetName || '已选择自定义页面' : '尚未上传页面'}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                上传 UTF-8 单页 HTML，最大 512 KiB。页面在节点端作为回落响应展示。
              </p>
            </div>
            <div>
              <Input
                ref={fileRef}
                className="hidden"
                type="file"
                accept=".html,.htm,text/html"
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp data-icon="inline-start" />
                {uploading ? '上传中…' : draft.asset ? '替换页面' : '选择并上传'}
              </Button>
            </div>
          </div>
        )}

        {draft.mode === 'proxy' && (
          <div className="grid gap-5 rounded-xl border p-5 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
            <div className="space-y-2">
              <Label htmlFor="fallback-host">服务 IP 或域名</Label>
              <Input
                id="fallback-host"
                value={draft.upstreamHost}
                placeholder="service.internal"
                onChange={(event) => update('upstreamHost', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback-port">端口</Label>
              <Input
                id="fallback-port"
                type="number"
                min={1}
                max={65535}
                value={draft.upstreamPort}
                onChange={(event) => update('upstreamPort', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback-scheme">连接方式</Label>
              <Select
                value={draft.upstreamScheme}
                onValueChange={(value) =>
                  update('upstreamScheme', value as FallbackDraft['upstreamScheme'])
                }
              >
                <SelectTrigger id="fallback-scheme"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动判断</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm leading-6 text-muted-foreground lg:col-span-3">
              系统会把未通过节点认证的访问转交给该服务。地址从节点运行环境访问；同一容器网络可填写服务名。自动模式在 443 端口使用 HTTPS，其余端口使用 HTTP。
            </p>
          </div>
        )}

        {draft.mode === 'raw' && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Badge variant="outline">
                {compatibility.kind === 'xray' ? 'Xray fallbacks 数组' : 'sing-box masquerade 对象'}
              </Badge>
            </div>
            <React.Suspense
              fallback={
                <div className="h-72 rounded-xl border bg-muted" aria-label="正在加载原始配置编辑器" />
              }
            >
              <ConfigEditor
                label="原始回落配置"
                language="json"
                rows={10}
                value={rawText}
                disabled={busy}
                onChange={setRawText}
              />
            </React.Suspense>
            <p className="text-sm text-muted-foreground">
              保存前会校验 JSON；此处适合配置 SNI、ALPN、路径等协议原生规则。
            </p>
          </div>
        )}

        <div className="flex items-center justify-end border-t pt-5">
          <Button
            type="button"
            disabled={busy || uploading || (draft.enabled && !compatibility.supported)}
            onClick={() => void save()}
          >
            <Globe2 data-icon="inline-start" />
            {busy ? '保存中…' : '保存回落配置'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function readDraft(value: JsonObject | undefined, supported: boolean): FallbackDraft {
  const source = isRecord(value) ? value : {}
  const upstream = isRecord(source.upstream) ? source.upstream : {}
  const mode = ['builtin', 'upload', 'proxy', 'raw'].includes(String(source.mode))
    ? (String(source.mode) as FallbackMode)
    : 'builtin'
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : supported,
    mode,
    template: String(source.template ?? 'portal'),
    asset: String(source.asset ?? ''),
    assetName: String(source.asset_name ?? ''),
    upstreamHost: String(upstream.host ?? ''),
    upstreamPort: String(upstream.port ?? 80),
    upstreamScheme: ['http', 'https'].includes(String(upstream.scheme))
      ? (String(upstream.scheme) as 'http' | 'https')
      : 'auto',
    raw: source.raw,
  }
}

function fallbackCompatibility(node: RuntimeNode, effectiveInbound: JsonObject) {
  const protocol = String(node.type).toLowerCase()
  const settings = isRecord(node.protocol_settings) ? node.protocol_settings : {}
  const stream = isRecord(effectiveInbound.streamSettings)
    ? effectiveInbound.streamSettings
    : {}
  const network = String(stream.network ?? settings.network ?? 'tcp').toLowerCase()
  const tlsValue = Number(settings.server_tls ?? settings.tls ?? 0)
  const security = String(
    stream.security ?? (tlsValue === 1 ? 'tls' : tlsValue === 2 ? 'reality' : 'none'),
  ).toLowerCase()

  if (
    ['vless', 'trojan'].includes(protocol) &&
    ['tcp', 'raw'].includes(network) &&
    security === 'tls'
  ) {
    return {
      supported: true,
      kind: 'xray' as const,
      label: `${protocol.toUpperCase()} · TCP + TLS`,
      description: '认证失败或普通网页访问会进入这里配置的站点。内置模板是新建实例的默认选择。',
    }
  }
  if (protocol === 'hysteria' && Number(settings.version ?? 2) === 2 && !node.xray_config) {
    return {
      supported: true,
      kind: 'hysteria' as const,
      label: 'Hysteria2 · sing-box',
      description: '认证失败时返回内置或上传页面，也可以反向代理到现有 HTTP 服务。',
    }
  }
  if (security === 'reality') {
    return {
      supported: false,
      kind: 'unsupported' as const,
      label: '由 REALITY 管理',
      description: 'REALITY 使用入站安全配置中的目标站点；切换到 TCP + TLS 后可使用本页的回落站点。',
    }
  }
  return {
    supported: false,
    kind: 'unsupported' as const,
    label: '当前入站不支持',
    description: '回落站点适用于 Xray VLESS/Trojan 的 TCP + TLS，或 sing-box Hysteria2。',
  }
}

function rawExample(kind: 'xray' | 'hysteria' | 'unsupported') {
  if (kind === 'xray') return [{ dest: '127.0.0.1:8080' }]
  return {
    type: 'string',
    status_code: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    content: '<!doctype html><html><body>Service online</body></html>',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
