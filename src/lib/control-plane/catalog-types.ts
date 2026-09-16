export type CatalogControl =
  | "text"
  | "number"
  | "password"
  | "textarea"
  | "code"
  | "select"
  | "switch"
  | "tags"
  | "multiselect"

export type CatalogCodeLanguage = "json" | "yaml" | "text"

export type CatalogOption = {
  value: string
  label: string
}

export type CatalogCondition = {
  field: string
  equals?: string | string[] | boolean
  notEquals?: string | string[] | boolean
}

export type CatalogField = {
  key: string
  backendKey?: string
  sourceGroup?: string
  label: string
  control: CatalogControl
  description?: string
  placeholder?: string
  defaultValue?: string | number | boolean | string[]
  options?: CatalogOption[]
  showWhen?: CatalogCondition | CatalogCondition[]
  span?: 1 | 2
  rows?: number
  sensitive?: boolean
  required?: boolean
  valueType?: "string" | "number" | "boolean" | "string-array"
  language?: CatalogCodeLanguage
}

export type CatalogSection = {
  id: string
  title: string
  description?: string
  fields: CatalogField[]
}

export type CatalogTab = {
  id: string
  title: string
  description?: string
  icon?: LucideIcon
  sections: CatalogSection[]
}
import type { LucideIcon } from 'lucide-react'
