import { formatTrafficBytes } from "@/lib/traffic-format";
import type { JsonObject } from './xray-wire'

export type MachineResourceLoad = {
  total: number | null
  used: number | null
  percent: number | null
}

export type MachineLoadStatus = JsonObject & {
  cpu?: number | null
  mem?: {
    total?: number | null
    used?: number | null
  } | null
  disk?: {
    total?: number | null
    used?: number | null
  } | null
  net?: {
    in_speed?: number | null
    out_speed?: number | null
  } | null
  updated_at?: string | number | null
}

export type MachineLoadMetrics = {
  cpu: number | null
  memory: MachineResourceLoad
  disk: MachineResourceLoad
  netIn: number | null
  netOut: number | null
  updatedAt: Date | null
}

export type MachineStatus = 'disabled' | 'online' | 'offline'

export type Machine = {
  id: number
  name: string
  notes: string | null
  is_active: boolean
  last_seen_at: string | number | null
  servers_count: number
  load_status: MachineLoadStatus | null
}
export type RuntimeNode = {
  id: number
  name: string
  type: string
  host: string
  port: number
  server_port?: number
  enabled: boolean
  show: boolean
  machine_id?: number
  protocol_settings?: JsonObject
  cert_config?: JsonObject
  [key: string]: unknown
}
export type OutboundCandidate = {
  id: number
  name: string
  enabled: boolean
  config: JsonObject
  config_override?: JsonObject
  updated_at?: string
  source_type?: 'manual' | 'server'
  source_node_id?: number
  resolution_mode?: 'pinned' | 'live'
  credential_configured?: boolean
  source_node?: { id: number; name: string; type: string }
}
export type OutboundBinding = {
  outbound_id: number
  tag?: string
  enabled?: boolean
}
export type XrayResource = {
  node_id: number
  machine_id: number | null
  xray_config: JsonObject
  machine_defaults: JsonObject
  effective_config: JsonObject
  managed_inbound: JsonObject
  effective_inbound: JsonObject
  client_settings?: JsonObject
  config_revision: number
  config_hash: string
  default_outbound_tag: string
  application: JsonObject | null
  outbound_bindings: OutboundBinding[] | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nonNegativeNumber(value: unknown) {
  const parsed = finiteNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

function clampPercent(value: number | null) {
  return value === null ? null : Math.min(100, Math.max(0, value))
}

function dateLike(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    const date = new Date(value * 1000)
    return Number.isFinite(date.getTime()) ? date : null
  }
  const text = value.trim()
  if (!text) return null
  const numeric = finiteNumber(text)
  const date = numeric === null ? new Date(text) : new Date(numeric * 1000)
  return Number.isFinite(date.getTime()) ? date : null
}

function resourceLoad(value: unknown): MachineResourceLoad {
  const source = record(value)
  const total = nonNegativeNumber(source.total)
  const used = nonNegativeNumber(source.used)
  const percent =
    total !== null && total > 0 && used !== null
      ? clampPercent((used / total) * 100)
      : null
  return { total, used, percent }
}

/**
 * Reads the machine heartbeat payload exactly as reported by the Node agent.
 * Missing values remain null so the UI can distinguish unavailable data from
 * a real zero reading.
 */
export function machineLoadMetrics(machine: Machine): MachineLoadMetrics {
  const source = record(machine.load_status)
  const net = record(source.net)
  return {
    cpu: clampPercent(nonNegativeNumber(source.cpu)),
    memory: resourceLoad(source.mem),
    disk: resourceLoad(source.disk),
    netIn: nonNegativeNumber(net.in_speed),
    netOut: nonNegativeNumber(net.out_speed),
    updatedAt: dateLike(
      source.updated_at as string | number | null | undefined,
    ),
  }
}

export function formatPercent(value: number | null) {
  if (value === null) return '暂无数据'
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)}%`
}

export function formatBytes(value: number | null) {
  return formatTrafficBytes(value);
}

export function formatRate(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return '暂无数据'
  return `${formatBytes(value)}/s`
}

export function formatResourceUsage(resource: MachineResourceLoad) {
  if (resource.used !== null && resource.total !== null)
    return `${formatBytes(resource.used)} / ${formatBytes(resource.total)}`
  if (resource.used !== null) return formatBytes(resource.used)
  if (resource.total !== null) return `总计 ${formatBytes(resource.total)}`
  return '暂无数据'
}

export function machineLastSeen(machine: Machine) {
  return dateLike(machine.last_seen_at)
}

export function machineLastSeenLabel(machine: Machine, now = Date.now()) {
  const date = machineLastSeen(machine)
  if (!date) return '尚未连接'
  const seconds = Math.floor((now - date.getTime()) / 1000)
  if (seconds <= 0) return '刚刚'
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return date.toLocaleString()
}

export function online(machine: Machine) {
  const lastSeen = machineLastSeen(machine)
  return (
    machine.is_active &&
    lastSeen !== null &&
    Date.now() - lastSeen.getTime() < 120000
  )
}

export function machineStatus(machine: Machine): MachineStatus {
  if (!machine.is_active) return 'disabled'
  return online(machine) ? 'online' : 'offline'
}

export function applicationError(application: JsonObject) {
  const messages: Record<string, string> = {
    validation_failed: '配置校验失败，请检查字段和取值。',
    parse_xray_config: '无法读取 Xray 配置，请检查格式和参数。',
    create_xray_instance: '无法创建运行实例，请检查协议、证书和依赖文件。',
    activate_xray_instance: '无法启动新配置，请检查监听端口和文件权限。',
    rollback_failed: '新配置和原配置均未能启动，请检查节点状态。',
    apply_failed: '配置未能生效，请检查节点日志。',
  }
  const detail = String(application.error_message ?? '').trim()
  return (
    (detail ||
      messages[String(application.error)] ||
      '配置未能生效，请检查节点日志。') +
    (application.error_path
      ? ' 错误位置：' + String(application.error_path)
      : '')
  )
}

export function applicationFieldErrors(
  application: JsonObject | null | undefined,
) {
  if (!application) return {}
  const path =
    String(application.error_path ?? '').replace(/\[(\d+)\]/g, '.$1') ||
    'xray_config'
  const message =
    String(application.error_message ?? '').trim() ||
    applicationError(application)
  return { [path]: [message] }
}
