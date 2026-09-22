import { Check, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ServerCertificate } from '@/lib/control-plane/certificate-types'

export function CertificateReferenceList({ record }: { record: ServerCertificate }) {
  if (!record.references.length) return <p className="text-sm text-muted-foreground">暂无配置引用，可以安全删除或编辑。</p>
  return <div className="flex flex-col gap-2"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" aria-hidden="true" />引用清单</div><div className="grid gap-2 md:grid-cols-2">{record.references.map((reference) => <div key={`${reference.target_type}:${reference.target_id}:${reference.usage}`} className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{reference.target_name}</span><Badge variant="outline">{reference.usage === 'server' ? '服务端' : reference.usage === 'client' ? '客户端' : '签发'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{reference.instance_name} · {reference.protocol} · {reference.target_type}</p></div>)}</div></div>
}

export function CertificateReferenceDialog({
  record,
  onOpenChange,
}: {
  record: ServerCertificate | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>无法删除：证书仍被引用</DialogTitle>
          <DialogDescription>
            先处理以下 {record?.references.length ?? 0} 个引用，再执行删除。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto">
          <CertificateReferenceList record={record as ServerCertificate} />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Check data-icon="inline-start" />
            知道了
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
