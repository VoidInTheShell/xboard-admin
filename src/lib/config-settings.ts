import type { CatalogField, CatalogTab } from "@/lib/control-plane/catalog-types"
import type { CatalogFieldErrors, CatalogValue, CatalogValues } from "@/components/control-plane/catalog-form"

export type ConfigGroups = Record<string, Record<string, unknown>>

export function createConfigValues(tabs: CatalogTab[], groups: ConfigGroups): CatalogValues {
  const values: CatalogValues = {}

  for (const tab of tabs) {
    const source = groups[tab.id] ?? {}
    for (const field of tab.sections.flatMap((section) => section.fields)) {
      const backendKey = field.backendKey ?? field.key
      const sourceValue = (field.sourceGroup ? groups[field.sourceGroup] ?? {} : source)[backendKey]
      values[field.key] = normalizeFieldValue(field, sourceValue)
    }
  }

  return values
}

export function createConfigPayload(
  tabs: CatalogTab[],
  values: CatalogValues,
  baseline: CatalogValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const field of getCatalogFields(tabs)) {
    const value = values[field.key]
    const previous = baseline[field.key]

    if (field.sensitive && isBlank(value)) continue
    if (areCatalogValuesEqual(value, previous)) continue

    payload[field.backendKey ?? field.key] = serializeFieldValue(field, value)
  }

  return payload
}

export function mapConfigFieldErrors(
  tabs: CatalogTab[],
  backendErrors: Record<string, string[]>,
): CatalogFieldErrors {
  const keyMap = new Map(getCatalogFields(tabs).map((field) => [field.backendKey ?? field.key, field.key]))

  return Object.fromEntries(
    Object.entries(backendErrors).map(([key, messages]) => [keyMap.get(key) ?? key, messages]),
  )
}

export function withThemeOptions(tabs: CatalogTab[], themeNames: string[], activeTheme?: string): CatalogTab[] {
  const names = Array.from(new Set([...themeNames, ...(activeTheme ? [activeTheme] : [])])).filter(Boolean)
  const options = names.map((name) => ({ value: name, label: name }))

  return tabs.map((tab) => ({
    ...tab,
    sections: tab.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.backendKey === "frontend_theme" ? { ...field, options } : field),
    })),
  }))
}

export function getThemeNames(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.themes)) return []
  return Object.keys(payload.themes)
}

export function getActiveTheme(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.active !== "string") return undefined
  return payload.active
}

function getCatalogFields(tabs: CatalogTab[]) {
  return tabs.flatMap((tab) => tab.sections).flatMap((section) => section.fields)
}

function normalizeFieldValue(field: CatalogField, sourceValue: unknown): CatalogValue {
  if (field.sensitive) return ""
  if (sourceValue === null || sourceValue === undefined) return field.defaultValue ?? defaultFor(field)

  if (field.control === "switch" || field.valueType === "boolean") return toBoolean(sourceValue)
  if (field.valueType === "string-array") {
    return Array.isArray(sourceValue) ? sourceValue.map(String).join(", ") : String(sourceValue)
  }
  if (field.control === "number") {
    const numeric = Number(sourceValue)
    return Number.isFinite(numeric) ? numeric : ""
  }
  if (field.control === "select" && field.valueType === "number") return String(sourceValue)
  if (field.control === "multiselect") return Array.isArray(sourceValue) ? sourceValue.map(String) : []

  return typeof sourceValue === "string" ? sourceValue : String(sourceValue)
}

function serializeFieldValue(field: CatalogField, value: CatalogValue | undefined): unknown {
  if (field.valueType === "string-array") return splitList(value)
  if (field.valueType === "number" || field.control === "number") {
    if (value === "" || value === undefined) return null
    return Number(value)
  }
  if (field.control === "switch" || field.valueType === "boolean") return Boolean(value)
  if (field.control === "multiselect") return Array.isArray(value) ? value : []
  return value ?? ""
}

function splitList(value: CatalogValue | undefined): string[] {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[,，\n]/)
  return Array.from(new Set(source.map((item) => String(item).trim()).filter(Boolean)))
}

function defaultFor(field: CatalogField): CatalogValue {
  if (field.control === "switch") return false
  if (field.control === "multiselect") return []
  return ""
}

function toBoolean(value: unknown) {
  if (typeof value === "string") return value !== "" && value !== "0" && value.toLowerCase() !== "false"
  return Boolean(value)
}

function isBlank(value: CatalogValue | undefined) {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
}

function areCatalogValuesEqual(left: CatalogValue | undefined, right: CatalogValue | undefined) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
  }
  return left === right
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
