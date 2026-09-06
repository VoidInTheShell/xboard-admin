import * as React from 'react'
import {
  Plus,
  RefreshCw,
  Search,
  ArrowUpRight,
  Copy,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { SourceOutboundDialog } from '@/components/control-plane/source-outbound-dialog'
import { WireDialog } from '@/components/control-plane/wire-editor'
import { ConfirmActionDialog } from '@/components/control-plane/confirm-action-dialog'
import {
  ResourceError,
  ResourceTableLoading,
} from '@/components/control-plane/resource-states'
import { StatusBadge } from '@/components/data/status-badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  BulkActions,
  SelectionSummary,
} from '@/components/control-plane/list-controls'
import { useListSelection } from '@/hooks/use-list-selection'
import { Card } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useAdminApi } from '@/lib/auth'
import { getErrorMessage, useAdminQuery } from '@/hooks/use-admin-query'
import { runtimeOutboundCatalog } from '@/lib/control-plane/runtime-catalog'
import type {
  OutboundCandidate,
  RuntimeNode,
} from '@/lib/control-plane/runtime-api'
import type { CatalogTab } from '@/lib/control-plane/catalog-types'
import { readPath } from '@/lib/control-plane/xray-wire'

const tabs: CatalogTab[] = [
  {
    id: 'identity',
    title: '基本信息',
    sections: [
      {
        id: 'identity',
        title: '共享出站',
        fields: [
          { key: '_name', label: '名称', control: 'text', required: true },
          { key: '_enabled', label: '允许绑定', control: 'switch' },
        ],
      },
    ],
  },
  ...runtimeOutboundCatalog,
]
function target(candidate: OutboundCandidate) {
  return String(
    readPath(candidate.config, 'settings.address') ??
      readPath(candidate.config, 'settings.vnext.0.address') ??
      readPath(candidate.config, 'settings.servers.0.address') ??
      readPath(candidate.config, 'settings.redirect') ??
      '—',
  )
}
export function OutboundsPage() {
  const api = useAdminApi()
  const query = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<OutboundCandidate[]>(
          'server/outbound/fetch',
          undefined,
          signal,
        ),
      [api],
    ),
  )
  const [editing, setEditing] =
    React.useState<Partial<OutboundCandidate> | null>(null)
  const [remove, setRemove] = React.useState<OutboundCandidate | null>(null)
  const [removeBusy, setRemoveBusy] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [sourceEditing, setSourceEditing] =
    React.useState<Partial<OutboundCandidate> | null>(null)
  const nodes = useAdminQuery(
    React.useCallback(
      (signal) =>
        api.get<RuntimeNode[]>('server/manage/getNodes', undefined, signal),
      [api],
    ),
  )
  const readBusy = query.loading || query.refreshing
  const nodesBusy = nodes.loading || nodes.refreshing
  const writeBusy = bulkBusy || removeBusy
  const pageBusy = readBusy || writeBusy
  const candidates = query.data ?? []
  const rows = candidates.filter((item) =>
    [item.name, item.config.tag, item.config.protocol]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const selection = useListSelection(rows)
  async function setEnabled(item: OutboundCandidate, enabled: boolean) {
    const latest = (
      await api.get<OutboundCandidate[]>('server/outbound/fetch')
    ).find((candidate) => candidate.id === item.id)
    if (!latest) throw new Error('出站已不存在，请刷新列表')
    return api.post('server/outbound/save', {
      id: item.id,
      name: latest.name,
      enabled,
    })
  }
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="出站管理"
        description="维护可在多台服务器复用的出站连接。"
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
              variant="outline"
              disabled={pageBusy || nodesBusy}
              onClick={() => setSourceEditing({})}
            >
              从已有节点添加
            </Button>
            <Button
              disabled={pageBusy}
              onClick={() =>
                setEditing({
                  name: '',
                  enabled: true,
                  config: { protocol: 'freedom', tag: '', settings: {} },
                })
              }
            >
              <Plus data-icon="inline-start" />
              新增出站
            </Button>
          </>
        }
      />
      {query.error && (
        <ResourceError
          title="无法加载出站"
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
              aria-label="搜索出站"
              placeholder="搜索名称、Tag 或协议…"
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
                id: 'enable',
                label: '允许绑定',
                description: '允许所选出站用于服务器配置。',
                icon: Power,
                run: (item) => setEnabled(item, true),
              },
              {
                id: 'disable',
                label: '停用出站',
                description:
                  '停止允许新的绑定。已有服务器绑定的出站需先解除绑定。',
                icon: PowerOff,
                destructive: true,
                run: (item) => setEnabled(item, false),
              },
              {
                id: 'copy',
                label: '复制出站',
                description: '为每个所选出站创建一份独立副本。',
                icon: Copy,
                run: (item) =>
                  api.post('server/outbound/save', {
                    copy_from_id: item.id,
                    name: item.name + ' 副本',
                  }),
              },
              {
                id: 'delete',
                label: '删除出站',
                description: '永久删除所选出站。仍有服务器绑定的出站不会删除。',
                icon: Trash2,
                destructive: true,
                run: (item) =>
                  api.post('server/outbound/drop', { id: item.id }),
              },
            ]}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="选择当前出站"
                  checked={selection.checked}
                  disabled={pageBusy || !rows.length}
                  onCheckedChange={(checked) =>
                    selection.toggleAll(checked === true)
                  }
                />
              </TableHead>
              <TableHead>名称</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>协议</TableHead>
              <TableHead>目标</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.loading ? (
              <ResourceTableLoading columns={7} />
            ) : (
              rows.map((item) => (
                <TableRow
                  key={item.id}
                  data-state={
                    selection.selectedIds.has(item.id) ? 'selected' : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      aria-label={'选择出站 ' + item.name}
                      checked={selection.selectedIds.has(item.id)}
                      disabled={pageBusy}
                      onCheckedChange={(checked) =>
                        selection.toggle(item.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
                        {item.source_type === 'server' ? (
                          <Link2 className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="max-w-64 truncate" title={item.name}>
                            {item.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="font-data text-[10px]"
                          >
                            #{item.id}
                          </Badge>
                        </div>
                        <div className="max-w-72 truncate text-xs font-normal text-muted-foreground">
                          {item.source_type === 'server'
                            ? (item.source_node?.name ?? '来源节点') +
                              ' · ' +
                              (item.resolution_mode === 'live'
                                ? '随来源更新'
                                : '固定参数')
                            : '手动配置'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    <Badge variant="secondary" className="font-data">
                      {String(item.config.tag ?? '—')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {String(item.config.protocol)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-64 truncate font-data text-xs"
                    title={target(item)}
                  >
                    {target(item)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={item.enabled ? '可用' : '停用'}
                      tone={item.enabled ? 'success' : 'neutral'}
                    />
                  </TableCell>
                  <TableCell>
                    <ButtonGroup
                      className="ml-auto"
                      aria-label={item.name + ' 操作'}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageBusy}
                        onClick={() =>
                          item.source_type === 'server'
                            ? setSourceEditing(item)
                            : setEditing(item)
                        }
                      >
                        <Pencil data-icon="inline-start" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageBusy}
                        onClick={() =>
                          void api
                            .post('server/outbound/save', {
                              copy_from_id: item.id,
                              name: item.name + ' 副本',
                            })
                            .then(() => {
                              query.reload()
                              toast.success('出站已复制')
                            })
                            .catch((error) =>
                              toast.error(getErrorMessage(error)),
                            )
                        }
                      >
                        <Copy data-icon="inline-start" />
                        复制
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pageBusy}
                        onClick={() => setRemove(item)}
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
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {search ? '没有匹配的出站。' : '尚未添加出站。'}
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
      {sourceEditing && (
        <SourceOutboundDialog
          candidate={sourceEditing}
          nodes={nodes.data ?? []}
          onClose={() => setSourceEditing(null)}
          onSaved={query.reload}
        />
      )}
      {editing && (
        <WireDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing.id ? '编辑出站' : '新增出站'}
          description="设置连接目标、协议、传输和安全参数。"
          tabs={tabs}
          kind="outbound"
          errorPrefix="config"
          onValidate={(value) => {
            const { _name, _enabled, ...config } = value
            return api.post('server/outbound/validate', {
              id: editing.id,
              name: _name,
              enabled: _enabled,
              config,
            })
          }}
          value={{
            ...editing.config,
            _name: editing.name ?? '',
            _enabled: editing.enabled ?? true,
          }}
          onSave={async (value) => {
            const { _name, _enabled, ...config } = value
            if (readBusy) throw new Error('出站列表正在刷新，请稍后再保存。')
            if (!String(_name ?? '').trim()) throw new Error('请输入出站名称')
            await api.post('server/outbound/save', {
              id: editing.id,
              name: _name,
              enabled: _enabled,
              config,
            })
            query.reload()
          }}
        />
      )}
      <ConfirmActionDialog
        open={Boolean(remove)}
        onOpenChange={(open) => !open && !removeBusy && setRemove(null)}
        title="删除出站"
        description="请先解除此出站的所有服务器绑定。"
        destructive
        busy={removeBusy || readBusy}
        onConfirm={async () => {
          if (!remove || removeBusy || readBusy) return
          const target = remove
          setRemoveBusy(true)
          try {
            await api.post('server/outbound/drop', { id: target.id })
            setRemove(null)
            query.reload()
          } catch (error) {
            toast.error(getErrorMessage(error))
          } finally {
            setRemoveBusy(false)
          }
        }}
      />
    </div>
  )
}
