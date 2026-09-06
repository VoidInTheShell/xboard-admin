import * as React from 'react'
import { Copy, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage } from '@/hooks/use-admin-query'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { InputGroupButton } from '@/components/ui/input-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type VlessEncryptionPair = { decryption: string; encryption: string }

export function VlessEncryptionGenerator({
  disabled,
  managed,
  onApply,
}: {
  disabled?: boolean
  managed: boolean
  onApply: (pair: VlessEncryptionPair) => void
}) {
  const api = useAdminApi()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [pair, setPair] = React.useState<VlessEncryptionPair | null>(null)
  const [error, setError] = React.useState('')
  async function generate() {
    setBusy(true)
    setError('')
    setPair(null)
    try {
      setPair(
        await api.post<VlessEncryptionPair>(
          'server/xray/generateVlessEncryption',
        ),
      )
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <InputGroupButton
        disabled={disabled}
        size="sm"
        onClick={() => {
          setPair(null)
          setError('')
          setOpen(true)
        }}
      >
        <Shuffle data-icon="inline-start" />
        随机生成
      </InputGroupButton>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next)
            if (!next) setPair(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成 VLESS 加密参数</DialogTitle>
            <DialogDescription>
              生成配对的服务端解密和客户端加密参数。替换后，客户端需要更新连接配置。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">
              使用 X25519 身份验证与 ML-KEM-768
              混合密钥交换。服务端解密参数不会复制到客户端。
            </p>
            {pair ? (
              <Field>
                <FieldLabel htmlFor="generated-vless-encryption">
                  客户端 Encryption
                </FieldLabel>
                <Textarea
                  id="generated-vless-encryption"
                  value={pair.encryption}
                  readOnly
                  rows={4}
                  className="font-data text-xs"
                />
                <FieldDescription>
                  {managed
                    ? '应用时同时填写客户端参数；保存配置后，用户可更新订阅。'
                    : '请复制并保存此参数，连接此独立入站的客户端需要使用它。'}
                </FieldDescription>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(pair.encryption)
                      toast.success('客户端参数已复制')
                    } catch {
                      setError('无法访问剪贴板，请选择并复制上方参数。')
                    }
                  }}
                >
                  <Copy data-icon="inline-start" />
                  复制客户端参数
                </Button>
              </Field>
            ) : (
              <p className="text-sm">点击“生成参数”创建一组新的配对参数。</p>
            )}
          </div>
          <DialogFooter className="flex-row flex-wrap">
            <ButtonGroup>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPair(null)
                  setOpen(false)
                }}
              >
                取消
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? '生成中…' : pair ? '重新生成' : '生成参数'}
              </Button>
              <Button
                disabled={busy || !pair}
                onClick={() => {
                  if (pair) onApply(pair)
                  setOpen(false)
                  setPair(null)
                }}
              >
                应用参数
              </Button>
            </ButtonGroup>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
