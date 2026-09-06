import type { CatalogField, CatalogTab } from './catalog-types'
import type {
  CatalogValue,
  CatalogValues,
} from '@/components/control-plane/catalog-form'

export type JsonObject = { [key: string]: unknown }

/** Context shared by the initial form projection, format check and save. */
export type WireContext = {
  /** Used only when a new wire object has no protocol yet. */
  defaultProtocol?: string
  /** All inbounds whose tags are occupied on this instance. */
  existingInbounds?: readonly JsonObject[]
  /** Index of the object currently being edited, if it is in existingInbounds. */
  editingIndex?: number
  /** Set false only for a caller that deliberately wants to defer tag creation. */
  generateTag?: boolean
}

export type InboundTagSource = JsonObject | string

const canonicalProtocol = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'dokodemo-door' ? 'tunnel' : normalized
}

function protocolFallback(kind: string, context?: WireContext) {
  const explicit = String(context?.defaultProtocol ?? '').trim()
  if (explicit) return explicit
  if (kind === 'outbound') return 'freedom'
  // A new independent inbound must not silently become VLESS. The caller
  // needs to provide its protocol seed before any protocol-specific fields
  // are exposed or serialized.
  if (kind === 'independent-inbound') return ''
  return 'vless'
}

function occupiedInboundTag(source: InboundTagSource) {
  if (typeof source === 'string') return source.trim()
  const value = source.tag
  return value === undefined || value === null ? '' : String(value).trim()
}

function tagProtocolPart(protocol: unknown) {
  const value = canonicalProtocol(protocol)
  const part = value.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!part) throw new Error('独立入站必须先选择协议，才能生成运行标签')
  return part
}

function tagPortPart(port: unknown) {
  const value = String(port ?? '').trim()
  const number =
    typeof port === 'number'
      ? port
      : /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  if (Number.isInteger(number) && number >= 0 && number <= 65535)
    return String(number)
  throw new Error('独立入站必须填写监听端口，才能生成运行标签')
}

/**
 * Generate an instance-local inbound tag from protocol and port.
 *
 * Xray references tags globally within one config, so the occupied set is
 * checked case-insensitively even though the core's route lookup is usually
 * case-sensitive. This also matches the Node validation boundary and avoids
 * a save/format-check mismatch.
 */
export function generateInboundTag(
  protocol: unknown,
  port: unknown,
  occupied: readonly InboundTagSource[] = [],
) {
  const base = `${tagProtocolPart(protocol)}-${tagPortPart(port)}`
  const used = new Set<string>()
  for (const source of occupied) {
    const explicit = occupiedInboundTag(source)
    if (explicit) {
      used.add(explicit.toLowerCase())
      continue
    }
    if (typeof source === 'string') continue
    // Unsaved siblings may not have a tag yet. Reserve the first candidate
    // they would receive for their protocol/port, then the next candidate
    // for a second unsaved sibling. This keeps previews deterministic before
    // any of those rows is persisted.
    try {
      const siblingBase = `${tagProtocolPart(source.protocol)}-${tagPortPart(source.port)}`
      let siblingSuffix = 1
      let siblingCandidate = siblingBase
      while (used.has(siblingCandidate.toLowerCase())) {
        siblingSuffix += 1
        siblingCandidate = `${siblingBase}-${siblingSuffix}`
      }
      used.add(siblingCandidate.toLowerCase())
    } catch {
      // An incomplete sibling cannot reserve a deterministic tag yet.
    }
  }
  for (let suffix = 1; suffix <= 10000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  throw new Error('无法为独立入站生成唯一运行标签')
}

/**
 * Keep an explicit tag byte-for-byte stable while filling only an empty tag.
 * `editingIndex` excludes the object being edited from collision detection.
 */
export function ensureIndependentInboundTag(
  inbound: JsonObject,
  existing: readonly JsonObject[] = [],
  editingIndex?: number,
) {
  const next = structuredClone(inbound)
  if (
    next.tag !== undefined &&
    next.tag !== null &&
    String(next.tag).trim() !== ''
  )
    return next
  const occupied = existing.filter((_, index) => index !== editingIndex)
  next.tag = generateInboundTag(next.protocol, next.port, occupied)
  return next
}

export function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}
export function replaceIndependentInbounds(
  config: JsonObject,
  inbounds: readonly JsonObject[],
): JsonObject {
  const managed = Array.isArray(config.inbounds)
    ? config.inbounds[0]
    : undefined
  return { ...config, inbounds: [object(managed), ...inbounds] }
}
export function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as JsonObject)[key]
          : undefined,
      value,
    )
}
export function writePath(root: JsonObject, path: string, value: unknown) {
  const keys = path.split('.')
  let current = root
  keys.forEach((key, index) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('配置路径无效')
    if (index === keys.length - 1) {
      if (value === undefined) delete current[key]
      else current[key] = value
      return
    }
    if (!current[key] || typeof current[key] !== 'object')
      current[key] = key !== 'levels' && /^\d+$/.test(keys[index + 1]) ? [] : {}
    current = current[key] as JsonObject
  })
}
export function fields(tabs: CatalogTab[]) {
  return tabs.flatMap((tab) =>
    tab.sections.flatMap((section) => section.fields),
  )
}
function visible(field: CatalogField, values: CatalogValues) {
  return (
    !field.showWhen
      ? []
      : Array.isArray(field.showWhen)
        ? field.showWhen
        : [field.showWhen]
  ).every((condition) => {
    const current =
      condition.field === 'protocol'
        ? canonicalProtocol(values[condition.field])
        : values[condition.field]
    const equals =
      condition.equals === undefined
        ? null
        : Array.isArray(condition.equals)
          ? condition.equals.map((value) =>
              condition.field === 'protocol'
                ? canonicalProtocol(value)
                : value,
            )
          : [
              condition.field === 'protocol'
                ? canonicalProtocol(condition.equals)
                : condition.equals,
            ]
    const notEquals =
      condition.notEquals === undefined
        ? []
        : Array.isArray(condition.notEquals)
          ? condition.notEquals.map((value) =>
              condition.field === 'protocol'
                ? canonicalProtocol(value)
                : value,
            )
          : [
              condition.field === 'protocol'
                ? canonicalProtocol(condition.notEquals)
                : condition.notEquals,
            ]
    return (
      (!equals || equals.includes(current as never)) &&
      !notEquals.includes(current as never)
    )
  })
}

function protocolApplicable(field: CatalogField, protocol: unknown) {
  const conditions = !field.showWhen
    ? []
    : Array.isArray(field.showWhen)
      ? field.showWhen
      : [field.showWhen]
  const selected = canonicalProtocol(protocol)
  return conditions
    .filter((condition) => condition.field === 'protocol')
    .every((condition) => {
      const equals =
        condition.equals === undefined
          ? []
          : Array.isArray(condition.equals)
            ? condition.equals.map(canonicalProtocol)
            : [canonicalProtocol(condition.equals)]
      const notEquals =
        condition.notEquals === undefined
          ? []
          : Array.isArray(condition.notEquals)
            ? condition.notEquals.map(canonicalProtocol)
            : [canonicalProtocol(condition.notEquals)]
      return (
        (!equals.length || equals.includes(selected)) &&
        !notEquals.includes(selected)
      )
    })
}
function normalized(wire: JsonObject, kind: string): JsonObject {
  const copy = structuredClone(wire)
  if (kind === 'outbound' && copy.protocol === 'vless') {
    const settings = object(copy.settings)
    const next = Array.isArray(settings.vnext) ? settings.vnext : []
    const endpoint = object(next[0])
    const users = Array.isArray(endpoint.users) ? endpoint.users : []
    if (!settings.address && next.length === 1 && users.length === 1) {
      copy.settings = {
        ...settings,
        ...object(users[0]),
        address: endpoint.address,
        port: endpoint.port,
      }
      delete object(copy.settings).vnext
    }
  }
  return copy
}
function pathFor(field: CatalogField, values: CatalogValues, kind: string) {
  const key = field.backendKey ?? field.key
  if (kind !== 'outbound' || !key.startsWith('settings.')) return key
  const protocol = canonicalProtocol(values.protocol)
  const leaf = key.slice(9)
  if (protocol === 'vmess') {
    if (['address', 'port'].includes(leaf)) return 'settings.vnext.0.' + leaf
    if (['id', 'security', 'level', 'email'].includes(leaf))
      return 'settings.vnext.0.users.0.' + leaf
  }
  if (protocol === 'vless') {
    if (leaf === 'reverseTag') return 'settings.reverse.tag'
    if (leaf.startsWith('reverseSniffing.'))
      return 'settings.reverse.sniffing.' + leaf.slice(16)
  }
  if (['trojan', 'shadowsocks', 'socks', 'http'].includes(String(protocol))) {
    if (['user', 'pass'].includes(leaf))
      return 'settings.servers.0.users.0.' + leaf
    if (
      ['address', 'port', 'password', 'method', 'uot', 'UoTVersion'].includes(
        leaf,
      )
    )
      return 'settings.servers.0.' + leaf
  }
  if (protocol === 'blackhole' && leaf === 'type')
    return 'settings.response.type'
  return key
}

function fieldDefault(field: CatalogField): CatalogValue {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.control === 'switch') return false
  if (field.control === 'multiselect' || field.control === 'tags') return []
  return ''
}

function normalizeFieldValue(
  field: CatalogField,
  value: unknown,
): CatalogValue {
  if (value === undefined || value === null) return fieldDefault(field)
  if (field.control === 'code')
    return typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
  if (field.control === 'switch' || field.valueType === 'boolean')
    return Boolean(value)
  if (field.control === 'number' || field.valueType === 'number') {
    const number = Number(value)
    return Number.isFinite(number) ? number : ''
  }
  if (field.control === 'multiselect')
    return Array.isArray(value) ? value.map(String) : []
  if (field.control === 'tags')
    return Array.isArray(value) ? value.map(String).join(',') : String(value)
  if (field.control === 'select') return String(value)
  return String(value)
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function meaningfulValue(value: CatalogValue | undefined) {
  return (
    value !== undefined &&
    value !== '' &&
    value !== false &&
    !(Array.isArray(value) && value.length === 0)
  )
}

function deletePath(root: JsonObject, path: string) {
  const keys = path.split('.')
  let current: unknown = root
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (!current || typeof current !== 'object') return
    current = (current as JsonObject)[keys[index]]
  }
  if (current && typeof current === 'object')
    delete (current as JsonObject)[keys[keys.length - 1]]
}

const streamNetworks = new Set([
  'tcp',
  'kcp',
  'ws',
  'grpc',
  'httpupgrade',
  'xhttp',
])

function fieldValueForWire(
  field: CatalogField,
  raw: CatalogValue | undefined,
  values: CatalogValues,
  kind: string,
  protocolChanged: boolean,
): CatalogValue | undefined {
  if (
    field.key === 'streamSettings.network' &&
    ['inbound', 'independent-inbound'].includes(kind)
  ) {
    const protocol = canonicalProtocol(values.protocol)
    if (protocol === 'hysteria') return 'hysteria'
    if (
      protocolChanged &&
      ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(protocol) &&
      (raw === undefined || !streamNetworks.has(String(raw)))
    )
      return 'tcp'
  }
  return raw
}

function protocolScopedPathsToClear(
  list: CatalogField[],
  original: CatalogValues,
  values: CatalogValues,
  kind: string,
  protocolChanged: boolean,
) {
  if (!protocolChanged) return []
  const paths = new Set<string>()
  for (const field of list) {
    const wasVisible = visible(field, original)
    const isVisible = visible(field, values)
    const wasProtocolApplicable = protocolApplicable(field, original.protocol)
    const isProtocolApplicable = protocolApplicable(field, values.protocol)
    if (
      (wasVisible && !isVisible) ||
      (wasProtocolApplicable && !isProtocolApplicable)
    )
      paths.add(pathFor(field, original, kind))
    // `settings.clients` is shared by several protocol forms but the object
    // shape is not. Never carry a VLESS client object into Hysteria (or back)
    // when the user did not explicitly replace it.
    if (
      kind === 'independent-inbound' &&
      field.key === 'settings.clients' &&
      wasVisible &&
      isVisible &&
      sameValue(values[field.key], original[field.key])
    )
      paths.add(pathFor(field, original, kind))
  }
  return [...paths].filter(Boolean)
}

function protocolScopedBranchesToClear(
  originalProtocol: unknown,
  nextProtocol: unknown,
  kind: string,
  protocolChanged: boolean,
) {
  if (!protocolChanged || kind !== 'outbound') return []
  const previous = canonicalProtocol(originalProtocol)
  const next = canonicalProtocol(nextProtocol)
  if (previous === next) return []
  if (previous === 'vmess' && next !== 'vmess') return ['settings.vnext']
  if (
    ['trojan', 'shadowsocks', 'socks', 'http'].includes(previous) &&
    !['trojan', 'shadowsocks', 'socks', 'http'].includes(next)
  )
    return ['settings.servers']
  if (previous === 'vless' && next !== 'vless') return ['settings.reverse']
  if (previous === 'blackhole' && next !== 'blackhole')
    return ['settings.response']
  return []
}

function missingHysteriaDefault(
  field: CatalogField,
  base: JsonObject,
  protocol: string,
  values: CatalogValues,
  kind: string,
) {
  if (canonicalProtocol(protocol) !== 'hysteria') return false
  if (
    ![
      'settings.version',
      'streamSettings.network',
      'streamSettings.security',
      'streamSettings.hysteriaSettings.version',
    ].includes(field.key)
  )
    return false
  const path = pathFor(field, values, kind)
  const current = readPath(base, path)
  return current === undefined || current === null
}

const toggles: Record<string, string> = {
  'streamSettings.sockopt.enabled': 'streamSettings.sockopt',
  'streamSettings.sockopt.happyEyeballs.enabled':
    'streamSettings.sockopt.happyEyeballs',
  'streamSettings.xhttpSettings.enableXmux':
    'streamSettings.xhttpSettings.xmux',
  'dns.enabled': 'dns',
  'metrics.enabled': 'metrics',
  'fakedns.enabled': 'fakedns',
}
export function fromWire(
  tabs: CatalogTab[],
  wire: JsonObject,
  kind = '',
  context?: WireContext,
): CatalogValues {
  const source = normalized(wire, kind)
  const sourceProtocol = String(source.protocol ?? '').trim()
  const values: CatalogValues = {
    protocol: sourceProtocol || protocolFallback(kind, context),
  }
  const list = fields(tabs)
  const assign = (field: CatalogField) => {
    // Catalog defaults describe the generic form, but an absent protocol is
    // meaningful for a new independent inbound: it must remain empty until
    // the caller chooses one. Use the kind/context fallback calculated above
    // instead of allowing the protocol field's static VLESS default to leak
    // into that new object.
    let value =
      field.key === 'protocol' && !sourceProtocol
        ? values.protocol
        : readPath(source, pathFor(field, values, kind))
    if (toggles[field.key])
      value = Boolean(readPath(source, toggles[field.key]))
    if (field.key === 'observatory.mode')
      value = source.burstObservatory
        ? 'burstObservatory'
        : source.observatory
          ? 'observatory'
          : 'none'
    values[field.key] = normalizeFieldValue(field, value)
  }
  list.forEach(assign)
  list.filter((field) => visible(field, values)).forEach(assign)
  return values
}
export function toWire(
  tabs: CatalogTab[],
  values: CatalogValues,
  base: JsonObject,
  kind = '',
  context?: WireContext,
): JsonObject {
  const original = fromWire(tabs, base, kind, context)
  const requestedProtocol = String(values.protocol ?? '').trim()
  const protocol = requestedProtocol || protocolFallback(kind, context)
  if (kind === 'independent-inbound' && !protocol)
    throw new Error('独立入站必须先选择协议')
  let effectiveValues: CatalogValues =
    protocol === requestedProtocol
      ? values
      : { ...values, protocol }
  const originalProtocol = canonicalProtocol(original.protocol)
  const nextProtocol = canonicalProtocol(protocol)
  const protocolChanged =
    ['outbound', 'independent-inbound'].includes(kind) &&
    nextProtocol !== originalProtocol
  if (['outbound', 'inbound', 'independent-inbound'].includes(kind)) {
    const currentNetwork = String(
      effectiveValues['streamSettings.network'] ?? '',
    ).trim()
    const streamProtocol = [
      'vmess',
      'vless',
      'trojan',
      'shadowsocks',
    ].includes(nextProtocol)
    const network =
      nextProtocol === 'hysteria'
        ? 'hysteria'
        : streamProtocol
          ? streamNetworks.has(currentNetwork)
            ? currentNetwork
            : 'tcp'
          : ''
    if (network !== currentNetwork)
      effectiveValues = {
        ...effectiveValues,
        'streamSettings.network': network,
      }
    if (
      nextProtocol === 'hysteria' &&
      effectiveValues['streamSettings.security'] !== 'tls'
    )
      effectiveValues = {
        ...effectiveValues,
        'streamSettings.security': 'tls',
      }
  }
  const list = fields(tabs)
  const changedTogglePaths = Object.entries(toggles)
    .filter(
      ([key]) =>
        effectiveValues[key] === true && original[key] !== true,
    )
    .map(([, path]) => path)
  const changed = list.filter((field) => {
    if (!visible(field, effectiveValues)) return false
    const value = fieldValueForWire(
      field,
      effectiveValues[field.key],
      effectiveValues,
      kind,
      protocolChanged,
    )
    const valueChanged = !sameValue(value, original[field.key])
    const becameVisible = protocolChanged && !visible(field, original)
    const pathChanged =
      pathFor(field, effectiveValues, kind) !== pathFor(field, original, kind)
    const carriesOldProtocolClients =
      kind === 'independent-inbound' &&
      field.key === 'settings.clients' &&
      becameVisible &&
      sameValue(value, original[field.key])
    const needsHysteriaDefault = missingHysteriaDefault(
      field,
      base,
      nextProtocol,
      effectiveValues,
      kind,
    )
    return (
      valueChanged ||
      (becameVisible && meaningfulValue(value) && !carriesOldProtocolClients) ||
      (pathChanged && meaningfulValue(value) && !carriesOldProtocolClients) ||
      (needsHysteriaDefault && meaningfulValue(value)) ||
      (changedTogglePaths.some((path) =>
        pathFor(field, effectiveValues, kind).startsWith(path + '.'),
      ) &&
        field.defaultValue !== undefined)
    )
  })
  if (
    !changed.length &&
    effectiveValues['observatory.mode'] === original['observatory.mode'] &&
    !(kind === 'independent-inbound' &&
      (!base.tag || String(base.tag).trim() === ''))
  )
    return structuredClone(base)
  const result = normalized(base, kind)
  for (const path of protocolScopedBranchesToClear(
    original.protocol,
    effectiveValues.protocol,
    kind,
    protocolChanged,
  ))
    deletePath(result, path)
  for (const path of protocolScopedPathsToClear(
    list,
    original,
    effectiveValues,
    kind,
    protocolChanged,
  ))
    deletePath(result, path)
  changed.sort(
    (a, b) =>
      pathFor(a, effectiveValues, kind).split('.').length -
      pathFor(b, effectiveValues, kind).split('.').length,
  )
  if (protocolChanged) {
    result.protocol = protocol
  }
  for (const path of changedTogglePaths)
    if (!readPath(result, path))
      writePath(result, path, path === 'fakedns' ? [] : {})
  for (const field of changed) {
    const key = field.key
    if (toggles[key] || key === 'observatory.mode') continue
    let value: unknown = fieldValueForWire(
      field,
      effectiveValues[key],
      effectiveValues,
      kind,
      protocolChanged,
    )
    if (value === '' || value === undefined)
      value = value === '' && key === 'settings.flow' ? '' : undefined
    else if (field.control === 'code') {
      try {
        value = JSON.parse(String(value))
      } catch {
        throw new Error(field.label + '：JSON 格式错误')
      }
    } else if (field.control === 'number' || field.valueType === 'number') {
      value = Number(value)
      if (!Number.isFinite(value))
        throw new Error(field.label + '：请输入有效数字')
    } else if (field.control === 'tags' || field.control === 'multiselect')
      value = Array.isArray(value)
        ? value
        : String(value)
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean)
    if (
      kind === 'outbound' &&
      effectiveValues.protocol === 'wireguard' &&
      ['settings.address', 'settings.reserved'].includes(key) &&
      value !== undefined
    )
      value = String(effectiveValues[key])
        .split(',')
        .map((item) =>
          key.endsWith('reserved') ? Number(item.trim()) : item.trim(),
        )
        .filter((item) => item !== '')
    writePath(result, pathFor(field, effectiveValues, kind), value)
  }
  for (const [key, path] of Object.entries(toggles))
    if (effectiveValues[key] === false && original[key] === true)
      writePath(result, path, undefined)
  if (effectiveValues['observatory.mode'] !== original['observatory.mode']) {
    const mode = effectiveValues['observatory.mode']
    if (mode !== 'observatory') delete result.observatory
    if (mode !== 'burstObservatory') delete result.burstObservatory
    if (mode === 'observatory' || mode === 'burstObservatory')
      result[mode] ??= {}
  }
  if (kind === 'outbound') {
    result.protocol ??= protocol
    if (!result.tag && effectiveValues.tag) result.tag = effectiveValues.tag
    result.settings ??= {}
    if (nextProtocol === 'vless' && object(result.settings).address) {
      object(result.settings).encryption ||= 'none'
      if (
        changed.some((field) => field.key === 'settings.reverseTag') &&
        !effectiveValues['settings.reverseTag']
      )
        delete object(result.settings).reverse
    }
    if (
      readPath(result, 'proxySettings.tag') &&
      readPath(result, 'streamSettings.sockopt.dialerProxy')
    )
      throw new Error('proxySettings 与 dialerProxy 不能同时启用')
  }
  if (kind === 'independent-inbound') {
    result.protocol = protocol
    if (context?.generateTag !== false)
      return ensureIndependentInboundTag(
        result,
        context?.existingInbounds ?? [],
        context?.editingIndex,
      )
  }
  return result
}

/** Only changed sections become instance overrides; inherited sections stay inherited. */
export function applyEffectiveChanges(
  overrides: JsonObject,
  before: JsonObject,
  after: JsonObject,
): JsonObject {
  const next = structuredClone(overrides)
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      next[key] = after[key] === undefined ? null : after[key]
  }
  return next
}
