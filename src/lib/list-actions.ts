export type ListItem = { id: number }
export type ListSelectionState = { scope: string; ids: Set<number> }

export function reconcileListSelection<T extends ListItem>(
  state: ListSelectionState,
  scope: string,
  items: readonly T[],
): ListSelectionState {
  if (state.scope !== scope) return { scope, ids: new Set() }
  const visibleIds = new Set(items.map((item) => item.id))
  if ([...state.ids].every((id) => visibleIds.has(id))) return state
  return {
    scope,
    ids: new Set([...state.ids].filter((id) => visibleIds.has(id))),
  }
}

export function selectedListItems<T extends ListItem>(
  items: readonly T[],
  ids: ReadonlySet<number>,
): T[] {
  return items.filter((item) => ids.has(item.id))
}

export async function executeListAction<T extends ListItem>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
) {
  const succeeded: T[] = []
  const failed: { item: T; error: unknown }[] = []
  // The caller supplies the confirmation snapshot, never the whole query.
  // Sequential execution bounds pressure on configuration reloads and APIs.
  for (const item of items) {
    try {
      await run(item)
      succeeded.push(item)
    } catch (error) {
      failed.push({ item, error })
    }
  }
  return { succeeded, failed }
}

export function normalizeVisibleColumns(
  saved: unknown,
  available: readonly string[],
  required: readonly string[],
  defaults: readonly string[],
) {
  const source = Array.isArray(saved)
    ? saved.filter(
        (key): key is string =>
          typeof key === 'string' && available.includes(key),
      )
    : [...defaults]
  const selected = new Set([...required, ...source])
  if (selected.size === 0 && available.length) selected.add(available[0])
  return available.filter((key) => selected.has(key))
}
