import * as React from "react"
import { ArrowDown, ArrowUp, Clipboard, CreditCard, LoaderCircle, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { ConfirmActionDialog } from "@/components/control-plane/confirm-action-dialog"
import { ResourceEmpty, ResourceError, ResourceTableLoading } from "@/components/control-plane/resource-states"
import { StatusBadge } from "@/components/data/status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getErrorMessage, useAdminQuery } from "@/hooks/use-admin-query"
import { ApiError } from "@/lib/api"
import { useAdminApi } from "@/lib/auth"

type Payment = { id: number; name: string; icon?: string | null; payment: string; config?: Record<string, unknown>; notify_domain?: string | null; notify_url?: string; handling_fee_fixed?: number | null; handling_fee_percent?: number | null; enable: boolean; sort?: number; created_at?: number | string }
type PaymentField = { type: string; label: string; placeholder?: string; description?: string; value?: unknown; options?: Record<string, string> | Array<{ value: string; label: string }> }
type PaymentForm = { id?: number; name: string; icon: string; method: string; notifyDomain: string; handlingFeeFixed: number | ""; handlingFeePercent: number | ""; values: Record<string, string> }

export function PaymentsPage() {
  const api = useAdminApi()
  const load = React.useCallback(async (signal: AbortSignal) => {
    const [payments, methods] = await Promise.all([
      api.get<Payment[]>("payment/fetch", undefined, signal),
      api.get<string[]>("payment/getPaymentMethods", undefined, signal),
    ])
    return { payments, methods }
  }, [api])
  const query = useAdminQuery(load)
  const [form, setForm] = React.useState<PaymentForm | null>(null)
  const [schema, setSchema] = React.useState<Record<string, PaymentField>>({})
  const [secretBaseline, setSecretBaseline] = React.useState<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = React.useState<Record<string, string[]>>({})
  const [schemaLoading, setSchemaLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [toggleTarget, setToggleTarget] = React.useState<Payment | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Payment | null>(null)
  const payments = query.data?.payments ?? []
  const methods = query.data?.methods ?? []

  async function loadSchema(method: string, id?: number) {
    setSchemaLoading(true)
    setFormErrors({})
    try {
      const next = await api.post<Record<string, PaymentField>>("payment/getPaymentForm", { payment: method, ...(id ? { id } : {}) })
      const secrets: Record<string, unknown> = {}
      const values: Record<string, string> = {}
      Object.entries(next).forEach(([key, field]) => {
        if (isSensitiveField(key, field)) {
          secrets[key] = field.value
          values[key] = ""
        } else values[key] = field.value === null || field.value === undefined ? "" : String(field.value)
      })
      setSchema(next)
      setSecretBaseline(secrets)
      setForm((current) => current ? { ...current, method, values } : current)
    } catch (error) {
      toast.error(getErrorMessage(error, "支付网关配置结构读取失败。"))
      setSchema({})
      setSecretBaseline({})
    } finally {
      setSchemaLoading(false)
    }
  }

  function openCreate() {
    const method = methods[0] ?? ""
    setForm({ name: "", icon: "", method, notifyDomain: "", handlingFeeFixed: "", handlingFeePercent: "", values: {} })
    setSchema({})
    setSecretBaseline({})
    if (method) void loadSchema(method)
  }

  function openEdit(payment: Payment) {
    setForm({ id: payment.id, name: payment.name, icon: payment.icon ?? "", method: payment.payment, notifyDomain: payment.notify_domain ?? "", handlingFeeFixed: payment.handling_fee_fixed ? payment.handling_fee_fixed / 100 : "", handlingFeePercent: payment.handling_fee_percent ?? "", values: {} })
    setSchema({})
    setSecretBaseline({})
    void loadSchema(payment.payment, payment.id)
  }

  async function savePayment() {
    if (!form) return
    setSaving(true)
    setFormErrors({})
    const config = Object.fromEntries(Object.keys(schema).map((key) => [key, isSensitiveField(key, schema[key]) && !form.values[key] ? secretBaseline[key] ?? "" : form.values[key] ?? ""]))
    try {
      await api.post<boolean>("payment/save", { ...(form.id ? { id: form.id } : {}), name: form.name.trim(), icon: form.icon.trim() || null, payment: form.method, config, notify_domain: form.notifyDomain.trim() || null, handling_fee_fixed: form.handlingFeeFixed === "" ? null : Math.round(Number(form.handlingFeeFixed) * 100), handling_fee_percent: form.handlingFeePercent === "" ? null : Number(form.handlingFeePercent) })
      toast.success(form.id ? "支付方式已更新" : "支付方式已创建")
      setForm(null)
      query.reload()
    } catch (error) {
      if (error instanceof ApiError) setFormErrors(error.fieldErrors)
      toast.error(getErrorMessage(error, "支付方式保存失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function togglePayment() {
    if (!toggleTarget) return
    setSaving(true)
    try {
      await api.post<boolean>("payment/show", { id: toggleTarget.id })
      toast.success(toggleTarget.enable ? "支付方式已停用" : "支付方式已启用")
      setToggleTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "支付方式状态更新失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await api.post<boolean>("payment/drop", { id: deleteTarget.id })
      toast.success("支付方式已删除")
      setDeleteTarget(null)
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "支付方式删除失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function movePayment(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= payments.length) return
    const next = [...payments]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSaving(true)
    try {
      await api.post<boolean>("payment/sort", { ids: next.map((payment) => payment.id) })
      toast.success("支付方式顺序已更新")
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error, "支付方式排序失败。"))
    } finally {
      setSaving(false)
    }
  }

  async function copyNotifyUrl(payment: Payment) {
    if (!payment.notify_url) return
    try {
      await navigator.clipboard.writeText(payment.notify_url)
      toast.success("回调地址已复制；页面不会展开其中的 UUID")
    } catch {
      toast.error("浏览器未允许写入剪贴板。")
    }
  }

  return <div className="mx-auto w-full max-w-[1600px]">
    <PageHeader title="支付管理" description="动态读取已启用支付插件的配置结构；密钥类字段不回显，空值保存时保留后端原值。" action={<Button onClick={openCreate} disabled={!methods.length}><Plus data-icon="inline-start" aria-hidden="true" />新增支付方式</Button>} />
    {query.error ? <ResourceError title="支付方式读取失败" message={query.error} onRetry={query.reload} /> : null}
    <Card className="gap-0 overflow-hidden py-0 shadow-none"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-4">支付方式</TableHead><TableHead>网关</TableHead><TableHead>手续费</TableHead><TableHead>通知域名</TableHead><TableHead>状态</TableHead><TableHead className="w-28">顺序</TableHead><TableHead className="w-12"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>{query.loading ? <ResourceTableLoading columns={7} /> : payments.map((payment, index) => <TableRow key={payment.id}><TableCell className="pl-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg border bg-muted text-sm">{payment.icon || <CreditCard className="size-4" aria-hidden="true" />}</span><div><div className="font-medium">{payment.name}</div><div className="font-data text-[11px] text-muted-foreground">ID {payment.id}</div></div></div></TableCell><TableCell><Badge variant="outline">{payment.payment}</Badge></TableCell><TableCell className="font-data text-xs"><div>固定 ¥{((payment.handling_fee_fixed ?? 0) / 100).toFixed(2)}</div><div className="text-muted-foreground">比例 {Number(payment.handling_fee_percent ?? 0)}%</div></TableCell><TableCell><div className="flex flex-col items-start gap-1"><span className="text-xs">{safeOrigin(payment.notify_domain) || "使用站点域名"}</span><Button variant="link" size="sm" className="h-auto px-0 text-xs" disabled={!payment.notify_url} onClick={() => void copyNotifyUrl(payment)}><Clipboard data-icon="inline-start" aria-hidden="true" />复制完整回调地址</Button></div></TableCell><TableCell><StatusBadge label={payment.enable ? "启用" : "停用"} tone={payment.enable ? "success" : "neutral"} /></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`上移 ${payment.name}`} disabled={saving || index === 0} onClick={() => void movePayment(index, -1)}><ArrowUp aria-hidden="true" /></Button><Button variant="ghost" size="icon-sm" aria-label={`下移 ${payment.name}`} disabled={saving || index === payments.length - 1} onClick={() => void movePayment(index, 1)}><ArrowDown aria-hidden="true" /></Button></div></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${payment.name} 操作`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => openEdit(payment)}>编辑配置</DropdownMenuItem><DropdownMenuItem onSelect={() => setToggleTarget(payment)}>{payment.enable ? "停用" : "启用"}</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(payment)}>删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>{!query.loading && !payments.length ? <ResourceEmpty title="还没有支付方式" description={methods.length ? "从已启用的支付插件中选择网关并填写配置。" : "当前没有已启用且可提供支付网关的插件，请先在扩展管理中启用支付插件。"} action={methods.length ? <Button size="sm" onClick={openCreate}><Plus data-icon="inline-start" aria-hidden="true" />新增支付方式</Button> : undefined} /> : null}<div className="border-t px-4 py-3 text-xs text-muted-foreground">共 {payments.length} 个支付方式 · 完整回调 UUID 仅在主动复制时进入剪贴板</div></Card>

    <PaymentDialog form={form} setForm={setForm} schema={schema} setSchemaValues={(key, value) => setForm((current) => current ? { ...current, values: { ...current.values, [key]: value } } : current)} formErrors={formErrors} methods={methods} schemaLoading={schemaLoading} saving={saving} onMethodChange={(method) => { setForm((current) => current ? { ...current, method, values: {} } : current); void loadSchema(method) }} onSave={savePayment} />
    <ConfirmActionDialog open={Boolean(toggleTarget)} onOpenChange={(open) => !open && setToggleTarget(null)} title={`${toggleTarget?.enable ? "停用" : "启用"}支付方式“${toggleTarget?.name ?? ""}”？`} description={toggleTarget?.enable ? "停用后用户端不再展示该支付入口，正在处理的第三方回调仍可能到达。" : "启用后用户可立即选择该网关支付，请先确认配置与回调地址有效。"} confirmLabel={toggleTarget?.enable ? "确认停用" : "确认启用"} destructive={Boolean(toggleTarget?.enable)} busy={saving} onConfirm={togglePayment} />
    <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title={`删除支付方式“${deleteTarget?.name ?? ""}”？`} description="这会删除网关配置与回调 UUID，后续回调将无法匹配该支付方式。历史订单记录不会因此改写。" confirmLabel="删除支付方式" destructive busy={saving} onConfirm={deletePayment} />
  </div>
}

function PaymentDialog({ form, setForm, schema, setSchemaValues, formErrors, methods, schemaLoading, saving, onMethodChange, onSave }: { form: PaymentForm | null; setForm: React.Dispatch<React.SetStateAction<PaymentForm | null>>; schema: Record<string, PaymentField>; setSchemaValues: (key: string, value: string) => void; formErrors: Record<string, string[]>; methods: string[]; schemaLoading: boolean; saving: boolean; onMethodChange: (method: string) => void; onSave: () => void }) {
  if (!form) return null
  return <Dialog open onOpenChange={(open) => !open && !saving && setForm(null)}><DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"><DialogHeader><DialogTitle>{form.id ? "编辑支付方式" : "新增支付方式"}</DialogTitle><DialogDescription>动态字段由当前后端支付插件提供。Secret、Key、Token、私钥等敏感项始终留空；不填写即保留原值。</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto pr-1"><FieldGroup><div className="grid gap-4 sm:grid-cols-2"><TextField id="payment-name" label="显示名称" value={form.name} errors={formErrors.name} onChange={(name) => setForm({ ...form, name })} /><Field><FieldLabel htmlFor="payment-method">支付网关</FieldLabel><Select value={form.method} disabled={Boolean(form.id)} onValueChange={onMethodChange}><SelectTrigger id="payment-method" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{methods.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>{form.id ? "已创建的支付方式不能切换网关类型。" : "来源于已启用的支付插件。"}</FieldDescription></Field></div><div className="grid gap-4 sm:grid-cols-2"><TextField id="payment-icon" label="图标 / Emoji" value={form.icon} onChange={(icon) => setForm({ ...form, icon })} /><TextField id="payment-domain" label="自定义通知域名" value={form.notifyDomain} errors={formErrors.notify_domain} type="url" description="留空使用站点地址；只填写域名与协议。" onChange={(notifyDomain) => setForm({ ...form, notifyDomain })} /></div><div className="grid gap-4 sm:grid-cols-2"><NumberField id="payment-fixed" label="固定手续费" value={form.handlingFeeFixed} min={0} step="0.01" description="站点货币主单位。" onChange={(handlingFeeFixed) => setForm({ ...form, handlingFeeFixed })} /><NumberField id="payment-percent" label="比例手续费（%）" value={form.handlingFeePercent} min={0} max={100} step="0.01" onChange={(handlingFeePercent) => setForm({ ...form, handlingFeePercent })} /></div><FieldSet className="rounded-2xl border p-4"><FieldLegend>网关配置</FieldLegend>{schemaLoading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />正在读取插件表单</div> : <div className="grid gap-4 sm:grid-cols-2">{Object.entries(schema).map(([key, field]) => <DynamicField key={key} fieldKey={key} field={field} value={form.values[key] ?? ""} onChange={(value) => setSchemaValues(key, value)} />)}</div>}</FieldSet></FieldGroup></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setForm(null)}>取消</Button><Button disabled={saving || schemaLoading || !form.name.trim() || !form.method} onClick={onSave}>{saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" /> : null}{saving ? "保存中" : "保存支付方式"}</Button></DialogFooter></DialogContent></Dialog>
}

function DynamicField({ fieldKey, field, value, onChange }: { fieldKey: string; field: PaymentField; value: string; onChange: (value: string) => void }) {
  const sensitive = isSensitiveField(fieldKey, field)
  const options = Array.isArray(field.options) ? field.options : Object.entries(field.options ?? {}).map(([optionValue, label]) => ({ value: optionValue, label }))
  if (options.length) return <Field><FieldLabel htmlFor={`payment-config-${fieldKey}`}>{field.label || fieldKey}</FieldLabel><Select value={value} onValueChange={onChange}><SelectTrigger id={`payment-config-${fieldKey}`} className="w-full"><SelectValue placeholder={field.placeholder} /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{field.description ? <FieldDescription>{field.description}</FieldDescription> : null}</Field>
  if (field.type === "text") return <Field><FieldLabel htmlFor={`payment-config-${fieldKey}`}>{field.label || fieldKey}</FieldLabel><Textarea id={`payment-config-${fieldKey}`} rows={5} value={value} placeholder={sensitive ? "留空保留现有敏感值" : field.placeholder} onChange={(event) => onChange(event.target.value)} />{field.description ? <FieldDescription>{field.description}</FieldDescription> : null}</Field>
  return <Field><FieldLabel htmlFor={`payment-config-${fieldKey}`}>{field.label || fieldKey}</FieldLabel><Input id={`payment-config-${fieldKey}`} type={sensitive ? "password" : "text"} autoComplete={sensitive ? "new-password" : undefined} value={value} placeholder={sensitive ? "留空保留现有敏感值" : field.placeholder} onChange={(event) => onChange(event.target.value)} />{field.description ? <FieldDescription>{field.description}</FieldDescription> : null}</Field>
}

function TextField({ id, label, value, onChange, errors, description, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; errors?: string[]; description?: string; type?: React.HTMLInputTypeAttribute }) { return <Field data-invalid={Boolean(errors)}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} aria-invalid={Boolean(errors)} onChange={(event) => onChange(event.target.value)} />{description ? <FieldDescription>{description}</FieldDescription> : null}<FieldError errors={errors?.map((message) => ({ message }))} /></Field> }
function NumberField({ id, label, value, onChange, min, max, step = "1", description }: { id: string; label: string; value: number | ""; onChange: (value: number | "") => void; min?: number; max?: number; step?: string; description?: string }) { return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />{description ? <FieldDescription>{description}</FieldDescription> : null}</Field> }
function isSensitiveField(key: string, field: PaymentField) { return /secret|token|password|private|api.?key|webhook.?key|(^|_)key$/i.test(`${key} ${field.label}`) }
function safeOrigin(value: string | null | undefined) { if (!value) return ""; try { return new URL(value).origin } catch { return "已配置自定义域名" } }
