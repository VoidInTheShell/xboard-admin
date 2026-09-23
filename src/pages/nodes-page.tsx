import * as React from 'react'
import { OnlineUsageCell } from '@/components/usage/server-usage-sheet'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Network,
  Search,
  Eye,
  EyeOff,
  MoreHorizontal,
  Power,
  PowerOff,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { RuntimeNodeDialog } from '@/components/control-plane/runtime-node-dialog'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  BulkActions,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import { useListSelection } from '@/hooks/use-list-selection'
import { StatusBadge } from '@/components/data/status-badge'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import type { RuntimeNode } from '@/lib/control-plane/runtime-api'

export function NodesPage() {
  const api = useAdminApi()
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<RuntimeNode[]>('server/manage/getNodes', undefined, signal),
      [api],
    ),
  )
  const [editing, setEditing] = React.useState<RuntimeNode | null>(null)
  const [removing, setRemoving] = React.useState<RuntimeNode | null>(null)
  const [search, setSearch] = React.useState('')
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const readBusy = query.loading || query.refreshing
  const writeBusy = bulkBusy || deleteBusy
  const pageBusy = readBusy || writeBusy
  const nodes = query.data ?? []
  const rows = nodes.filter((node) =>
    [node.name, node.host, node.type, ...((node.tags as string[]) ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const selection = useListSelection(rows)
  async function move(index: number, direction: number) {
    if (pageBusy) return
    if (index + direction < 0 || index + direction >= nodes.length) return
    const list = [...nodes]
    ;[list[index], list[index + direction]] = [
      list[index + direction],
      list[index],
    ]
    try {
      await api.post(
        'server/manage/sort',
        list.map((item, order) => ({ id: item.id, order })),
      )
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }
  async function removeNode() {
    if (!removing || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.post('server/manage/drop', { id: removing.id })
      toast.success(`已删除节点 ${removing.name}`)
      setRemoving(null)
      selection.clear()
      query.reload()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="节点管理"
        description="管理订阅顺序、用户权限、流量倍率和可见性。"
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
            <Button asChild>
              <Link to="/servers">管理服务器</Link>
            </Button>
          </>
        }
      />
      {query.error && (
        <ResourceError
          title="节点加载失败"
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
              aria-label="搜索节点"
              placeholder="搜索名称、地址或标签…"
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
            getLabel={(node) => node.name}
            disabled={pageBusy}
            onBusyChange={setBulkBusy}
            onComplete={(ids) => {
              selection.retain(ids)
              query.reload()
            }}
            actions={[
              {
                id: 'show',
                label: '在订阅中显示',
                description: '在有权限的用户订阅中显示所选节点。',
                icon: Eye,
                run: (node) =>
                  api.post('server/manage/update', { id: node.id, show: 1 }),
              },
              {
                id: 'hide',
                label: '从订阅中隐藏',
                description: '从用户订阅中隐藏所选节点，不停止运行实例。',
                icon: EyeOff,
                run: (node) =>
                  api.post('server/manage/update', { id: node.id, show: 0 }),
              },
              {
                id: 'enable',
                label: '启用运行实例',
                description: '启动所选节点的运行实例。',
                icon: Power,
                run: (node) =>
                  api.post('server/manage/update', {
                    id: node.id,
                    enabled: true,
                  }),
              },
              {
                id: 'disable',
                label: '停用运行实例',
                description: '停止所选节点的运行实例，现有连接会中断。',
                icon: PowerOff,
                destructive: true,
                run: (node) =>
                  api.post('server/manage/update', {
                    id: node.id,
                    enabled: false,
                  }),
              },
              {
                id: 'delete',
                label: '删除节点',
                description:
                  '永久删除所选节点及其规则文件。仍被出站引用的节点会保留并提示先解除引用。',
                icon: Trash2,
                destructive: true,
                runAll: (items) =>
                  api.post('server/manage/batchDelete', {
                    ids: items.map((item) => item.id),
                  }),
              },
            ]}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="选择当前节点"
                  checked={selection.checked}
                  disabled={pageBusy || !rows.length}
                  onCheckedChange={(checked) =>
                    selection.toggleAll(checked === true)
                  }
                />
              </TableHead>
              <TableHead>节点</TableHead>
              <TableHead>在线人数 / 设备</TableHead>
              <TableHead>发布地址</TableHead>
              <TableHead>倍率</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>可见性</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.loading ? (
              <ResourceTableLoading columns={8} />
            ) : (
              rows.map((node) => (
                <TableRow
                  key={node.id}
                  data-state={
                    selection.selectedIds.has(node.id) ? 'selected' : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      aria-label={'选择节点 ' + node.name}
                      checked={selection.selectedIds.has(node.id)}
                      disabled={pageBusy}
                      onCheckedChange={(checked) =>
                        selection.toggle(node.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
                        <Network className="size-4" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="max-w-64 truncate" title={node.name}>
                            {node.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="font-data text-[10px]"
                          >
                            #{node.id}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {node.type}
                          </Badge>
                          <span className="text-xs font-normal text-muted-foreground">
                            {node.enabled ? '实例已启用' : '实例已停用'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><OnlineUsageCell nodeId={node.id} /></TableCell>
                  <TableCell className="font-data text-xs">
                    {node.host}:{node.port}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-data">
                      {String(node.rate ?? 1)}×
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {((node.tags as string[]) ?? []).map((tag) => (
                        <Badge variant="outline" key={tag}>
                          {tag}
                        </Badge>
                      ))}
                      {!((node.tags as string[]) ?? []).length && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={node.show ? '订阅显示' : '订阅隐藏'}
                      tone={node.show ? 'success' : 'neutral'}
                    />
                  </TableCell>
                  <TableCell>
                    <ButtonGroup
                      className="ml-auto"
                      aria-label={node.name + ' 操作'}
                    >
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="订阅排序上移"
                        disabled={pageBusy || nodes.indexOf(node) === 0}
                        onClick={() => void move(nodes.indexOf(node), -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="订阅排序下移"
                        disabled={
                          pageBusy || nodes.indexOf(node) === nodes.length - 1
                        }
                        onClick={() => void move(nodes.indexOf(node), 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageBusy}
                        onClick={() => setEditing(node)}
                      >
                        <SlidersHorizontal data-icon="inline-start" />
                        业务属性
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            disabled={pageBusy}
                            aria-label={node.name + ' 更多操作'}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            {node.machine_id ? (
                              <DropdownMenuItem asChild>
                                <Link
                                  to={
                                    '/servers/' +
                                    node.machine_id +
                                    '/inbounds?instance=' +
                                    node.id
                                  }
                                >
                                  <Settings2 aria-hidden="true" />
                                  入站配置
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuGroup>
                          {(node.machine_id ?? false) && <DropdownMenuSeparator />}
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setRemoving(node)}
                            >
                              <Trash2 aria-hidden="true" />
                              删除节点
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              ))
            )}
            {!query.loading && !rows.length && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {search ? '没有匹配的节点。' : '尚未添加节点。'}
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
      {editing && (
        <RuntimeNodeDialog
          node={editing}
          business
          onClose={() => setEditing(null)}
          onSaved={query.reload}
        />
      )}
      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="删除节点"
        description={
          removing
            ? `将永久删除“${removing.name}”及其规则文件。节点仍被出站引用时，系统会拒绝删除并提示先解除引用。`
            : ''
        }
        confirmLabel="删除节点"
        destructive
        busy={deleteBusy}
        onConfirm={removeNode}
      />
    </div>
  )
}
