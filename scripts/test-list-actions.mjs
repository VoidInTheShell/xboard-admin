import assert from 'node:assert/strict'
import { replaceIndependentInbounds } from '../src/lib/control-plane/xray-wire.ts'
import {
  executeListAction,
  normalizeVisibleColumns,
  selectedListItems,
  reconcileListSelection,
} from '../src/lib/list-actions.ts'
import {
  machineLoadMetrics,
  machineLastSeen,
  machineStatus,
  formatBytes,
  formatRate,
} from '../src/lib/control-plane/runtime-api.ts'

const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
assert.deepEqual(
  selectedListItems(rows, new Set([1, 3, 999])).map((row) => row.id),
  [1, 3],
)
assert.deepEqual(
  selectedListItems(rows.slice(1), new Set([1, 3])).map((row) => row.id),
  [3],
)
console.log('PASS selection excludes missing and filtered-out records')

let selection = { scope: 'page:1', ids: new Set([1, 2]) }
selection = reconcileListSelection(selection, 'page:2', [{ id: 3 }])
selection = reconcileListSelection(selection, 'page:1', rows)
assert.equal(selection.ids.size, 0)
selection = { scope: '', ids: new Set([1, 2]) }
selection = reconcileListSelection(selection, '', [{ id: 2 }])
selection = reconcileListSelection(selection, '', rows)
assert.deepEqual([...selection.ids], [2])
assert.equal(reconcileListSelection(selection, '', rows), selection)
console.log(
  'PASS returning to a page or filter does not revive previous selections',
)

const managed = { streamSettings: { network: 'xhttp' } }
const extra = { tag: 'independent', protocol: 'tunnel' }
assert.deepEqual(
  replaceIndependentInbounds({ inbounds: [managed, extra] }, []),
  { inbounds: [managed] },
)
assert.deepEqual(replaceIndependentInbounds({}, [extra]), {
  inbounds: [{}, extra],
})
assert.deepEqual(managed, { streamSettings: { network: 'xhttp' } })
console.log(
  'PASS independent inbound edits preserve the managed override without materializing defaults',
)

let active = 0,
  peak = 0
const calls = []
const result = await executeListAction(rows, async (row) => {
  active++
  peak = Math.max(peak, active)
  calls.push(row.id)
  await Promise.resolve()
  active--
  if (row.id === 2) throw Error('Protected record')
})
assert.equal(peak, 1)
assert.deepEqual(calls, [1, 2, 3])
assert.deepEqual(
  result.succeeded.map((row) => row.id),
  [1, 3],
)
assert.deepEqual(
  result.failed.map(({ item }) => item.id),
  [2],
)
await executeListAction(
  result.failed.map(({ item }) => item),
  async (row) => {
    calls.push(row.id)
  },
)
assert.deepEqual(calls, [1, 2, 3, 2])
console.log(
  'PASS batches are sequential, continue after failures and retry only failed records',
)

const columns = ['name', 'load', 'traffic']
assert.deepEqual(
  normalizeVisibleColumns(['traffic', 'unknown'], columns, ['name'], columns),
  ['name', 'traffic'],
)
assert.deepEqual(
  normalizeVisibleColumns(null, columns, ['name'], ['name', 'load']),
  ['name', 'load'],
)
assert.deepEqual(normalizeVisibleColumns([], columns, [], columns), ['name'])
assert.deepEqual(
  normalizeVisibleColumns(['traffic', 'traffic'], columns, ['name'], columns),
  ['name', 'traffic'],
)
console.log(
  'PASS column preferences retain required columns and ignore stale keys',
)

const machine = {
  id: 1,
  name: 'Server',
  notes: null,
  is_active: true,
  last_seen_at: 1788630000,
  servers_count: 2,
  load_status: null,
}
assert.equal(machineLastSeen(machine).getTime(), 1788630000000)
assert.equal(
  machineLastSeen({ ...machine, last_seen_at: '1788630000' }).getTime(),
  1788630000000,
)
assert.equal(
  machineLastSeen({
    ...machine,
    last_seen_at: '2026-09-06T00:00:00Z',
  }).toISOString(),
  '2026-09-06T00:00:00.000Z',
)
assert.equal(machineLastSeen({ ...machine, last_seen_at: 'invalid' }), null)
assert.equal(machineStatus({ ...machine, is_active: false }), 'disabled')
console.log(
  'PASS machine heartbeat handles Unix seconds, numeric strings and ISO dates',
)

assert.deepEqual(machineLoadMetrics(machine), {
  cpu: null,
  memory: { total: null, used: null, percent: null },
  disk: { total: null, used: null, percent: null },
  netIn: null,
  netOut: null,
  updatedAt: null,
})
const load = machineLoadMetrics({
  ...machine,
  load_status: {
    cpu: 0,
    mem: { total: 4096, used: 1024 },
    disk: { total: -1, used: NaN },
    net: { in_speed: 0, out_speed: 0.5 },
  },
})
assert.equal(load.cpu, 0)
assert.equal(load.memory.percent, 25)
assert.equal(load.disk.total, null)
assert.equal(load.disk.used, null)
assert.equal(load.netIn, 0)
assert.equal(formatBytes(0), '0 B')
assert.equal(formatRate(0.5), '0.5 B/s')
assert.equal(formatRate(-1), '暂无数据')
assert.equal(formatRate(Infinity), '暂无数据')
console.log(
  'PASS machine load distinguishes zero samples from missing or invalid values',
)
