import * as React from 'react'
import { ImageIcon, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024

export function LoginBackgroundField({ value, file, disabled, onValueChange, onFileChange }: {
  value: string
  file: File | null
  disabled: boolean
  onValueChange: (value: string) => void
  onFileChange: (file: File | null) => void
}) {
  const [source, setSource] = React.useState('url')
  const [error, setError] = React.useState('')
  const sourceId = React.useId()
  const urlId = React.useId()
  const fileId = React.useId()
  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function selectFile(next: File | undefined) {
    setError('')
    if (!next) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) {
      setError('仅支持 PNG、JPG 或 WebP 图片。')
      return
    }
    if (next.size > MAX_BACKGROUND_BYTES) {
      setError('图片不能超过 8 MB。')
      return
    }
    onFileChange(next)
  }

  return (
    <FieldSet className="min-w-0 rounded-2xl border p-4" disabled={disabled}>
      <FieldLegend>登录页背景图片</FieldLegend>
      <div className="grid min-w-0 gap-4 @min-[34rem]/catalog-section:grid-cols-2">
        <Field className="min-w-0">
          <FieldLabel htmlFor={sourceId}>来源</FieldLabel>
          <Select value={source} disabled={disabled} onValueChange={next => { setSource(next); setError(''); onFileChange(null) }}>
            <SelectTrigger id={sourceId} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="url">图片链接</SelectItem>
              <SelectItem value="upload">上传文件</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {source === 'url' ? (
          <Field className="min-w-0">
            <FieldLabel htmlFor={urlId}>背景图片 URL</FieldLabel>
            <Input id={urlId} value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)} placeholder="https://example.com/background.jpg" />
          </Field>
        ) : (
          <Field className="min-w-0">
            <FieldLabel htmlFor={fileId}>图片文件</FieldLabel>
            <Input id={fileId} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={disabled} onChange={event => { selectFile(event.target.files?.[0]); event.target.value = '' }} />
            <FieldDescription>支持 PNG、JPG、WebP，最大 8 MB；保存配置时上传。未替换时保留已有背景。</FieldDescription>
          </Field>
        )}
      </div>
      {(previewUrl || value) ? (
        <div className="mt-3 overflow-hidden rounded-xl border">
          <img src={previewUrl || value} alt="登录页背景预览" className="h-32 w-full object-cover" />
        </div>
      ) : (
        <div className="mt-3 flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
          <ImageIcon className="size-8" aria-hidden="true" />
          <p className="text-sm">尚未设置背景，登录页使用默认深色背景</p>
        </div>
      )}
      {file ? (
        <ButtonGroup className="mt-3">
          <Button variant="outline" disabled={disabled} onClick={() => onFileChange(null)}>
            <RotateCcw data-icon="inline-start" />
            撤销替换
          </Button>
        </ButtonGroup>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive" role="alert">{error}</p> : null}
      <FieldDescription>整页铺展显示，登录框会叠加毛玻璃效果；建议横向、主体居中的大图。</FieldDescription>
    </FieldSet>
  )
}
