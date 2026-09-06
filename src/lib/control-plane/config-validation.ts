import type { CatalogField, CatalogTab } from './catalog-types'
import type {
  CatalogValues,
  CatalogFieldErrors,
} from '../../components/control-plane/catalog-form'

export class ConfigValidationError extends Error {
  readonly fieldErrors: CatalogFieldErrors
  constructor(fieldErrors: CatalogFieldErrors) {
    super('配置检查未通过，请修正标记的配置项。')
    this.fieldErrors = fieldErrors
  }
}

export function configFieldVisible(field: CatalogField, values: CatalogValues) {
  const conditions = field.showWhen
    ? Array.isArray(field.showWhen)
      ? field.showWhen
      : [field.showWhen]
    : []
  return conditions.every((condition) => {
    const current = values[condition.field]
    const expected =
      condition.equals === undefined
        ? undefined
        : Array.isArray(condition.equals)
          ? condition.equals
          : [condition.equals]
    const blocked =
      condition.notEquals === undefined
        ? []
        : Array.isArray(condition.notEquals)
          ? condition.notEquals
          : [condition.notEquals]
    return (
      (!expected || expected.includes(current as never)) &&
      !blocked.includes(current as never)
    )
  })
}

export function visibleConfigFields(tabs: CatalogTab[], values: CatalogValues) {
  return tabs
    .flatMap((tab) => tab.sections.flatMap((section) => section.fields))
    .filter((field) => configFieldVisible(field, values))
}

export function validateConfigFields(
  tabs: CatalogTab[],
  values: CatalogValues,
  kind = '',
) {
  const errors: CatalogFieldErrors = {}
  const add = (key: string, message: string) => {
    errors[key] = [...(errors[key] ?? []), message]
  }
  for (const field of visibleConfigFields(tabs, values)) {
    const value = values[field.key]
    const empty =
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && !value.length)
    if (
      field.required &&
      empty &&
      !(kind === 'independent-inbound' && field.key === 'tag')
    )
      add(field.key, '请填写' + field.label + '。')
    if (empty) continue
    if (field.control === 'code' && (field.language ?? 'json') === 'json') {
      try {
        JSON.parse(String(value))
      } catch {
        add(field.key, 'JSON 格式错误，请检查引号、逗号和括号。')
      }
    }
    if (
      (field.control === 'number' || field.valueType === 'number') &&
      !Number.isFinite(Number(value))
    )
      add(field.key, '请输入有效数字。')
    if (['port', 'settings.port', 'http_port'].includes(field.key)) {
      const port = Number(value),
        unix =
          String(values.listen ?? '').startsWith('/') ||
          String(values.listen ?? '').startsWith('@')
      if (
        !Number.isInteger(port) ||
        port > 65535 ||
        port < (field.key === 'port' && unix ? 0 : 1)
      )
        add(field.key, '端口须为 1–65535 的整数；Unix socket 监听可填写 0。')
    }
  }
  if (kind === 'independent-inbound') {
    if (!String(values.protocol ?? '').trim())
      add('protocol', '请选择入站协议。')
    if (values.port === '' || values.port === undefined)
      add('port', '请填写监听端口。')
  }
  if (kind === 'certificate') {
    const mode = values.cert_mode
    const required =
      mode === 'content'
        ? ['cert_content', 'key_content']
        : ['http', 'dns', 'self'].includes(String(mode))
          ? ['domain']
          : []
    if (mode === 'dns') required.push('dns_provider', 'dns_env')
    for (const key of required)
      if (!String(values[key] ?? '').trim())
        add(key, '此证书模式需要填写此项。')
  }
  if (Object.keys(errors).length) throw new ConfigValidationError(errors)
}

export type ConfigIssue = {
  path: string
  field?: string
  label: string
  messages: string[]
}
export function configIssues(
  error: unknown,
  tabs: CatalogTab[],
  values: CatalogValues,
  prefix = '',
): ConfigIssue[] {
  const fields = visibleConfigFields(tabs, values)
  const raw =
    error && typeof error === 'object' && 'fieldErrors' in error
      ? error.fieldErrors
      : undefined
  let entries = raw && typeof raw === 'object' ? Object.entries(raw) : []
  if (!entries.length)
    entries.push([
      '',
      [error instanceof Error ? error.message : '配置检查失败，请重试。'],
    ])
  if (entries.length > 1)
    entries = entries.filter(
      ([path]) =>
        path !== 'xray_config' &&
        !entries.some(
          ([candidate]) =>
            candidate !== path && candidate.startsWith(path + '.'),
        ),
    )
  return entries.map(([path, content]) => {
    const messages = (Array.isArray(content) ? content : [content]).filter(
      (item): item is string => typeof item === 'string',
    )
    const embedded = messages
      .map(
        (message) =>
          message.match(
            /(?:xray_config|cert_config|client_settings)[.][\w.]+/,
          )?.[0],
      )
      .find(Boolean)
    const fullPath = (
      path && path !== 'xray_config' ? path : (embedded ?? path)
    ).replace(/\[(\d+)\]/g, '.$1')
    let relative = fullPath
    if (prefix && relative.startsWith(prefix + '.'))
      relative = relative.slice(prefix.length + 1)
    else if (relative.startsWith('xray_config.')) relative = relative.slice(12)
    relative = relative.replace(
      /^client_settings[.]encryption(?:[.]encryption)?$/,
      'clientSettings.encryption',
    )
    if (relative === 'name' && fields.some((field) => field.key === '_name'))
      relative = '_name'
    if (
      (relative === 'config_patch' || relative.startsWith('config_patch.')) &&
      fields.some((field) => field.key === 'overrides')
    )
      relative = 'overrides'
    const field =
      fields.find(
        (field) => field.key === relative || field.backendKey === relative,
      ) ??
      [...fields]
        .sort((a, b) => b.key.length - a.key.length)
        .find((field) => relative.startsWith(field.key + '.')) ??
      fields.find((field) =>
        messages.some((message) => message.startsWith(field.label + '：')),
      ) ??
      fields.find((field) => field.key === 'config' && field.control === 'code')
    return {
      path: fullPath,
      field: field?.key,
      label: field?.label ?? (fullPath || '配置'),
      messages,
    }
  })
}
