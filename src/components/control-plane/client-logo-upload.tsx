import * as React from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Crop, ImagePlus, RotateCcw } from 'lucide-react'
import {
  cropClientLogo,
  logoCropBounds,
  validateLogoFile,
  CLIENT_LOGO_SIZE,
} from '@/lib/client-logo'
import { getErrorMessage } from '@/hooks/use-admin-query'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog'
import { DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'

function useFileUrl(file: File | null) {
  const [source, setSource] = React.useState<{
    file: File
    url: string
  } | null>(null)
  React.useEffect(() => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string')
        setSource({ file, url: reader.result })
    }
    reader.readAsDataURL(file)
    return () => {
      reader.onload = null
      if (reader.readyState === FileReader.LOADING) reader.abort()
    }
  }, [file])
  return source?.file === file ? source?.url : undefined
}

export function ClientLogoUpload({
  file,
  currentUrl,
  disabled,
  onChange,
}: {
  file: File | null
  currentUrl?: string | null
  disabled?: boolean
  onChange: (file: File | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const preview = useFileUrl(file)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-background p-1.5">
          {preview || currentUrl ? (
            <img
              className="size-full object-contain"
              src={preview || currentUrl || undefined}
              alt="客户端图标预览"
            />
          ) : (
            <ImagePlus
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0 text-sm">
          <p>
            {file ? '图标已准备好' : currentUrl ? '当前图标' : '尚未选择图标'}
          </p>
          <p className="text-xs text-muted-foreground">
            {file
              ? `${CLIENT_LOGO_SIZE} × ${CLIENT_LOGO_SIZE} · PNG · 保存后上传`
              : '正方形图标 · PNG'}
          </p>
        </div>
      </div>
      <ButtonGroup>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Crop data-icon="inline-start" />
          编辑并上传
        </Button>
        {file ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <RotateCcw data-icon="inline-start" />
            撤销替换
          </Button>
        ) : null}
      </ButtonGroup>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <LogoCropContent
            initialFile={file}
            onApply={(next) => {
              onChange(next)
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  )
}

function LogoCropContent({
  initialFile,
  onApply,
  onCancel,
}: {
  initialFile: File | null
  onApply: (file: File) => void
  onCancel: () => void
}) {
  const [file, setFile] = React.useState<File | null>(initialFile)
  const source = useFileUrl(file)
  const imageRef = React.useRef<HTMLImageElement>(null)
  const [crop, setCrop] = React.useState<PercentCrop>()
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function select(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      validateLogoFile(file)
      setLoaded(false)
      setCrop(undefined)
      setFile(file)
    } catch (cause) {
      setFile(null)
      setCrop(undefined)
      setLoaded(false)
      setError(getErrorMessage(cause))
    }
  }
  function resetCrop(image: HTMLImageElement) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, image.width, image.height),
      image.width,
      image.height,
    )
  }
  async function apply() {
    if (!loaded || !crop || !imageRef.current) return
    setBusy(true)
    setError('')
    try {
      const result = await cropClientLogo(imageRef.current, crop)
      if (mounted.current) onApply(result)
    } catch (cause) {
      if (mounted.current) setError(getErrorMessage(cause))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <DialogContent
      className="sm:max-w-2xl"
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
      }}
      onPointerDownOutside={(event) => {
        if (busy) event.preventDefault()
      }}
    >
      <DialogHeader>
        <DialogTitle>编辑客户端图标</DialogTitle>
        <DialogDescription>
          选择图片并调整正方形裁剪区域，自动转换为 256 × 256 PNG 图标。
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="client-logo-source">选择图片</FieldLabel>
          <Input
            id="client-logo-source"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            disabled={busy}
            onChange={(event) => {
              select(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <FieldDescription>
            支持 PNG、JPG、JPEG、WebP，最大 2 MiB、2000 万像素。
          </FieldDescription>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {source ? (
          <>
            <div className="flex min-w-0 justify-center overflow-hidden rounded-xl border bg-muted/40 p-2">
              <ReactCrop
                crop={crop}
                aspect={1}
                keepSelection
                disabled={busy || !loaded}
                onChange={(_, percent) => setCrop(percent)}
                ariaLabels={{
                  cropArea: '裁剪区域，使用方向键移动',
                  nwDragHandle: '左上角调整裁剪',
                  nDragHandle: '顶部调整裁剪',
                  neDragHandle: '右上角调整裁剪',
                  eDragHandle: '右侧调整裁剪',
                  seDragHandle: '右下角调整裁剪',
                  sDragHandle: '底部调整裁剪',
                  swDragHandle: '左下角调整裁剪',
                  wDragHandle: '左侧调整裁剪',
                }}
              >
                <img
                  ref={imageRef}
                  src={source}
                  alt="待裁剪的客户端图标"
                  className="block max-h-[40dvh] max-w-full object-contain"
                  onLoad={(event) => {
                    const image = event.currentTarget
                    try {
                      logoCropBounds(image.naturalWidth, image.naturalHeight, {
                        unit: '%',
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                      })
                      setCrop(resetCrop(image))
                      setLoaded(true)
                    } catch (cause) {
                      setError(getErrorMessage(cause))
                      setLoaded(false)
                    }
                  }}
                  onError={() => {
                    setLoaded(false)
                    setError('图片无法读取，请选择有效的图片文件。')
                  }}
                />
              </ReactCrop>
            </div>
            <p className="text-xs text-muted-foreground">
              拖动边框调整裁剪区域，或聚焦裁剪框后使用方向键。PNG
              透明背景会保留。
            </p>
          </>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
            <ImagePlus className="size-8" aria-hidden="true" />
            <p className="text-sm">选择图片后开始裁剪</p>
          </div>
        )}
      </div>
      <DialogFooter className="flex-row flex-wrap">
        <ButtonGroup>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="outline"
            disabled={busy || !loaded}
            onClick={() => {
              if (imageRef.current) setCrop(resetCrop(imageRef.current))
            }}
          >
            重置裁剪
          </Button>
          <Button
            disabled={busy || !loaded || !crop}
            onClick={() => void apply()}
          >
            {busy ? '转换中…' : '使用此图标'}
          </Button>
        </ButtonGroup>
      </DialogFooter>
    </DialogContent>
  )
}
