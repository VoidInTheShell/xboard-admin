import * as React from 'react'
import { CheckCircle2, Link2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage } from '@/hooks/use-admin-query'

type ImportedOutbound = {
  id?: number
  name?: string
  protocol?: string
  tag?: string
}

type ImportIssue = {
  source?: string
  message?: string
}

type QuickImportResult = {
  imported?: ImportedOutbound[]
  skipped?: ImportIssue[]
}

export function QuickOutboundImportDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const api = useAdminApi()
  const [source, setSource] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<QuickImportResult | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSource('')
      setError(null)
      setResult(null)
    }
    onOpenChange(next)
  }

  async function submit() {
    const value = source.trim()
    if (!value) {
      setError('请粘贴订阅链接或节点分享链接。')
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const next = await api.post<QuickImportResult>('server/outbound/import', {
        source: value,
      })
      setResult(next)
      onSaved()
      toast.success(`已导入 ${next.imported?.length ?? 0} 个出站`)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>快速导入出站</DialogTitle>
          <DialogDescription>
            从订阅、代理池或节点分享链接中识别支持的出站，并保存到全局出站库。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="quick-outbound-source">
              订阅、代理池或分享链接
            </FieldLabel>
            <Textarea
              id="quick-outbound-source"
              value={source}
              disabled={busy}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby="quick-outbound-source-help"
              placeholder={'https://example.com/subscribe\nhttp://user:password@proxy.example.com:8080\nsocks5://user:password@proxy.example.com:1080\nvless://…'}
              className="min-h-40 resize-y font-data text-sm leading-6"
              onChange={(event) => setSource(event.target.value)}
            />
            <FieldDescription id="quick-outbound-source-help">
              可粘贴一个 HTTP(S) 订阅链接，或逐行粘贴代理地址与分享链接。代理池常见格式：
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  'http://host:port',
                  'http://user:password@host:port',
                  'socks5://host:port',
                  'socks5://user:password@host:port',
                ].map((example) => (
                  <code
                    key={example}
                    className="rounded border bg-muted px-1.5 py-0.5 font-data text-xs text-foreground"
                  >
                    {example}
                  </code>
                ))}
              </span>
            </FieldDescription>
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="支持的导入来源">
            <Badge variant="outline">HTTP(S) 订阅</Badge>
            <Badge variant="outline">HTTP 代理池</Badge>
            <Badge variant="outline">SOCKS5</Badge>
            <Badge variant="outline">VLESS</Badge>
            <Badge variant="outline">VMess</Badge>
            <Badge variant="outline">Trojan</Badge>
            <Badge variant="outline">Shadowsocks</Badge>
          </div>
          <Alert>
            <Link2 aria-hidden="true" />
            <AlertTitle>导入会在服务器端解析</AlertTitle>
            <AlertDescription>
              订阅内容、重定向地址和分享链接会在保存前校验；不支持的条目会保留在导入结果中供你处理。
            </AlertDescription>
          </Alert>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>无法导入</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {result ? (
            <Alert>
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>导入完成</AlertTitle>
              <AlertDescription>
                <span>已保存 {result.imported?.length ?? 0} 个出站。</span>
                {result.skipped?.length ? (
                  <span>另有 {result.skipped.length} 条未导入，请检查其链接格式或协议支持情况。</span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy || !source.trim()} onClick={() => void submit()}>
            <Upload data-icon="inline-start" />
            {busy ? '导入中…' : '开始导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
