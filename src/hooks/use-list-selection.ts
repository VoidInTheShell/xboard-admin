import * as React from 'react'
import {
  reconcileListSelection,
  selectedListItems,
  type ListItem,
  type ListSelectionState,
} from '@/lib/list-actions'

export function useListSelection<T extends ListItem>(
  items: readonly T[],
  scope = '',
) {
  const [state, setState] = React.useState<ListSelectionState>(() => ({
    scope,
    ids: new Set(),
  }))
  const current = reconcileListSelection(state, scope, items)
  if (current !== state) setState(current)
  function setIds(
    value: Set<number> | ((previous: Set<number>) => Set<number>),
  ) {
    setState((previous) => ({
      scope,
      ids:
        typeof value === 'function'
          ? value(previous.scope === scope ? previous.ids : new Set())
          : value,
    }))
  }
  const selectedRows = React.useMemo(
    () =>
      selectedListItems(
        items,
        state.scope === scope ? state.ids : new Set<number>(),
      ),
    [items, state, scope],
  )
  const selectedIds = new Set(selectedRows.map((item) => item.id))
  return {
    selectedRows,
    selectedIds,
    count: selectedRows.length,
    checked:
      selectedRows.length > 0 && selectedRows.length === items.length
        ? (true as const)
        : selectedRows.length > 0
          ? ('indeterminate' as const)
          : (false as const),
    toggle(id: number, checked: boolean) {
      setIds((previous) => {
        const next = new Set(
          selectedListItems(items, previous).map((item) => item.id),
        )
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
    },
    toggleAll(checked: boolean) {
      setIds(new Set(checked ? items.map((item) => item.id) : []))
    },
    clear() {
      setIds(new Set())
    },
    retain(failedIds: number[]) {
      setIds(new Set(failedIds))
    },
  }
}
