import * as React from "react"
import {
  AlertCircle,
  Check,
  Eye,
  FileCode2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ConfirmActionDialog } from "@/components/control-plane/confirm-action-dialog"
import { ResourceError } from "@/components/control-plane/resource-states"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { getErrorMessage, useAdminQuery } from "@/hooks/use-admin-query"
import { ApiError } from "@/lib/api"
import type { ConfigGroups } from "@/lib/config-settings"
import { useAdminApi, useAuth } from "@/lib/auth"

const ConfigEditor = React.lazy(() =>
  import("@/components/ui/config-editor").then((module) => ({ default: module.ConfigEditor })),
)

type TemplateSummary = {
  name: string
  label: string
  customized: boolean
  subject?: string | null
  updated_at?: number | string | null
}

type TemplateDetail = {
  name: string
  label: string
  required_vars: string[]
  optional_vars: string[]
  customized: boolean
  subject: string
  content: string
}

type MailTestResponse = {
  data?: {
    error?: string | null
  }
}

type MailSettingsValues = {
  email_host: string
  email_port: number | ""
  email_username: string
  email_password: string
  email_encryption: string
  email_from_address: string
  remind_mail_enable: boolean
}

type MailSettingsKey = keyof MailSettingsValues
type MailSection = "settings" | "templates"

const defaultMailSettings: MailSettingsValues = {
  email_host: "",
  email_port: 465,
  email_username: "",
  email_password: "",
  email_encryption: "ssl",
  email_from_address: "",
  remind_mail_enable: false,
}

const templatePreviewVars: Record<string, string> = {
  name: "XBoard",
  code: "123456",
  content: "这是一封测试通知邮件。",
  url: "https://example.com",
  link: "https://example.com/login?token=preview",
}

export function MailPage() {
  const api = useAdminApi()
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection: MailSection = searchParams.get("section") === "settings" ? "settings" : "templates"

  const listQuery = useAdminQuery(
    React.useCallback(
      (signal: AbortSignal) => api.get<TemplateSummary[]>("mail/template/list", undefined, signal),
      [api],
    ),
  )
  const [selectedName, setSelectedName] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<TemplateDetail | null>(null)
  const [baseline, setBaseline] = React.useState<{ subject: string; content: string } | null>(null)
  const [subject, setSubject] = React.useState("")
  const [content, setContent] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [savingTemplate, setSavingTemplate] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [testOpen, setTestOpen] = React.useState(false)
  const [testEmail, setTestEmail] = React.useState(session?.email ?? "")
  const [testConfirmOpen, setTestConfirmOpen] = React.useState(false)
  const [pendingTemplateName, setPendingTemplateName] = React.useState<string | null>(null)

  const [mailSettings, setMailSettings] = React.useState<MailSettingsValues | null>(null)
  const [mailSettingsBaseline, setMailSettingsBaseline] = React.useState<MailSettingsValues | null>(null)
  const [mailSettingsErrors, setMailSettingsErrors] = React.useState<Record<string, string[]>>({})
  const [mailSettingsError, setMailSettingsError] = React.useState<string | null>(null)
  const [loadingMailSettings, setLoadingMailSettings] = React.useState(true)
  const [savingMailSettings, setSavingMailSettings] = React.useState(false)
  const [mailSettingsReload, setMailSettingsReload] = React.useState(0)
  const [mailSettingsTestOpen, setMailSettingsTestOpen] = React.useState(false)
  const [testingMailSettings, setTestingMailSettings] = React.useState(false)

  const summaries = React.useMemo(() => listQuery.data ?? [], [listQuery.data])
  const dirty = Boolean(baseline && (baseline.subject !== subject || baseline.content !== content))
  const mailSettingsPayload = React.useMemo(
    () => createMailSettingsPayload(mailSettings, mailSettingsBaseline),
    [mailSettings, mailSettingsBaseline],
  )
  const mailSettingsDirtyCount = Object.keys(mailSettingsPayload).length

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedName && summaries[0]) setSelectedName(summaries[0].name)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedName, summaries])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedName) void loadTemplateDetail(api, selectedName, setLoadingDetail, setDetailError, setErrors, setDetail, setSubject, setContent, setBaseline)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [api, selectedName])

  React.useEffect(() => {
    const controller = new AbortController()

    async function loadMailSettings() {
      setLoadingMailSettings(true)
      setMailSettingsError(null)
      setMailSettingsErrors({})

      try {
        const groups = await api.get<ConfigGroups>("config/fetch", undefined, controller.signal)
        const next = normalizeMailSettings(groups)
        setMailSettings(next)
        setMailSettingsBaseline(next)
      } catch (error) {
        if (!controller.signal.aborted) setMailSettingsError(getErrorMessage(error, "邮件基本设置读取失败。"))
      } finally {
        if (!controller.signal.aborted) setLoadingMailSettings(false)
      }
    }

    void loadMailSettings()
    return () => controller.abort()
  }, [api, mailSettingsReload])

  async function saveTemplate() {
    if (!detail) return
    setSavingTemplate(true)
    setErrors({})
    try {
      await api.post<boolean>("mail/template/save", { name: detail.name, subject: subject.trim(), content })
      toast.success("邮件模板已保存")
      await loadTemplateDetail(api, detail.name, setLoadingDetail, setDetailError, setErrors, setDetail, setSubject, setContent, setBaseline)
      listQuery.reload()
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, "邮件模板保存失败。"))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function resetTemplate() {
    if (!detail) return
    setSavingTemplate(true)
    try {
      await api.post<boolean>("mail/template/reset", { name: detail.name })
      toast.success("已恢复后端默认邮件模板")
      setResetOpen(false)
      await loadTemplateDetail(api, detail.name, setLoadingDetail, setDetailError, setErrors, setDetail, setSubject, setContent, setBaseline)
      listQuery.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "邮件模板重置失败。"))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function sendTest() {
    if (!detail) return
    setSavingTemplate(true)
    try {
      await api.post<boolean>("mail/template/test", { name: detail.name, email: testEmail.trim() })
      toast.success("测试邮件已发送")
      setTestConfirmOpen(false)
      setTestOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error, "测试邮件发送失败。"))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function saveMailSettings() {
    if (!mailSettings || !mailSettingsBaseline || !mailSettingsDirtyCount) return
    setSavingMailSettings(true)
    setMailSettingsErrors({})

    try {
      await api.post<boolean>("config/save", mailSettingsPayload)
      toast.success(`已保存 ${mailSettingsDirtyCount} 项邮件配置，正在重新读取确认。`)
      setMailSettingsReload((current) => current + 1)
    } catch (error) {
      if (error instanceof ApiError) setMailSettingsErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, "邮件基本设置保存失败。"))
    } finally {
      setSavingMailSettings(false)
    }
  }

  async function sendMailSettingsTest() {
    if (!mailSettingsBaseline || mailSettingsDirtyCount || !session?.email) return

    setTestingMailSettings(true)
    try {
      const result = await api.post<MailTestResponse>("config/testSendMail")
      const deliveryError = result.data?.error
      if (deliveryError) throw new Error(`发送失败：${deliveryError}`)

      toast.success(`测试邮件已发送至 ${session.email}`)
      setMailSettingsTestOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error, "测试邮件发送失败。"))
    } finally {
      setTestingMailSettings(false)
    }
  }

  function selectTemplate(name: string) {
    if (name === selectedName) {
      selectSection("templates")
      return
    }
    if (dirty) {
      setPendingTemplateName(name)
      return
    }
    setSelectedName(name)
    selectSection("templates")
  }

  function selectSection(section: MailSection) {
    const next = new URLSearchParams(searchParams)
    next.set("section", section)
    setSearchParams(next, { replace: true })
  }

  const pageAction = activeSection === "settings" ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge variant={mailSettingsDirtyCount ? "outline" : "secondary"} className="font-data text-[10px]">
        {mailSettingsDirtyCount ? `${mailSettingsDirtyCount} 项待保存` : "已与后端同步"}
      </Badge>
      <Button
        variant="outline"
        disabled={!mailSettingsBaseline || !session?.email || loadingMailSettings || savingMailSettings || testingMailSettings}
        title={mailSettingsDirtyCount ? "请先保存当前邮件设置" : undefined}
        onClick={() => setMailSettingsTestOpen(true)}
      >
        <Send data-icon="inline-start" aria-hidden="true" />发送测试邮件
      </Button>
      <Button disabled={!mailSettingsBaseline || !mailSettingsDirtyCount || savingMailSettings || loadingMailSettings} onClick={() => void saveMailSettings()}>
        {savingMailSettings ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : mailSettingsDirtyCount ? <Save data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
        {savingMailSettings ? "保存中" : "保存邮件设置"}
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" disabled={!detail || savingTemplate} onClick={() => setTestOpen(true)}>
        <Send data-icon="inline-start" aria-hidden="true" />发送测试
      </Button>
      <Button variant="ghost" disabled={!detail?.customized || savingTemplate} onClick={() => setResetOpen(true)}>
        <RefreshCw data-icon="inline-start" aria-hidden="true" />恢复默认
      </Button>
      <Button disabled={!dirty || savingTemplate || !detail} onClick={() => void saveTemplate()}>
        {savingTemplate ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : dirty ? <Save data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
        {savingTemplate ? "保存中" : "保存模板"}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="邮件配置"
        description="集中管理 SMTP 传输、通知开关和五类系统邮件模板；敏感凭据只写入，不在管理端回显。"
        action={pageAction}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <MailSectionNavigation
          activeSection={activeSection}
          summaries={summaries}
          selectedName={selectedName}
          loading={listQuery.loading}
          onSelectSettings={() => selectSection("settings")}
          onSelectTemplate={selectTemplate}
        />
        <main className="min-w-0">
          {activeSection === "settings" ? (
            <MailSettingsPanel
              values={mailSettings}
              errors={mailSettingsErrors}
              loading={loadingMailSettings}
              loadError={mailSettingsError}
              disabled={savingMailSettings || loadingMailSettings}
              onRetry={() => setMailSettingsReload((current) => current + 1)}
              onChange={(key, value) => {
                setMailSettings((current) => current ? { ...current, [key]: value } : current)
                if (Object.keys(mailSettingsErrors).length) setMailSettingsErrors({})
              }}
            />
          ) : (
            <MailTemplatesPanel
              listQuery={listQuery}
              detail={detail}
              subject={subject}
              content={content}
              errors={errors}
              detailError={detailError}
              loadingDetail={loadingDetail}
              saving={savingTemplate}
              dirty={dirty}
              onSubjectChange={setSubject}
              onContentChange={setContent}
              onRetry={() => selectedName && void loadTemplateDetail(api, selectedName, setLoadingDetail, setDetailError, setErrors, setDetail, setSubject, setContent, setBaseline)}
            />
          )}
        </main>
      </div>

      <MailSettingsTestDialog
        open={mailSettingsTestOpen}
        onOpenChange={setMailSettingsTestOpen}
        adminEmail={session?.email ?? ""}
        dirty={Boolean(mailSettingsDirtyCount)}
        busy={testingMailSettings}
        onConfirm={sendMailSettingsTest}
      />

      <DialogSet
        detail={detail}
        dirty={dirty}
        saving={savingTemplate}
        resetOpen={resetOpen}
        setResetOpen={setResetOpen}
        testOpen={testOpen}
        setTestOpen={setTestOpen}
        testEmail={testEmail}
        setTestEmail={setTestEmail}
        testConfirmOpen={testConfirmOpen}
        setTestConfirmOpen={setTestConfirmOpen}
        pendingTemplateName={pendingTemplateName}
        setPendingTemplateName={setPendingTemplateName}
        onSelectTemplate={(name) => {
          setSelectedName(name)
          selectSection("templates")
        }}
        onSendTest={sendTest}
        onReset={resetTemplate}
      />
    </div>
  )
}

function MailSettingsTestDialog({
  open,
  onOpenChange,
  adminEmail,
  dirty,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  adminEmail: string
  dirty: boolean
  busy: boolean
  onConfirm: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送测试邮件</DialogTitle>
          <DialogDescription>使用当前已保存的 SMTP 设置发送一封真实测试邮件，收件地址为当前登录管理员邮箱。</DialogDescription>
        </DialogHeader>
        {dirty ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>存在未保存的邮件设置</AlertTitle>
            <AlertDescription>请先保存邮件基本设置，再发送测试邮件以验证最新配置。</AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="mail-settings-test-email">收件邮箱</FieldLabel>
          <Input id="mail-settings-test-email" type="email" value={adminEmail} readOnly aria-readonly="true" />
          <FieldDescription>收件地址由当前登录管理员账号确定，无法在此处修改。</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={dirty || !adminEmail || busy} onClick={() => void onConfirm()}>
            {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : <Send data-icon="inline-start" aria-hidden="true" />}
            {busy ? "发送中" : "发送测试邮件"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MailSectionNavigation({ activeSection, summaries, selectedName, loading, onSelectSettings, onSelectTemplate }: { activeSection: MailSection; summaries: TemplateSummary[]; selectedName: string | null; loading: boolean; onSelectSettings: () => void; onSelectTemplate: (name: string) => void }) {
  return (
    <aside className="self-start overflow-y-auto rounded-2xl border bg-card p-2 shadow-none overscroll-contain lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)]" aria-label="邮件配置菜单">
      <div className="hidden px-2.5 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground lg:block">邮件配置</div>
      <nav className="flex flex-col gap-1" aria-label="邮件配置分组">
        <MailNavigationButton active={activeSection === "settings"} icon={Settings2} title="邮件基本设置" description="SMTP 与通知" onClick={onSelectSettings} />
        <div className="mx-2 my-1 border-t" />
        <div className="px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">系统模板</div>
        {loading ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-14 rounded-xl" />) : summaries.map((item) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={activeSection === "templates" && selectedName === item.name}
            onClick={() => onSelectTemplate(item.name)}
            className={`group/mail-section flex min-h-14 w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-accent/75 hover:shadow-xs active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${activeSection === "templates" && selectedName === item.name ? "border-border bg-background shadow-sm" : "border-transparent"}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-aria-pressed/mail-section:bg-primary group-aria-pressed/mail-section:text-primary-foreground"><FileCode2 className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="mt-0.5 block truncate font-data text-[10px] text-muted-foreground">{item.name}</span>
            </span>
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30 group-aria-pressed/mail-section:bg-primary" aria-label={item.customized ? "已自定义" : "默认模板"} />
          </button>
        ))}
      </nav>
    </aside>
  )
}

function MailNavigationButton({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: LucideIcon; title: string; description: string; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`group/mail-section flex min-h-14 w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-accent/75 hover:shadow-xs active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${active ? "border-border bg-background shadow-sm" : "border-transparent"}`}><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-aria-pressed/mail-section:bg-primary group-aria-pressed/mail-section:text-primary-foreground"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span></span></button>
}

function MailSettingsPanel({
  values,
  errors,
  loading,
  loadError,
  disabled,
  onRetry,
  onChange,
}: {
  values: MailSettingsValues | null
  errors: Record<string, string[]>
  loading: boolean
  loadError: string | null
  disabled: boolean
  onRetry: () => void
  onChange: (key: MailSettingsKey, value: MailSettingsValues[MailSettingsKey]) => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-5 sm:px-6">
        <CardTitle>邮件基本设置</CardTitle>
        <CardDescription className="mt-1">配置系统发送邮件使用的 SMTP 连接和通知开关。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>敏感凭据保护</AlertTitle>
          <AlertDescription>SMTP 密码在界面上始终留空。保存时留空会保留后端当前密码，只有主动填写新密码时才会写入。</AlertDescription>
        </Alert>

        {loadError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>邮件基本设置读取失败</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={onRetry}>重新读取</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading && !values ? <MailSettingsSkeleton /> : values ? <MailSettingsFields values={values} errors={errors} disabled={disabled} onChange={onChange} /> : null}
      </CardContent>
    </Card>
  )
}

function MailSettingsFields({
  values,
  errors,
  disabled,
  onChange,
}: {
  values: MailSettingsValues
  errors: Record<string, string[]>
  disabled: boolean
  onChange: (key: MailSettingsKey, value: MailSettingsValues[MailSettingsKey]) => void
}) {
  const fieldErrors = (key: MailSettingsKey) => errors[key]?.map((message) => ({ message }))

  return (
    <FieldGroup className="grid items-start gap-5 sm:grid-cols-2">
      <Field data-invalid={Boolean(errors.email_host)}>
        <FieldLabel htmlFor="mail-setting-host">SMTP 主机</FieldLabel>
        <Input id="mail-setting-host" value={values.email_host} placeholder="smtp.example.com" disabled={disabled} aria-invalid={Boolean(errors.email_host)} onChange={(event) => onChange("email_host", event.target.value)} />
        <FieldDescription>填写邮件服务商提供的 SMTP 主机名。</FieldDescription>
        <FieldError errors={fieldErrors("email_host")} />
      </Field>

      <Field data-invalid={Boolean(errors.email_port)}>
        <FieldLabel htmlFor="mail-setting-port">SMTP 端口</FieldLabel>
        <Input id="mail-setting-port" type="number" min={1} max={65535} inputMode="numeric" value={values.email_port} placeholder="465" disabled={disabled} aria-invalid={Boolean(errors.email_port)} onChange={(event) => onChange("email_port", event.target.value === "" ? "" : Number(event.target.value))} />
        <FieldDescription>常见端口为 465（SSL）或 587（TLS）。</FieldDescription>
        <FieldError errors={fieldErrors("email_port")} />
      </Field>

      <Field data-invalid={Boolean(errors.email_username)}>
        <FieldLabel htmlFor="mail-setting-username">SMTP 用户名</FieldLabel>
        <Input id="mail-setting-username" value={values.email_username} autoComplete="username" disabled={disabled} aria-invalid={Boolean(errors.email_username)} onChange={(event) => onChange("email_username", event.target.value)} />
        <FieldError errors={fieldErrors("email_username")} />
      </Field>

      <Field data-invalid={Boolean(errors.email_password)}>
        <FieldLabel htmlFor="mail-setting-password">SMTP 密码</FieldLabel>
        <Input id="mail-setting-password" type="password" autoComplete="new-password" placeholder="留空以保留当前密码" value={values.email_password} disabled={disabled} aria-invalid={Boolean(errors.email_password)} onChange={(event) => onChange("email_password", event.target.value)} />
        <FieldDescription>已保存密码不会回显；清空后保存不会覆盖后端值。</FieldDescription>
        <FieldError errors={fieldErrors("email_password")} />
      </Field>

      <Field data-invalid={Boolean(errors.email_encryption)}>
        <FieldLabel htmlFor="mail-setting-encryption">加密方式</FieldLabel>
        <Select value={values.email_encryption} disabled={disabled} onValueChange={(value) => onChange("email_encryption", value)}>
          <SelectTrigger id="mail-setting-encryption" className="w-full" aria-invalid={Boolean(errors.email_encryption)}><SelectValue placeholder="选择加密方式" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">无加密</SelectItem>
              <SelectItem value="ssl">SSL</SelectItem>
              <SelectItem value="tls">TLS</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>请与 SMTP 服务商要求的端口和加密方式保持一致。</FieldDescription>
        <FieldError errors={fieldErrors("email_encryption")} />
      </Field>

      <Field data-invalid={Boolean(errors.email_from_address)}>
        <FieldLabel htmlFor="mail-setting-from">发件人地址</FieldLabel>
        <Input id="mail-setting-from" type="email" autoComplete="email" value={values.email_from_address} placeholder="no-reply@example.com" disabled={disabled} aria-invalid={Boolean(errors.email_from_address)} onChange={(event) => onChange("email_from_address", event.target.value)} />
        <FieldDescription>留空时由邮件服务的默认发件人策略决定。</FieldDescription>
        <FieldError errors={fieldErrors("email_from_address")} />
      </Field>

      <Field orientation="horizontal" className="min-h-20 rounded-2xl border bg-background p-4 sm:col-span-2" data-invalid={Boolean(errors.remind_mail_enable)}>
        <div className="min-w-0 flex-1 space-y-1">
          <FieldLabel htmlFor="mail-setting-reminder">邮件提醒</FieldLabel>
          <FieldDescription>向用户发送到期和流量使用提醒。</FieldDescription>
          <FieldError errors={fieldErrors("remind_mail_enable")} />
        </div>
        <Switch className="shrink-0" id="mail-setting-reminder" checked={values.remind_mail_enable} disabled={disabled} aria-invalid={Boolean(errors.remind_mail_enable)} onCheckedChange={(checked) => onChange("remind_mail_enable", checked)} />
      </Field>
    </FieldGroup>
  )
}

function MailSettingsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2" aria-label="正在读取邮件基本设置">
      {Array.from({ length: 7 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /><Skeleton className="h-4 w-4/5" /></div>)}
    </div>
  )
}

function MailTemplatesPanel({
  listQuery,
  detail,
  subject,
  content,
  errors,
  detailError,
  loadingDetail,
  saving,
  dirty,
  onSubjectChange,
  onContentChange,
  onRetry,
}: {
  listQuery: ReturnType<typeof useAdminQuery<TemplateSummary[]>>
  detail: TemplateDetail | null
  subject: string
  content: string
  errors: Record<string, string[]>
  detailError: string | null
  loadingDetail: boolean
  saving: boolean
  dirty: boolean
  onSubjectChange: (value: string) => void
  onContentChange: (value: string) => void
  onRetry: () => void
}) {
  return (
    <section className="min-w-0">
        {listQuery.error ? (
          <ResourceError title="邮件模板列表读取失败" message={listQuery.error} onRetry={listQuery.reload} />
        ) : detailError ? (
          <ResourceError title="模板读取失败" message={detailError} onRetry={onRetry} />
        ) : loadingDetail || !detail ? (
          <TemplateEditorSkeleton />
        ) : (
          <Card className="min-w-0 gap-0 py-0 shadow-none">
            <CardHeader className="border-b px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Mail className="size-5" aria-hidden="true" /></div>
                <div className="min-w-0">
                  <CardTitle>{detail.label}</CardTitle>
                  <CardDescription className="mt-1">模板键：<span className="font-data">{detail.name}</span>{dirty ? <span className="ml-2 text-amber-700 dark:text-amber-300">· 有未保存修改</span> : null}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <FieldGroup>
                <Field data-invalid={Boolean(errors.subject)}>
                  <FieldLabel htmlFor="mail-subject">邮件主题</FieldLabel>
                  <Input id="mail-subject" value={subject} disabled={saving} aria-invalid={Boolean(errors.subject)} onChange={(event) => onSubjectChange(event.target.value)} />
                  <FieldError errors={errors.subject?.map((message) => ({ message }))} />
                </Field>

                <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
                  <Field className="min-w-0" data-invalid={Boolean(errors.content)}>
                    <React.Suspense fallback={<TemplateEditorFallback />}>
                      <ConfigEditor
                        label="正文模板"
                        language="html"
                        rows={18}
                        placeholder="输入邮件 HTML 正文…"
                        value={content}
                        onChange={onContentChange}
                        disabled={saving}
                      />
                    </React.Suspense>
                    <FieldDescription>使用 HTML 模式编辑；模板变量保持原样，由后端在发送时安全替换。</FieldDescription>
                    <FieldError errors={errors.content?.map((message) => ({ message }))} />
                  </Field>
                  <MailPreview subject={subject} content={content} />
                </div>

                <TemplateVariables detail={detail} />
              </FieldGroup>
            </CardContent>
          </Card>
        )}
    </section>
  )
}

function TemplateVariables({ detail }: { detail: TemplateDetail }) {
  const required = detail.required_vars ?? []
  const optional = detail.optional_vars ?? []

  return (
    <section className="rounded-2xl border bg-muted/20 p-4" aria-labelledby="mail-template-variables">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="mail-template-variables" className="text-sm font-medium">可用模板变量</h3>
          <p className="mt-1 text-xs text-muted-foreground">必要变量由后端在保存时校验，发送时由后端注入实际值。</p>
        </div>
        <Badge variant="outline" className="gap-1 font-normal"><Eye className="size-3.5" aria-hidden="true" />仅用于提示</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {required.map((variable) => <Badge key={`required-${variable}`} variant="destructive" className="font-data">{`{{${variable}}}`} · 必填</Badge>)}
        {optional.map((variable) => <Badge key={`optional-${variable}`} variant="secondary" className="font-data">{`{{${variable}}}`} · 可选</Badge>)}
        {!required.length && !optional.length ? <span className="text-sm text-muted-foreground">此模板没有额外变量。</span> : null}
      </div>
    </section>
  )
}

function MailPreview({ subject, content }: { subject: string; content: string }) {
  const previewSubject = React.useMemo(() => replacePreviewVars(subject), [subject])
  const previewDocument = React.useMemo(() => buildPreviewDocument(content), [content])

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-card" aria-labelledby="mail-preview-title">
      <div className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            <h3 id="mail-preview-title" className="text-sm font-medium">实时预览</h3>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">主题：{previewSubject || "未填写"}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1 font-normal"><ShieldCheck className="size-3.5" aria-hidden="true" />沙箱预览</Badge>
      </div>
      <div className="bg-muted/35 p-3 sm:p-4">
        <iframe
          title="邮件正文实时预览"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={previewDocument}
          className="h-[28rem] w-full rounded-xl border bg-background"
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">已禁用脚本、表单、外部资源和任意页面跳转。</p>
      </div>
    </section>
  )
}

function TemplateEditorSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-none" aria-label="正在读取邮件模板">
      <CardHeader className="border-b px-5 py-5"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /></CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6"><Skeleton className="h-10 w-full" /><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-[28rem] w-full" /><Skeleton className="h-[28rem] w-full" /></div><Skeleton className="h-24 w-full" /></CardContent>
    </Card>
  )
}

function TemplateEditorFallback() {
  return <div className="overflow-hidden rounded-2xl border bg-card shadow-xs"><div className="h-24 animate-pulse border-b bg-muted/50 motion-reduce:animate-none" /><div className="h-[28rem] animate-pulse bg-[#1e1e1e] motion-reduce:animate-none" /></div>
}

function DialogSet({
  detail,
  dirty,
  saving,
  resetOpen,
  setResetOpen,
  testOpen,
  setTestOpen,
  testEmail,
  setTestEmail,
  testConfirmOpen,
  setTestConfirmOpen,
  pendingTemplateName,
  setPendingTemplateName,
  onSelectTemplate,
  onSendTest,
  onReset,
}: {
  detail: TemplateDetail | null
  dirty: boolean
  saving: boolean
  resetOpen: boolean
  setResetOpen: (open: boolean) => void
  testOpen: boolean
  setTestOpen: (open: boolean) => void
  testEmail: string
  setTestEmail: (email: string) => void
  testConfirmOpen: boolean
  setTestConfirmOpen: (open: boolean) => void
  pendingTemplateName: string | null
  setPendingTemplateName: (name: string | null) => void
  onSelectTemplate: (name: string) => void
  onSendTest: () => Promise<void>
  onReset: () => Promise<void>
}) {
  return (
    <>
      <Dialog open={testOpen} onOpenChange={(open) => !saving && setTestOpen(open)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>发送测试邮件</DialogTitle><DialogDescription>后端使用预设测试变量和当前已保存模板发送真实邮件。未保存的编辑内容不会包含在测试中。</DialogDescription></DialogHeader>{dirty ? <Alert variant="destructive"><AlertTitle>存在未保存修改</AlertTitle><AlertDescription>请先保存模板，再发送测试以验证最新内容。</AlertDescription></Alert> : null}<Field><FieldLabel htmlFor="test-mail-email">收件邮箱</FieldLabel><Input id="test-mail-email" type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setTestOpen(false)}>取消</Button><Button disabled={dirty || !testEmail.trim()} onClick={() => setTestConfirmOpen(true)}>检查并确认</Button></DialogFooter></DialogContent></Dialog>
      <ConfirmActionDialog open={testConfirmOpen} onOpenChange={setTestConfirmOpen} title={`向 ${testEmail || "指定邮箱"} 发送真实测试邮件？`} description="这会立即调用当前邮件服务并发送一封真实邮件，不是前端预览。测试内容使用后端安全样例变量。" confirmLabel="发送测试邮件" busy={saving} onConfirm={onSendTest} />
      <ConfirmActionDialog open={resetOpen} onOpenChange={setResetOpen} title={`恢复“${detail?.label ?? ""}”默认模板？`} description="数据库中的自定义主题与正文会被删除，随后恢复当前后端版本内置的默认内容。该自定义版本无法从管理端找回。" confirmLabel="恢复默认" destructive busy={saving} onConfirm={onReset} />
      <ConfirmActionDialog open={Boolean(pendingTemplateName)} onOpenChange={(open) => !open && setPendingTemplateName(null)} title="放弃当前未保存修改？" description="切换模板会丢弃当前主题和正文中的未保存修改。已保存的后端模板不会受到影响。" confirmLabel="放弃并切换" destructive onConfirm={() => { if (pendingTemplateName) onSelectTemplate(pendingTemplateName); setPendingTemplateName(null) }} />
    </>
  )
}

async function loadTemplateDetail(
  api: ReturnType<typeof useAdminApi>,
  name: string,
  setLoadingDetail: (value: boolean) => void,
  setDetailError: (value: string | null) => void,
  setErrors: (value: Record<string, string[]>) => void,
  setDetail: (value: TemplateDetail | null) => void,
  setSubject: (value: string) => void,
  setContent: (value: string) => void,
  setBaseline: (value: { subject: string; content: string } | null) => void,
) {
  setLoadingDetail(true)
  setDetailError(null)
  setErrors({})
  try {
    const next = await api.get<TemplateDetail>("mail/template/get", { name })
    setDetail(next)
    setSubject(next.subject)
    setContent(next.content)
    setBaseline({ subject: next.subject, content: next.content })
  } catch (error) {
    setDetailError(getErrorMessage(error, "邮件模板读取失败。"))
  } finally {
    setLoadingDetail(false)
  }
}

function normalizeMailSettings(groups: ConfigGroups): MailSettingsValues {
  const source = isRecord(groups.email) ? groups.email : {}
  const port = Number(source.email_port)

  return {
    email_host: stringValue(source.email_host),
    email_port: Number.isFinite(port) && port > 0 ? port : defaultMailSettings.email_port,
    email_username: stringValue(source.email_username),
    // Never copy the backend password into React state or the DOM.
    email_password: "",
    email_encryption: stringValue(source.email_encryption) || defaultMailSettings.email_encryption,
    email_from_address: stringValue(source.email_from_address),
    remind_mail_enable: booleanValue(source.remind_mail_enable),
  }
}

function createMailSettingsPayload(values: MailSettingsValues | null, baseline: MailSettingsValues | null) {
  if (!values || !baseline) return {}

  const payload: Record<string, unknown> = {}
  const keys: Array<Exclude<MailSettingsKey, "email_password">> = [
    "email_host",
    "email_port",
    "email_username",
    "email_encryption",
    "email_from_address",
    "remind_mail_enable",
  ]

  for (const key of keys) {
    if (!areMailSettingValuesEqual(values[key], baseline[key])) payload[key] = values[key]
  }

  if (values.email_password.trim()) payload.email_password = values.email_password
  return payload
}

function replacePreviewVars(value: string) {
  return value.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (_match, key: string) => templatePreviewVars[key] ?? `{{${key}}}`)
}

function buildPreviewDocument(content: string) {
  const rendered = replacePreviewVars(content)
  const safeContent = sanitizePreviewHtml(rendered) || `<p class="empty">还没有正文内容。</p>`

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <title>邮件正文预览</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body { padding: 24px; background: #ffffff; color: #18181b; overflow-wrap: anywhere; }
      .empty { margin: 0; color: #71717a; font-size: 14px; text-align: center; }
      @media (max-width: 520px) { body { padding: 16px; } }
    </style>
  </head>
  <body>${safeContent}</body>
</html>`
}

function sanitizePreviewHtml(source: string) {
  if (typeof DOMParser === "undefined") return escapeHtml(source)

  const document = new DOMParser().parseFromString(source, "text/html")
  const blockedTags = new Set(["base", "embed", "form", "iframe", "link", "meta", "object", "script", "style", "svg", "template"])
  const blockedAttributes = new Set(["action", "background", "cite", "data", "formaction", "href", "poster", "src", "srcset", "target", "xlink:href"])

  document.querySelectorAll("*").forEach((element) => {
    if (blockedTags.has(element.tagName.toLowerCase())) {
      element.remove()
      return
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      if (name.startsWith("on") || blockedAttributes.has(name)) {
        element.removeAttribute(attribute.name)
        return
      }
      if (name === "style") {
        element.setAttribute("style", attribute.value.replace(/@import[^;]+;?/gi, "").replace(/url\s*\([^)]*\)/gi, "").replace(/expression\s*\([^)]*\)/gi, ""))
      }
    })
  })

  return document.body.innerHTML
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character)
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value)
}

function booleanValue(value: unknown) {
  if (typeof value === "string") return value !== "" && value !== "0" && value.toLowerCase() !== "false"
  return Boolean(value)
}

function areMailSettingValuesEqual(left: unknown, right: unknown) {
  return left === right
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
