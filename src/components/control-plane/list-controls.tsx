import * as React from 'react'
import {
  Check,
  LoaderCircle,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { executeListAction, type ListItem } from '@/lib/list-actions'
import { getErrorMessage } from '@/hooks/use-admin-query'
import type { ListColumn } from '@/hooks/use-visible-columns'

export function ColumnVisibility({
  columns,
  visible,
  onChange,
}: {
  columns: readonly ListColumn[]
  visible: readonly string[]
  onChange: (next: string[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="设置列表显示列">
          <SlidersHorizontal data-icon="inline-start" />
          显示列{' '}
          <span className="font-data text-xs text-muted-foreground">
            {visible.length}/{columns.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>显示列</DropdownMenuLabel>
        <DropdownMenuGroup>
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={visible.includes(column.key)}
              disabled={
                column.required ||
                (visible.length === 1 && visible.includes(column.key))
              }
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...visible, column.key]
                    : visible.filter((key) => key !== column.key),
                )
              }
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type BulkAction<T> = {
  id: string
  label: string
  description: string
  icon?: LucideIcon
  destructive?: boolean
} & (
  | { run: (item: T) => Promise<unknown>; runAll?: never }
  | { run?: never; runAll: (items: readonly T[]) => Promise<unknown> }
)

export function BulkActions<T extends ListItem>({
  selected,
  actions,
  getLabel,
  onComplete,
  onBusyChange,
  disabled = false,
  scope,
}: {
  selected: readonly T[]
  actions: readonly BulkAction<T>[]
  getLabel: (item: T) => string
  onComplete: (failedIds: number[]) => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
  scope?: string
}) {
  const [pending, setPending] = React.useState<{
    action: BulkAction<T>
    items: T[]
    scope?: string
  } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failures, setFailures] = React.useState<{ item: T; error: unknown }[]>(
    [],
  )
  const [completed, setCompleted] = React.useState(0)
  const running = React.useRef(false)
  const stale = pending !== null && pending.scope !== scope
  async function execute() {
    if (!pending || stale || running.current) return
    running.current = true
    setBusy(true)
    onBusyChange?.(true)
    try {
      const result = pending.action.runAll
        ? await pending.action.runAll(pending.items).then(
            () => ({
              succeeded: pending.items,
              failed: [] as { item: T; error: unknown }[],
            }),
            (error: unknown) => ({
              succeeded: [] as T[],
              failed: pending.items.map((item) => ({ item, error })),
            }),
          )
        : await executeListAction(pending.items, pending.action.run)
      setCompleted((count) => count + result.succeeded.length)
      setFailures(result.failed)
      onComplete(result.failed.map(({ item }) => item.id))
      if (result.failed.length) {
        setPending({
          action: pending.action,
          items: result.failed.map(({ item }) => item),
          scope: pending.scope,
        })
        toast.error(`${result.failed.length} 项未完成`)
      } else {
        setPending(null)
        toast.success(`已完成 ${result.succeeded.length} 项`)
      }
    } finally {
      running.current = false
      setBusy(false)
      onBusyChange?.(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || busy || !selected.length}
            aria-label="批量操作"
          >
            <MoreHorizontal data-icon="inline-start" />
            批量操作
            {selected.length ? (
              <Badge variant="secondary" className="ml-1 font-data">
                {selected.length}
              </Badge>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>已选 {selected.length} 项</DropdownMenuLabel>
          {[false, true].map((destructive) => {
            const group = actions.filter(
              (action) => Boolean(action.destructive) === destructive,
            )
            return group.length ? (
              <React.Fragment key={String(destructive)}>
                {destructive &&
                  actions.some((action) => !action.destructive) && (
                    <DropdownMenuSeparator />
                  )}
                <DropdownMenuGroup>
                  {group.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      variant={action.destructive ? 'destructive' : 'default'}
                      onSelect={() => {
                        setPending({ action, items: [...selected], scope })
                        setFailures([])
                        setCompleted(0)
                      }}
                    >
                      {action.icon ? <action.icon /> : null}
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </React.Fragment>
            ) : null
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pending?.action.label}</DialogTitle>
            <DialogDescription>{pending?.action.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {stale && (
              <Alert variant="destructive">
                <AlertTitle>配置已更新</AlertTitle>
                <AlertDescription>
                  请关闭此窗口，核对最新配置后重新选择操作对象。
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm">
              {failures.length
                ? `已完成 ${completed} 项，以下 ${failures.length} 项未完成。`
                : `将处理以下 ${pending?.items.length ?? 0} 项。`}
            </p>
            <ul
              className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border p-3 text-sm"
              aria-label="批量操作对象"
            >
              {pending?.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 font-data">
                    #{item.id}
                  </Badge>
                  <span className="min-w-0 break-words">{getLabel(item)}</span>
                </li>
              ))}
            </ul>
            {failures.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>部分操作未完成</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  {failures.map(({ item, error }) => (
                    <p key={item.id} className="break-words">
                      <span className="font-medium">{getLabel(item)}：</span>
                      {getErrorMessage(error)}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              <X data-icon="inline-start" />
              {failures.length ? '关闭' : '取消'}
            </Button>
            <Button
              variant={pending?.action.destructive ? 'destructive' : 'default'}
              disabled={busy || stale || !pending?.items.length}
              onClick={() => void execute()}
            >
              {busy ? (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {busy ? '处理中' : failures.length ? '重试失败项' : '确认执行'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SelectionSummary({
  selected,
  total,
  onClear,
}: {
  selected: number
  total: number
  onClear: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        已选择 <span className="font-data">{selected}</span> 项，共{' '}
        <span className="font-data">{total}</span> 项
      </span>
      {selected > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          清除选择
        </Button>
      )}
    </div>
  )
}
