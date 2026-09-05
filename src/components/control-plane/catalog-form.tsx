import * as React from "react"
import { SlidersHorizontal } from "lucide-react"
import type { CatalogCondition, CatalogField, CatalogTab } from "@/lib/control-plane/catalog-types"
import type { ConfigEditorLanguage } from "@/components/ui/config-editor"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const ConfigEditor = React.lazy(() =>
  import("@/components/ui/config-editor").then((module) => ({ default: module.ConfigEditor })),
)

export type CatalogValue = string | number | boolean | string[]
export type CatalogValues = Record<string, CatalogValue>
export type CatalogFieldErrors = Record<string, string[]>

function initialValues(tabs: CatalogTab[]): CatalogValues {
  return Object.fromEntries(
    tabs.flatMap((tab) => tab.sections).flatMap((section) => section.fields).map((field) => [field.key, field.defaultValue ?? defaultFor(field)]),
  )
}

function defaultFor(field: CatalogField): CatalogValue {
  if (field.control === "switch") return false
  if (field.control === "multiselect") return []
  return ""
}

function matches(condition: CatalogCondition, values: CatalogValues) {
  const current = values[condition.field]
  if (condition.equals !== undefined) {
    const expected = Array.isArray(condition.equals) ? condition.equals : [condition.equals]
    if (!expected.includes(current as never)) return false
  }
  if (condition.notEquals !== undefined) {
    const blocked = Array.isArray(condition.notEquals) ? condition.notEquals : [condition.notEquals]
    if (blocked.includes(current as never)) return false
  }
  return true
}

function isVisible(field: CatalogField, values: CatalogValues) {
  if (!field.showWhen) return true
  const conditions = Array.isArray(field.showWhen) ? field.showWhen : [field.showWhen]
  return conditions.every((condition) => matches(condition, values))
}

function getCodeLanguage(field: CatalogField): ConfigEditorLanguage {
  if (field.language) return field.language
  if (field.key.startsWith("subscribe_template.")) return "yaml"

  const sample = [field.defaultValue, field.placeholder]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim()

  return sample?.startsWith("{") || sample?.startsWith("[") ? "json" : "text"
}

export function CatalogForm({
  tabs,
  ariaLabel,
  values: controlledValues,
  defaultValues,
  errors = {},
  disabled = false,
  onValuesChange,
  navigationStyle = "sidebar",
  navigationLabel = "配置步骤",
  sidebarStickyOffset = "container",
}: {
  tabs: CatalogTab[]
  ariaLabel: string
  values?: CatalogValues
  defaultValues?: CatalogValues
  errors?: CatalogFieldErrors
  disabled?: boolean
  onValuesChange?: (values: CatalogValues) => void
  navigationStyle?: "underline" | "sidebar"
  navigationLabel?: string
  sidebarStickyOffset?: "container" | "page"
}) {
  const [uncontrolledValues, setUncontrolledValues] = React.useState<CatalogValues>(() => ({
    ...initialValues(tabs),
    ...defaultValues,
  }))
  const [activeTab, setActiveTab] = React.useState(tabs[0]?.id ?? "")
  const resolvedActiveTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id ?? ""
  const values = controlledValues ?? uncontrolledValues

  const update = (key: string, value: CatalogValue) => {
    const next = { ...values, [key]: value }
    if (controlledValues === undefined) setUncontrolledValues(next)
    onValuesChange?.(next)
  }

  if (!tabs.length) return null

  const sidebarNavigation = navigationStyle === "sidebar"

  const navigation = sidebarNavigation ? (
    <aside
      data-sticky-scope={sidebarStickyOffset}
      className={cn(
        "max-w-full self-start overflow-hidden rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur md:sticky md:z-20 md:overflow-y-auto md:overscroll-contain md:[scrollbar-gutter:stable]",
        sidebarStickyOffset === "page"
          ? "md:top-16 md:max-h-[calc(100dvh-5rem)]"
          : "md:top-0 md:max-h-[calc(92dvh-12rem)]",
      )}
    >
      <div className="hidden px-2.5 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground md:block">{navigationLabel}</div>
      <div className="px-2.5 pb-2 text-xs text-muted-foreground md:hidden">左右滑动切换配置分类</div>
      <TabsList className="h-auto w-full max-md:!flex-row max-md:justify-start max-md:overflow-x-auto max-md:overflow-y-hidden md:flex-col md:items-stretch md:justify-start gap-1 rounded-xl bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, index) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="group/catalog-step min-h-11 max-md:!w-auto max-md:!min-w-36 flex-none justify-start rounded-xl border border-transparent px-2.5 py-2 text-left shadow-none after:hidden hover:-translate-y-px hover:bg-background/75 hover:shadow-sm active:translate-y-0 active:scale-[0.98] data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm md:w-full md:min-w-0"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-background font-data text-[10px] font-semibold text-muted-foreground transition-colors duration-200 group-data-[state=active]/catalog-step:bg-primary group-data-[state=active]/catalog-step:text-primary-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 truncate">{tab.title}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </aside>
  ) : (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsList variant="line" className="h-auto w-max min-w-full justify-start gap-1 rounded-none border-b p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="h-10 flex-none rounded-b-none rounded-t-xl border-0 px-3 shadow-none after:bottom-[-1px] after:bg-primary data-[state=active]:border-0 data-[state=active]:text-primary"
          >
            {tab.title}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )

  return (
    <Tabs
      value={resolvedActiveTab}
      onValueChange={setActiveTab}
      orientation={sidebarNavigation ? "vertical" : "horizontal"}
      aria-label={ariaLabel}
      className={cn("relative", sidebarNavigation && "grid gap-4 overflow-visible md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-6")}
    >
      {navigation}
      <div className={cn("min-w-0", disabled && "pointer-events-none opacity-70")} aria-busy={disabled || undefined}>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className={cn(sidebarNavigation ? "pt-0" : "pt-4")}>
            {tab.description ? <p className="mb-4 text-sm text-muted-foreground">{tab.description}</p> : null}
            <CatalogTabSections tab={tab} values={values} errors={errors} disabled={disabled} update={update} />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

function CatalogTabSections({
  tab,
  values,
  errors,
  disabled,
  update,
}: {
  tab: CatalogTab
  values: CatalogValues
  errors: CatalogFieldErrors
  disabled: boolean
  update: (key: string, value: CatalogValue) => void
}) {
  const visibleSections = tab.sections
    .map((section) => ({ section, fields: section.fields.filter((field) => isVisible(field, values)) }))
    .filter(({ fields }) => fields.length > 0)

  if (!visibleSections.length) {
    return (
      <Empty className="min-h-56 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><SlidersHorizontal aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>当前组合没有可配置项</EmptyTitle>
          <EmptyDescription>请先在前面的步骤选择支持此功能的协议、传输或安全模式。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleSections.map(({ section, fields }) => (
        <section key={section.id} className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{section.title}</h3>
            {section.description ? <p className="mt-1 text-xs text-muted-foreground">{section.description}</p> : null}
          </div>
          <FieldGroup className="grid items-start gap-4 p-4 sm:grid-cols-2">
            {fields.map((field, index) => {
              const nextField = fields[index + 1]
              const tallControl = field.control === "multiselect" || field.control === "textarea" || field.control === "code"
              const controlsFollowingTallField = field.control === "switch" && nextField?.control === "multiselect"

              return (
                <CatalogFieldControl
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  errors={errors[field.key]}
                  disabled={disabled}
                  update={update}
                  fullWidth={field.span === 2 || tallControl || controlsFollowingTallField}
                />
              )
            })}
          </FieldGroup>
        </section>
      ))}
    </div>
  )
}

function CatalogFieldControl({
  field,
  value,
  errors,
  disabled,
  update,
  fullWidth,
}: {
  field: CatalogField
  value: CatalogValue | undefined
  errors?: string[]
  disabled: boolean
  update: (key: string, value: CatalogValue) => void
  fullWidth: boolean
}) {
  const reactId = React.useId()
  const inputId = `${reactId}-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  const errorId = `${inputId}-error`
  const invalid = Boolean(errors?.length)
  const wrapperClass = fullWidth ? "sm:col-span-2" : undefined
  const describedBy = invalid ? errorId : undefined

  if (field.control === "switch") {
    return (
      <Field orientation="horizontal" className={cn("min-h-20 rounded-2xl border bg-background p-4", wrapperClass)} data-invalid={invalid} data-disabled={disabled}>
        <div className="min-w-0 flex-1 space-y-1">
          <FieldLabel htmlFor={inputId}>{field.label}{field.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}</FieldLabel>
          {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
          <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
        </div>
        <Switch className="shrink-0" id={inputId} checked={Boolean(value)} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy} onCheckedChange={(checked) => update(field.key, checked)} />
      </Field>
    )
  }

  if (field.control === "multiselect") {
    const selected = Array.isArray(value) ? value : []
    return (
      <FieldSet className={cn("gap-3", wrapperClass)} data-invalid={invalid} disabled={disabled}>
        <FieldLegend className="mb-0" variant="label">{field.label}{field.required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}</FieldLegend>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm shadow-xs transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-accent/75 hover:shadow-sm active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/[0.045]"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onCheckedChange={(checked) => update(field.key, checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
      </FieldSet>
    )
  }

  if (field.control === "select") {
    return (
      <Field className={wrapperClass} data-invalid={invalid} data-disabled={disabled}>
        <FieldLabel htmlFor={inputId}>{field.label}{field.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}</FieldLabel>
        <Select value={String(value ?? "")} disabled={disabled} onValueChange={(next) => update(field.key, next)}>
          <SelectTrigger id={inputId} className="w-full" aria-invalid={invalid} aria-describedby={describedBy}><SelectValue placeholder={field.placeholder} /></SelectTrigger>
          <SelectContent><SelectGroup>{field.options?.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
      </Field>
    )
  }

  if (field.control === "code") {
    return (
      <Field className={wrapperClass} data-invalid={invalid} data-disabled={disabled}>
        <FieldLabel>{field.label}{field.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}</FieldLabel>
        <React.Suspense fallback={<ConfigEditorFallback rows={field.rows} />}>
          <ConfigEditor
            label={field.label}
            language={getCodeLanguage(field)}
            rows={field.rows}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(next) => update(field.key, next)}
            disabled={disabled}
          />
        </React.Suspense>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
      </Field>
    )
  }

  if (field.control === "textarea") {
    return (
      <Field className={wrapperClass} data-invalid={invalid} data-disabled={disabled}>
        <FieldLabel htmlFor={inputId}>{field.label}{field.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}</FieldLabel>
        <Textarea
          id={inputId}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(event) => update(field.key, event.target.value)}
          spellCheck
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
      </Field>
    )
  }

  return (
    <Field className={wrapperClass} data-invalid={invalid} data-disabled={disabled}>
      <FieldLabel htmlFor={inputId}>{field.label}{field.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}</FieldLabel>
      <Input
        id={inputId}
        type={field.control === "password" || field.sensitive ? "password" : field.control === "number" ? "number" : "text"}
        inputMode={field.control === "number" ? "numeric" : undefined}
        className={field.control === "tags" ? "font-data text-xs" : undefined}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => update(field.key, field.control === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
        autoComplete={field.sensitive ? "new-password" : undefined}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function ConfigEditorFallback({ rows = 8 }: { rows?: number }) {
  const height = Math.min(Math.max(rows * 24 + 52, 184), 520)

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs" style={{ height }}>
      <div className="h-14 animate-pulse border-b bg-muted/50 motion-reduce:animate-none" />
      <div className="h-full animate-pulse bg-[#1e1e1e] motion-reduce:animate-none" />
    </div>
  )
}
