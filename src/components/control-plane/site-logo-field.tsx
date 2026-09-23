import * as React from 'react'
import { ClientLogoUpload } from '@/components/control-plane/client-logo-upload'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function SiteLogoField({ value, file, disabled, onValueChange, onFileChange, legend = '站点 Logo', description = '用于用户后台与管理后台的品牌标识。' }: {
  value: string
  file: File | null
  disabled: boolean
  legend?: string
  description?: string
  onValueChange: (value: string) => void
  onFileChange: (file: File | null) => void
}) {
  const [source, setSource] = React.useState('url')
  const sourceId = React.useId()
  const urlId = React.useId()
  return (
    <FieldSet className="min-w-0 rounded-2xl border p-4" disabled={disabled}>
      <FieldLegend>{legend}</FieldLegend>
      <div className="grid min-w-0 gap-4 @min-[34rem]/catalog-section:grid-cols-2">
        <Field className="min-w-0">
          <FieldLabel htmlFor={sourceId}>来源</FieldLabel>
          <Select value={source} disabled={disabled} onValueChange={next => { setSource(next); onFileChange(null) }}>
            <SelectTrigger id={sourceId} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="url">图片链接</SelectItem>
              <SelectItem value="upload">上传文件</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {source === 'url' ? (
          <Field className="min-w-0">
            <FieldLabel htmlFor={urlId}>Logo URL</FieldLabel>
            <Input id={urlId} value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)} placeholder="https://example.com/logo.png" />
          </Field>
        ) : (
          <Field className="min-w-0">
            <FieldLabel>图片文件</FieldLabel>
            <ClientLogoUpload label={legend} file={file} currentUrl={value} disabled={disabled} onChange={onFileChange} />
            <FieldDescription>点击选择图片并裁剪，保存配置时上传。未替换时保留已有 Logo。</FieldDescription>
          </Field>
        )}
      </div>
      <FieldDescription>{description}</FieldDescription>
    </FieldSet>
  )
}
