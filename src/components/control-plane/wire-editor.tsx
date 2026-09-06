import * as React from 'react'
import { Braces, Save } from 'lucide-react'
import { toast } from 'sonner'
import { CatalogForm } from './catalog-form'
import type { CatalogValues } from './catalog-form'
import type { CatalogTab } from '@/lib/control-plane/catalog-types'
import { fromWire, toWire } from '@/lib/control-plane/xray-wire'
import type { JsonObject, WireContext } from '@/lib/control-plane/xray-wire'
import { catalogForProtocol } from '@/lib/control-plane/runtime-catalog'
import {
  configIssues,
  validateConfigFields,
} from '@/lib/control-plane/config-validation'
import type { ConfigIssue } from '@/lib/control-plane/config-validation'
import { getErrorMessage } from '@/hooks/use-admin-query'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { VlessEncryptionGenerator } from './vless-encryption-generator'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type WireEditorProps = {
  tabs: CatalogTab[]
  value: JsonObject
  kind?: string
  title: string
  description?: string
  onSave: (value: JsonObject) => Promise<void>
  navigationScope?: 'page' | 'container'
  headerActions?: React.ReactNode
  context?: WireContext
  onValidate?: (value: JsonObject) => Promise<unknown>
  errorPrefix?: string
  initialIssues?: Record<string, string[]>
}

function useWireForm({
  tabs,
  value,
  kind = '',
  title,
  description,
  onSave,
  navigationScope = 'page',
  context,
  onValidate,
  errorPrefix,
  initialIssues,
}: WireEditorProps) {
  const [values, setValues] = React.useState<CatalogValues>(() =>
    fromWire(tabs, value, kind, context),
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [issues, setIssues] = React.useState<ConfigIssue[]>(() =>
    initialIssues
      ? configIssues(
          { fieldErrors: initialIssues },
          tabs,
          fromWire(tabs, value, kind, context),
          errorPrefix,
        )
      : [],
  )
  const [focus, setFocus] = React.useState<
    { key: string; token: number } | undefined
  >(() => {
    const first =
      initialIssues &&
      configIssues(
        { fieldErrors: initialIssues },
        tabs,
        fromWire(tabs, value, kind, context),
        errorPrefix,
      ).find((issue) => issue.field)
    return first?.field ? { key: first.field, token: 1 } : undefined
  })
  const activeTabs = ['inbound', 'independent-inbound'].includes(kind)
    ? catalogForProtocol(tabs, values.protocol, {
        lockProtocol: kind === 'inbound',
      })
    : tabs
  const fieldErrors = Object.fromEntries(
    issues
      .filter((issue) => issue.field)
      .map((issue) => [issue.field!, issue.messages]),
  )
  function locate(key: string) {
    setFocus((current) => ({ key, token: (current?.token ?? 0) + 1 }))
  }
  async function submit(save: boolean) {
    setBusy(true)
    setError(null)
    setIssues([])
    try {
      validateConfigFields(activeTabs, values, kind)
      const next = toWire(tabs, values, value, kind, context)
      await onValidate?.(next)
      if (save) await onSave(next)
      toast.success(
        save ? '配置已保存' : onValidate ? '配置检查通过' : '配置格式正确',
      )
    } catch (cause) {
      const nextIssues = configIssues(cause, activeTabs, values, errorPrefix)
      setIssues(nextIssues)
      setError(getErrorMessage(cause))
      const first = nextIssues.find((issue) => issue.field)
      if (first?.field) locate(first.field)
    } finally {
      setBusy(false)
    }
  }
  const actions = (
    <ButtonGroup>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void submit(false)}
      >
        <Braces data-icon="inline-start" />
        {busy ? '检查中…' : '检查配置'}
      </Button>
      <Button disabled={busy} onClick={() => void submit(true)}>
        <Save data-icon="inline-start" />
        {busy ? '保存中…' : '保存配置'}
      </Button>
    </ButtonGroup>
  )
  const content = (
    <div className="min-w-0">
      {error || issues.length ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>配置检查未通过</AlertTitle>
          <AlertDescription>
            <ul className="flex min-w-0 flex-col gap-2">
              {issues.map((issue, index) => (
                <li key={issue.path + index} className="break-words">
                  {issue.field ? (
                    <button
                      type="button"
                      className="cursor-pointer text-left font-medium underline underline-offset-4"
                      onClick={() => locate(issue.field!)}
                    >
                      {issue.label}
                    </button>
                  ) : (
                    <span className="font-medium">{issue.label}</span>
                  )}
                  <span>：{issue.messages.join('；')}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <CatalogForm
        tabs={activeTabs}
        ariaLabel={`${title}分类`}
        values={values}
        onValuesChange={(next) => {
          if (next.protocol !== values.protocol) {
            setIssues([])
            if (next.protocol === 'hysteria')
              next = {
                ...next,
                'streamSettings.network': 'hysteria',
                'streamSettings.security': 'tls',
                'settings.version': 2,
                'streamSettings.hysteriaSettings.version': 2,
              }
            else if (
              values.protocol === 'hysteria' &&
              next['streamSettings.network'] === 'hysteria'
            )
              next = { ...next, 'streamSettings.network': 'tcp' }
          } else
            setIssues((current) =>
              current.filter(
                (issue) =>
                  issue.field && values[issue.field] === next[issue.field],
              ),
            )
          setError(null)
          setValues(next)
        }}
        errors={fieldErrors}
        focusRequest={focus}
        disabled={busy}
        sidebarStickyOffset={navigationScope}
        fieldActions={
          ['inbound', 'independent-inbound'].includes(kind) &&
          values.protocol === 'vless'
            ? {
                'settings.decryption': (
                  <VlessEncryptionGenerator
                    disabled={busy}
                    managed={kind === 'inbound'}
                    onApply={(pair) => {
                      setValues((current) => ({
                        ...current,
                        'settings.decryption': pair.decryption,
                        ...(kind === 'inbound'
                          ? { 'clientSettings.encryption': pair.encryption }
                          : {}),
                      }))
                    }}
                  />
                ),
              }
            : undefined
        }
      />
    </div>
  )
  return { actions, content, busy, title, description }
}

export function WireEditor(props: WireEditorProps) {
  const form = useWireForm(props)
  return (
    <Card className="min-w-0 gap-0 py-0 shadow-none">
      <CardHeader className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{props.title}</CardTitle>
            {props.description ? (
              <CardDescription className="mt-1">
                {props.description}
              </CardDescription>
            ) : null}
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {props.headerActions}
            {form.actions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 p-4">{form.content}</CardContent>
    </Card>
  )
}
export function WireDialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof WireEditor> & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <WireDialogContent {...props} onOpenChange={onOpenChange} />
      ) : null}
    </Dialog>
  )
}

function WireDialogContent({
  onOpenChange,
  ...props
}: WireEditorProps & {
  onOpenChange: (open: boolean) => void
}) {
  const form = useWireForm({
    ...props,
    navigationScope: 'container',
    onSave: async (value) => {
      await props.onSave(value)
      onOpenChange(false)
    },
  })
  return (
    <DialogContent
      className="max-h-[92dvh] sm:max-w-6xl"
      bodyClassName="min-w-0"
    >
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>
          {props.description ?? '编辑当前对象的配置。'}
        </DialogDescription>
      </DialogHeader>
      {form.content}
      <DialogFooter className="flex-row flex-wrap items-center justify-end">
        <Button
          variant="outline"
          disabled={form.busy}
          onClick={() => onOpenChange(false)}
        >
          取消
        </Button>
        {form.actions}
      </DialogFooter>
    </DialogContent>
  )
}
