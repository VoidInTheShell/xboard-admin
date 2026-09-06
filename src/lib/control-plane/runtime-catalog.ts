import type { CatalogCondition, CatalogField, CatalogTab } from './catalog-types'
import { inboundCatalog } from './inbound-catalog'
import { outboundCatalog } from './outbound-host-catalog'
import { xrayCatalog, routingCatalog } from './routing-xray-catalog'

const cleanText = (value?: string) =>
  value
    ?.split(/[。；]/)
    .filter(
      (sentence) =>
        !/3x-?ui|xboard|业务|编辑器|投影|线协议|后端|原型|schema|\bwire\b|运行字段|运行时字段|适配|编译|序列化|下发|模板合并|表单|控制面|分享|传播|保留.*字段|当前.*支持|接管|归一|由内核生成|显示|展开|动态选项|自动汇总|自动推导|不应脱离|HostSockopt|目录实现|面板约定|只描述|仅写入|仅保留|字段映射/i.test(
          sentence,
        ),
    )
    .join('；')
    .replaceAll('blocked', 'block')
    .replace(/[；]+$/, '') || undefined
function clean(
  tabs: CatalogTab[],
  accept: (field: CatalogField) => boolean,
): CatalogTab[] {
  return tabs
    .map((tab) => ({
      ...tab,
      description: cleanText(tab.description),
      sections: tab.sections
        .map((section) => ({
          ...section,
          description: cleanText(section.description),
          fields: section.fields.filter(accept).map((field) => ({
            ...field,
            description: cleanText(field.description),
            options: field.options
              ?.filter(
                (option) =>
                  !['xmc', 'mkcp-legacy', 'realm'].includes(option.value),
              )
              .map((option) => ({
                ...option,
                value: option.value === 'blocked' ? 'block' : option.value,
                label: option.label.replaceAll('blocked', 'block'),
              })),
          })),
        }))
        .filter((section) => section.fields.length),
    }))
    .filter((tab) => tab.sections.length)
}
const supportedInboundField = (field: CatalogField) =>
  ![
    'settings.subnetIp',
    'settings.subnetCidr',
    'settings.dns',
    'settings.gateway',
    'settings.autoSystemRoutingTable',
    'settings.autoOutboundsInterface',
    'settings.server.subnetIp',
    'settings.server.subnetCidr',
    'streamSettings.finalmask.quicParams.bbrProfile',
  ].includes(field.key)
export const runtimeInboundCatalog = clean(
  inboundCatalog,
  (field) =>
    ![
      'enable',
      'remark',
      'protocol',
      'tag',
      'settings.auth',
      'settings.password',
      'settings.encryption',
      'settings.publicKey',
    ].includes(field.key) &&
    !field.key.startsWith('settings.clients') &&
    !field.key.startsWith('settings.accounts') &&
    !field.key.includes('Settings.settings.') &&
    !field.key.includes('[]') &&
    field.key !== 'sniffing.ipsExcluded' &&
    supportedInboundField(field),
)
export const runtimeIndependentInboundCatalog = clean(
  inboundCatalog,
  (field) =>
    !['enable', 'remark', 'settings.encryption', 'settings.publicKey'].includes(
      field.key,
    ) &&
    !field.key.includes('Settings.settings.') &&
    !field.key.includes('[]') &&
    field.key !== 'sniffing.ipsExcluded' &&
    supportedInboundField(field),
)
for (const tabs of [runtimeInboundCatalog, runtimeIndependentInboundCatalog]) {
  const section = tabs.find((tab) => tab.id === 'protocol')?.sections[0]
  section?.fields.push({
    key: 'settings.flow',
    label: 'VLESS 流控',
    control: 'select',
    options: [
      { value: '', label: '无' },
      { value: 'xtls-rprx-vision', label: 'XTLS Vision' },
    ],
    showWhen: { field: 'protocol', equals: 'vless' },
  })
}
runtimeInboundCatalog
  .find((tab) => tab.id === 'protocol')
  ?.sections.push({
    id: 'vless-client-encryption',
    title: '客户端加密参数',
    fields: [
      {
        key: 'clientSettings.encryption',
        label: 'VLESS 客户端 Encryption',
        control: 'textarea',
        rows: 3,
        span: 2,
        showWhen: { field: 'protocol', equals: 'vless' },
        description:
          '启用 VLESS 协议加密时，填写与服务端 Decryption 配对的客户端参数。此值会包含在用户订阅中。',
      },
    ],
  })
for (const tabs of [runtimeInboundCatalog, runtimeIndependentInboundCatalog])
  for (const tab of tabs)
    for (const section of tab.sections)
      for (const field of section.fields) {
        if (field.key === 'protocol') {
          field.options = field.options?.filter(
            (option) => !['mtproto', 'amneziawg'].includes(option.value),
          )
          if (!field.options?.some((option) => option.value === 'socks'))
            field.options?.push({ value: 'socks', label: 'SOCKS' })
        }
        const conditions = !field.showWhen
          ? []
          : Array.isArray(field.showWhen)
            ? field.showWhen
            : [field.showWhen]
        field.showWhen = conditions.map((condition) => {
          if (condition.field !== 'protocol') return condition
          const values =
            condition.equals === undefined
              ? undefined
              : Array.isArray(condition.equals)
                ? condition.equals
                : [condition.equals]
          return values?.includes('mixed')
            ? { ...condition, equals: [...values, 'socks'] as string[] }
            : condition
        })
        if (field.key.startsWith('streamSettings.finalmask.'))
          field.backendKey = field.key.replace('finalmask', 'finalMask')
        if (field.key === 'streamSettings.sockopt.tcpcongestion')
          field.backendKey = 'streamSettings.sockopt.tcpCongestion'
        if (
          ['settings.version', 'streamSettings.hysteriaSettings.version'].includes(
            field.key,
          )
        )
          field.valueType = 'number'
        if (field.key === 'settings') field.placeholder = '{}'
      }
export const runtimeOutboundCatalog = clean(
  outboundCatalog,
  (field) =>
    field.key !== 'settings.pubKey' && !field.key.endsWith('.ipsExcluded'),
)
for (const tab of runtimeOutboundCatalog)
  for (const section of tab.sections)
    for (const field of section.fields) {
      if (field.key.startsWith('streamSettings.finalmask.'))
        field.backendKey = field.key.replace('finalmask', 'finalMask')
      if (field.key === 'streamSettings.sockopt.tcpcongestion')
        field.backendKey = 'streamSettings.sockopt.tcpCongestion'
      if (
        ['settings.version', 'streamSettings.hysteriaSettings.version'].includes(
          field.key,
        )
      )
        field.valueType = 'number'
    }
runtimeOutboundCatalog.push({
  id: 'wire-advanced',
  title: '高级与代理链',
  sections: [
    {
      id: 'proxy-settings',
      title: '链式代理',
      fields: [
        {
          key: 'proxySettings.tag',
          label: '下一跳 Tag',
          control: 'text',
          description: '通过指定出站转发连接，不能与 dialerProxy 同时使用。',
        },
        {
          key: 'proxySettings.transportLayer',
          label: '使用传输层代理',
          control: 'switch',
        },
        {
          key: 'settings',
          label: '协议原生 settings',
          control: 'code',
          language: 'json',
          sensitive: true,
          description: '编辑此协议的完整连接参数。',
        },
      ],
    },
  ],
})
export const runtimeRuleCatalog: CatalogTab[] = clean(
  routingCatalog.filter((tab) => tab.id === 'rules'),
  (field) => field.key !== 'routing.rule.enabled',
).map((tab) => ({
  ...tab,
  sections: tab.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      defaultValue:
        field.defaultValue === 'blocked' ? 'block' : field.defaultValue,
      backendKey: field.key.replace('routing.rule.', ''),
    })),
  })),
}))
for (const tab of runtimeRuleCatalog)
  for (const section of tab.sections)
    for (const field of section.fields) {
      if (
        ['routing.rule.outboundTag', 'routing.rule.balancerTag'].includes(
          field.key,
        )
      ) {
        field.control = 'text'
        delete field.options
      }
      if (field.key === 'routing.rule.inboundTag') field.control = 'tags'
    }
runtimeRuleCatalog[0].sections[0].fields.push({
  key: 'routing.rule.port',
  backendKey: 'port',
  label: '目标端口',
  control: 'text',
  placeholder: '80,443,1000-2000',
})
const disallowGlobal = (field: CatalogField) =>
  !field.key.startsWith('api.') &&
  !field.key.startsWith('outbounds.direct.') &&
  !field.key.startsWith('inbound.client.') &&
  !field.key.startsWith('outbound.settings.') &&
  !field.key.startsWith('advanced.') &&
  field.key !== 'xraySetting' &&
  field.key !== 'stats' &&
  !field.key.includes('statsUser') &&
  !field.key.includes('statsInbound') &&
  !field.key.includes('statsOutbound') &&
  !field.key.includes('hosts[]') &&
  field.key !== 'dns.servers[].addressIsEncrypted' &&
  field.key !== 'dns.servers[].expectIPs'
export const runtimeXrayCatalog: CatalogTab[] = clean(
  xrayCatalog,
  disallowGlobal,
).map((tab) => ({
  ...tab,
  title: tab.id === 'basics' ? '指标' : tab.title,
  description:
    tab.id === 'basics' ? '查看连接、流量和运行指标。' : tab.description,
  sections: tab.sections.map((section) => ({
    ...section,
    title:
      section.id === 'xray-balancer'
        ? '首个均衡器'
        : section.id === 'xray-dns-servers'
          ? '首个 DNS 服务器'
          : section.title,
    fields: section.fields.map((field) => ({
      ...field,
      backendKey: field.key.startsWith('routing.balancer.')
        ? field.key
            .replace(
              'routing.balancer.strategy',
              'routing.balancers.0.strategy.type',
            )
            .replace(
              'routing.balancer.settings.',
              'routing.balancers.0.strategy.settings.',
            )
            .replace('routing.balancer.', 'routing.balancers.0.')
        : field.key.replaceAll('[]', '.0'),
    })),
  })),
}))
const collections: CatalogField[] = [
  {
    key: 'routing.domainStrategy',
    label: '路由域名策略',
    control: 'select',
    options: [
      { value: 'AsIs', label: 'AsIs' },
      { value: 'IPIfNonMatch', label: 'IPIfNonMatch' },
      { value: 'IPOnDemand', label: 'IPOnDemand' },
    ],
  },
  {
    key: 'routing.balancers',
    label: '全部均衡器',
    control: 'code',
    language: 'json',
    placeholder: '[]',
  },
  {
    key: 'dns.hosts',
    label: 'DNS Hosts 映射',
    control: 'code',
    language: 'json',
    placeholder: '{}',
  },
  {
    key: 'dns.servers',
    label: '全部 DNS 服务器',
    control: 'code',
    language: 'json',
    placeholder: '[]',
  },
  {
    key: 'fakedns',
    label: '全部 FakeDNS 地址池',
    control: 'code',
    language: 'json',
    placeholder: '[]',
  },
]
runtimeXrayCatalog.push({
  id: 'native-collections',
  title: '集合与扩展',
  description: '配置多个 DNS 服务器、均衡器和地址池。',
  sections: [
    { id: 'native-collections', title: '完整集合', fields: collections },
  ],
})
for (const tab of runtimeXrayCatalog) {
  if (tab.id === 'basics') tab.description = '配置运行指标的访问接口。'
  for (const section of tab.sections)
    if (section.id === 'xray-stats')
      section.description = '通过 HTTP 接口读取流量统计和健康观测结果。'
}
for (const tabs of [runtimeInboundCatalog, runtimeIndependentInboundCatalog])
  for (const tab of tabs)
    if (tab.id === 'basic') tab.description = '设置入站监听的地址和端口。'

export type RuntimeProtocolCatalogOptions = {
  /** Remove the protocol selector after the caller has fixed the instance protocol. */
  lockProtocol?: boolean
}

const protocolAlias = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'dokodemo-door' ? 'tunnel' : normalized
}

function conditionValues(value: string | string[] | boolean | undefined) {
  return value === undefined
    ? []
    : Array.isArray(value)
      ? value.map(String)
      : [String(value)]
}

function protocolConditionAllows(
  condition: CatalogCondition,
  protocol: string,
) {
  if (condition.field !== 'protocol') return true
  const selected = protocolAlias(protocol)
  const equals = conditionValues(condition.equals).map(protocolAlias)
  const notEquals = conditionValues(condition.notEquals).map(protocolAlias)
  return (
    (!equals.length || equals.includes(selected)) &&
    !notEquals.includes(selected)
  )
}

function protocolConditionForWire(
  condition: CatalogCondition,
): CatalogCondition {
  if (condition.field !== 'protocol' || condition.equals === undefined)
    return condition
  const values = conditionValues(condition.equals)
  // Xray accepts the historical dokodemo-door spelling while the catalog
  // calls the same independent-inbound protocol tunnel. Keep both spellings
  // visible when the wire value uses the historical name.
  const expanded = Array.from(
    new Set(
      values.flatMap((value) =>
        protocolAlias(value) === 'tunnel'
          ? ['tunnel', 'dokodemo-door']
          : [value],
      ),
    ),
  )
  return { ...condition, equals: expanded }
}

function protocolConditions(field: CatalogField) {
  return !field.showWhen
    ? []
    : Array.isArray(field.showWhen)
      ? field.showWhen
      : [field.showWhen]
}

/**
 * Return an instance-scoped catalog containing only fields applicable to the
 * already-selected protocol.
 *
 * This is intentionally a clone: the exported catalogs are shared constants
 * and must not be mutated by one dialog. `lockProtocol` removes the selector
 * itself; the remaining values still carry `protocol` so xray-wire can keep
 * using the same serializer for format-check and save.
 */
export function catalogForProtocol(
  tabs: CatalogTab[],
  protocol: unknown,
  options: RuntimeProtocolCatalogOptions = {},
): CatalogTab[] {
  const selected = String(protocol ?? '').trim()
  if (!selected) return structuredClone(tabs)
  const selectedProtocol = protocolAlias(selected)

  return tabs
    .map((tab) => ({
      ...tab,
      title:
        selectedProtocol === 'hysteria' && tab.id === 'security'
          ? 'TLS'
          : tab.title,
      description:
        selectedProtocol === 'hysteria' &&
        ['security', 'outbound-security'].includes(tab.id)
          ? 'Hysteria 使用 TLS 安全层及证书、握手参数。'
          : tab.description,
      sections: tab.sections
        .map((section) => ({
          ...section,
          fields: section.fields
            .filter((field) =>
              protocolConditions(field).every((condition) =>
                protocolConditionAllows(condition, selected),
              ),
            )
            .filter(
              (field) => !(options.lockProtocol && field.key === 'protocol'),
            )
            .map((field) => {
              const next = { ...field }
              const conditions = protocolConditions(field)
              if (conditions.length) {
                next.showWhen = conditions.map(protocolConditionForWire)
              }
              if (selectedProtocol === 'hysteria') {
                if (field.key === 'streamSettings.network') {
                  next.control = 'select'
                  next.options = [{ value: 'hysteria', label: 'Hysteria / QUIC' }]
                  next.defaultValue = 'hysteria'
                  next.description = 'Hysteria 使用固定的 hysteria QUIC 传输。'
                }
                if (field.key === 'streamSettings.security') {
                  next.options = [{ value: 'tls', label: 'TLS' }]
                  next.defaultValue = 'tls'
                  next.description = 'Hysteria 传输使用 TLS。'
                }
              }
              return next
            }),
        }))
        .filter((section) => section.fields.length),
    }))
    .filter((tab) => tab.sections.length)
}

export const publicationCatalog: CatalogTab[] = [
  {
    id: 'publication',
    title: '发布端点',
    sections: [
      {
        id: 'publication',
        title: '订阅对外连接地址',
        fields: [
          { key: 'name', label: '发布名称', control: 'text', required: true },
          { key: 'host', label: '发布地址', control: 'text', required: true },
          { key: 'port', label: '发布端口', control: 'number', required: true },
          { key: 'show', label: '在订阅中显示', control: 'switch' },
        ],
      },
    ],
  },
]

const purposeText: Record<string, string> = {
  basic: '设置入站监听的地址和端口。',
  protocol: '设置协议的认证、加密和回落方式。',
  transport: '设置连接使用的传输方式及其参数。',
  security: '设置 TLS 证书、REALITY 和握手参数。',
  sniffing: '识别连接的目标域名和协议，用于路由匹配。',
  advanced: '设置套接字选项、连接伪装和高级协议参数。',
  'outbound-identity': '设置出站协议、标签和源地址。',
  'outbound-protocol': '设置连接目标和认证参数。',
  'outbound-stream': '设置连接使用的传输方式及其参数。',
  'outbound-security': '设置 TLS、REALITY 和证书校验方式。',
  'outbound-runtime': '设置套接字选项、连接复用和流量伪装。',
  rules: '按连接特征匹配规则，并选择出站或均衡器。',
  'policy-log': '设置连接超时、缓冲区和日志记录。',
  balancing: '分配出站流量并监测连接质量。',
  dns: '设置域名解析、Hosts 映射和 FakeDNS 地址池。',
  reverse: '通过反向连接访问另一端的服务。',
  'xray-policy': '按用户等级设置连接超时和缓冲区大小。',
  'xray-log': '设置日志级别、保存位置和地址脱敏方式。',
  'xray-balancer': '按指定策略从匹配的出站中选择连接出口。',
  'xray-observatory': '定期通过指定出站发起请求，检测延迟和可用性。',
  'xray-dns': '设置解析策略、缓存和回退方式。',
  'xray-dns-servers': '设置 DNS 服务器地址及适用的域名、IP 和查询策略。',
  'xray-fakedns': '为域名分配虚拟地址；使用时需要同时启用 fakedns 嗅探。',
  'xray-reverse': '设置内网端 Bridge 和入口端 Portal 的标签与通信域名。',
}
const fieldPurpose: Record<string, string> = {
  protocol: '选择连接使用的代理协议。',
  tag: '供路由规则和代理链引用，不能与其他标签重复。',
  'settings.decryption':
    '设置 VLESS 服务端解密参数；不启用协议加密时填写 none。',
  'settings.flow': '设置 VLESS 流控方式。',
  'settings.reverseTag': '设置接收反向连接的标签。',
  'settings.reverseSniffing.enabled': '识别反向连接的目标和协议。',
  'settings.fallbacks': '按域名、ALPN 或路径将未识别的连接转发到指定服务。',
  'settings.peers': '设置对端密钥、允许的 IP 和保活间隔。',
  'settings.clients': '配置允许连接此独立入站的账号。',
  settings: '编辑此协议的完整参数。',
  sniffing: '设置目标识别、目标替换和排除规则。',
  'sniffing.metadataOnly': '仅使用连接元数据进行识别，不读取连接内容。',
  'streamSettings.xhttpSettings.enableXmux': '启用 XHTTP 连接池复用。',
  'streamSettings.xhttpSettings.scMinPostsIntervalMs':
    '设置上传请求的最小发送间隔，单位毫秒。',
  'streamSettings.xhttpSettings.xmux.maxConnections':
    '限制连接池的连接数，与 maxConcurrency 二选一。',
  'streamSettings.realitySettings.target':
    '指定用于 REALITY 握手和回落的目标服务。',
  'streamSettings.sockopt.enabled': '自定义连接的底层套接字参数。',
  'streamSettings.sockopt.dialerProxy':
    '通过指定出站建立连接；填写该出站的 Tag。',
  'streamSettings.sockopt.trustedXForwardedFor':
    '读取可信前置代理传入的客户端地址。',
  'mux.enabled': '在一条连接中复用多个代理请求。',
  'routing.rule.outboundTag': '匹配后使用此出站；与均衡器标签二选一。',
  'routing.rule.balancerTag': '匹配后由此均衡器选择出站；与出站标签二选一。',
  'routing.rule.inboundTag': '仅匹配从这些标签进入的连接。',
  'routing.balancer.tag': '供路由规则引用的均衡器名称，不能重复。',
  'routing.balancer.selector': '按 Tag 前缀选择出站；可填写多个前缀。',
  'routing.balancer.fallbackTag': '没有可用成员时使用的出站 Tag。',
  'observatory.mode': '选择普通延迟探测或多次采样探测。',
  'observatory.subjectSelector': '按 Tag 前缀选择需要探测的出站。',
  'burstObservatory.subjectSelector': '按 Tag 前缀选择需要多次采样的出站。',
  'policy.levels': '设置各个用户等级的连接超时和缓冲区大小。',
  'log.error': '错误日志文件路径；填写 none 关闭错误日志。',
}
for (const tabs of [
  runtimeInboundCatalog,
  runtimeIndependentInboundCatalog,
  runtimeOutboundCatalog,
  runtimeRuleCatalog,
  runtimeXrayCatalog,
])
  for (const tab of tabs) {
    tab.description = purposeText[tab.id] ?? tab.description
    for (const section of tab.sections) {
      section.description = purposeText[section.id] ?? section.description
      for (const field of section.fields) {
        field.description = fieldPurpose[field.key] ?? field.description
        if (/finalmask/i.test(field.key)) {
          if (/xmc|mkcp-legacy|realm/.test(field.placeholder ?? ''))
            field.placeholder = '[]'
          if (/xmc|mkcp-legacy|realm/.test(field.description ?? ''))
            field.description = '设置流量伪装类型及其参数。'
        }
        if (field.key === 'routing.balancer.fallbackTag') {
          field.control = 'text'
          field.placeholder = '备用出站 Tag'
          delete field.options
        }
        if (field.key.endsWith('subjectSelector'))
          field.placeholder = 'outbound-tag, another-tag'
      }
    }
  }
