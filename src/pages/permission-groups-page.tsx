import * as React from 'react'
import {
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Pencil,
  Trash2,
  LoaderCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import {
  BulkActions,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { useListSelection } from '@/hooks/use-list-selection'

type PermissionGroup = {
  id: number
  name: string
  users_count: number
  server_count: number
}

export function PermissionGroupsPage() {
  const api = useAdminApi()
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<PermissionGroup[]>('server/group/fetch', undefined, signal),
      [api],
    ),
  )
  const [search, setSearch] = React.useState('')
  const [editing, setEditing] = React.useState<Partial<PermissionGroup> | null>(
    null,
  )
  const [remove, setRemove] = React.useState<PermissionGroup | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const readBusy = query.loading || query.refreshing
  const writeBusy = saving || bulkBusy
  const pageBusy = readBusy || writeBusy
  const rows = (query.data ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const selection = useListSelection(rows)
  async function save() {
    if (!editing?.name?.trim() || saving || readBusy) return
    setSaving(true)
    try {
      await api.post('server/group/save', {
        id: editing.id,
        name: editing.name.trim(),
      })
      setEditing(null)
      query.reload()
      toast.success('权限组已保存')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="权限组管理"
        description="设置用户可连接的节点范围，在套餐和节点中分配权限组。"
        action={
          <>
            <Button
              variant="outline"
              disabled={pageBusy}
              onClick={query.reload}
            >
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
            <Button
              disabled={pageBusy}
              onClick={() => setEditing({ name: '' })}
            >
              <Plus data-icon="inline-start" />
              新增权限组
            </Button>
          </>
        }
      />
      {query.error && (
        <ResourceError
          title="权限组加载失败"
          message={query.error}
          onRetry={query.reload}
        />
      )}
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="搜索权限组"
              placeholder="搜索权限组名称…"
              value={search}
              disabled={bulkBusy}
              onChange={(event) => {
                setSearch(event.target.value)
                selection.clear()
              }}
            />
          </InputGroup>
          <BulkActions
            selected={selection.selectedRows}
            getLabel={(item) => item.name}
            disabled={pageBusy}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              query.reload()
            }}
            actions={[
              {
                id: 'delete',
                label: '删除权限组',
                description:
                  '永久删除所选权限组。已被用户、套餐或节点使用的权限组不会删除。',
                destructive: true,
                icon: Trash2,
                run: (item) => api.post('server/group/drop', { id: item.id }),
              },
            ]}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="选择当前权限组"
                  checked={selection.checked}
                  disabled={pageBusy || !rows.length}
                  onCheckedChange={(checked) =>
                    selection.toggleAll(checked === true)
                  }
                />
              </TableHead>
              <TableHead>权限组</TableHead>
              <TableHead>用户数</TableHead>
              <TableHead>可见节点</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.loading ? (
              <ResourceTableLoading columns={5} />
            ) : (
              rows.map((group) => (
                <TableRow
                  key={group.id}
                  data-state={
                    selection.selectedIds.has(group.id) ? 'selected' : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      aria-label={'选择权限组 ' + group.name}
                      checked={selection.selectedIds.has(group.id)}
                      disabled={pageBusy}
                      onCheckedChange={(checked) =>
                        selection.toggle(group.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
                        <ShieldCheck className="size-4" />
                      </div>
                      <span
                        className="max-w-64 truncate font-medium"
                        title={group.name}
                      >
                        {group.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-data text-[10px]"
                      >
                        #{group.id}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-data">
                      {group.users_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-data">
                      {group.server_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ButtonGroup
                      className="ml-auto"
                      aria-label={group.name + ' 操作'}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageBusy}
                        onClick={() => setEditing(group)}
                      >
                        <Pencil data-icon="inline-start" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageBusy}
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRemove(group)}
                      >
                        <Trash2 data-icon="inline-start" />
                        删除
                      </Button>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              ))
            )}
            {!query.loading && !rows.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  {search ? '没有匹配的权限组。' : '尚未添加权限组。'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <SelectionSummary
            selected={selection.count}
            total={rows.length}
            onClear={selection.clear}
          />
        </div>
      </Card>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? '编辑权限组' : '新增权限组'}
            </DialogTitle>
            <DialogDescription>填写便于识别的权限组名称。</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="permission-group-name">名称</FieldLabel>
            <Input
              id="permission-group-name"
              value={editing?.name ?? ''}
              disabled={saving || readBusy}
              onChange={(event) =>
                setEditing(
                  (previous) =>
                    previous && { ...previous, name: event.target.value },
                )
              }
              placeholder="例如 高级组"
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              取消
            </Button>
            <Button
              disabled={saving || readBusy || !editing?.name?.trim()}
              onClick={() => void save()}
            >
              {saving && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={remove !== null}
        onOpenChange={(open) => !open && setRemove(null)}
        title="删除权限组"
        description={
          '删除「' +
          (remove?.name ?? '') +
          '」。已被用户、套餐或节点使用的权限组无法删除。'
        }
        destructive
        busy={saving || readBusy}
        onConfirm={async () => {
          if (saving || readBusy) return
          setSaving(true)
          try {
            await api.post('server/group/drop', { id: remove?.id })
            setRemove(null)
            query.reload()
          } catch (error) {
            toast.error(getErrorMessage(error))
          } finally {
            setSaving(false)
          }
        }}
      />
    </div>
  )
}
