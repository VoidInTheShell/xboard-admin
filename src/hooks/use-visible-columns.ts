import * as React from 'react'
import { normalizeVisibleColumns } from '@/lib/list-actions'

export type ListColumn = { key: string; label: string; required?: boolean }

export function useVisibleColumns(
  storageKey: string,
  columns: readonly ListColumn[],
  defaults = columns.map((column) => column.key),
) {
  const available = columns.map((column) => column.key)
  const required = columns
    .filter((column) => column.required)
    .map((column) => column.key)
  const [stored, setStored] = React.useState<string[]>(() => {
    try {
      return normalizeVisibleColumns(
        JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
        available,
        required,
        defaults,
      )
    } catch {
      return normalizeVisibleColumns(null, available, required, defaults)
    }
  })
  const visible = normalizeVisibleColumns(stored, available, required, defaults)
  return {
    visible,
    has: (key: string) => visible.includes(key),
    setVisible(next: string[]) {
      const value = normalizeVisibleColumns(next, available, required, defaults)
      setStored(value)
      try {
        localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        /* Current session still keeps the choice. */
      }
    },
  }
}
