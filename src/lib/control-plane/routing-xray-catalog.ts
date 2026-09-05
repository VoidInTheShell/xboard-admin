import type { CatalogCondition, CatalogOption, CatalogTab } from "./catalog-types"

/**
 * Field metadata for the Xray part of the node control plane.
 *
 * This is an independently authored catalog. It records the wire names,
 * labels, controls, values, and dependency hints observed in the local
 * 3X-UI checkout; it does not import or reproduce 3X-UI React components,
 * schemas, adapters, or runtime code.
 *
 * Read-only source audit (local checkout):
 * - 3x-ui/frontend/src/pages/xray/routing/{RuleFormModal,RoutingBasic}.tsx
 * - 3x-ui/frontend/src/schemas/{routing,observatory,dns,xray}.ts
 * - 3x-ui/frontend/src/pages/xray/balancers/{BalancerFormModal,ObservatorySettingsTab}.tsx
 * - 3x-ui/frontend/src/pages/xray/dns/{DnsTab,DnsServerModal}.tsx
 * - 3x-ui/frontend/src/pages/xray/basics/{BasicsTab,constants}.ts
 * - 3x-ui/frontend/src/lib/xray/forms/SniffingFields.tsx
 * - 3x-ui/internal/web/service/config.json and xray_setting.go
 * - 3x-ui/internal/xray/config.go
 *
 * Several `showWhen.field` values are derived editor state rather than Xray
 * keys (for example `dns.enabled`, `observatory.mode`, and
 * `dns.server.addressIsEncrypted`). The renderer should calculate those
 * values without persisting them. The actual wire keys remain the `key` of
 * each persisted field.
 */

const option = (value: string, label: string): CatalogOption => ({ value, label })

export const routingDomainStrategyOptions: CatalogOption[] = [
  option("AsIs", "AsIs · 保持域名"),
  option("IPIfNonMatch", "IPIfNonMatch · 未命中时解析"),
  option("IPOnDemand", "IPOnDemand · 需要时解析"),
]

export const outboundDomainStrategyOptions: CatalogOption[] = [
  option("AsIs", "AsIs"),
  option("UseIP", "UseIP"),
  option("UseIPv4", "UseIPv4"),
  option("UseIPv6", "UseIPv6"),
  option("UseIPv6v4", "UseIPv6v4"),
  option("UseIPv4v6", "UseIPv4v6"),
  option("ForceIP", "ForceIP"),
  option("ForceIPv6v4", "ForceIPv6v4"),
  option("ForceIPv6", "ForceIPv6"),
  option("ForceIPv4v6", "ForceIPv4v6"),
  option("ForceIPv4", "ForceIPv4"),
]

export const ruleNetworkOptions: CatalogOption[] = [
  option("", "(任意)"),
  option("tcp", "TCP"),
  option("udp", "UDP"),
  option("tcp,udp", "TCP + UDP"),
]

export const ruleProtocolOptions: CatalogOption[] = [
  option("http", "HTTP"),
  option("tls", "TLS"),
  option("bittorrent", "BitTorrent"),
  option("quic", "QUIC"),
]

export const balancerStrategyOptions: CatalogOption[] = [
  option("random", "Random · 随机"),
  option("roundRobin", "Round robin · 轮询"),
  option("leastPing", "Least ping · 最低延迟"),
  option("leastLoad", "Least load · 最低负载"),
]

export const observatoryHttpMethodOptions: CatalogOption[] = [
  option("HEAD", "HEAD"),
  option("GET", "GET"),
]

export const dnsQueryStrategyOptions: CatalogOption[] = [
  option("UseIP", "UseIP · 按系统地址族"),
  option("UseIPv4", "UseIPv4 · 仅 IPv4"),
  option("UseIPv6", "UseIPv6 · 仅 IPv6"),
  option("UseSystem", "UseSystem · 系统解析策略"),
]

export const logLevelOptions: CatalogOption[] = [
  option("none", "none · 不记录"),
  option("debug", "debug"),
  option("info", "info"),
  option("warning", "warning"),
  option("error", "error"),
]

export const accessLogOptions: CatalogOption[] = [
  option("none", "none · 关闭"),
  option("./access.log", "./access.log"),
]

export const errorLogOptions: CatalogOption[] = [
  option("", "空 · 使用默认/不写入"),
  option("none", "none · 关闭"),
  option("./error.log", "./error.log"),
]

export const maskAddressOptions: CatalogOption[] = [
  option("", "空 · 不隐藏"),
  option("quarter", "quarter · 四分之一"),
  option("half", "half · 一半"),
  option("full", "full · 全部"),
]

export const apiServiceOptions: CatalogOption[] = [
  option("HandlerService", "HandlerService · 入站/用户管理"),
  option("LoggerService", "LoggerService · 日志"),
  option("StatsService", "StatsService · 流量统计"),
  option("RoutingService", "RoutingService · 路由热更新"),
]

export const sniffingDestinationOptions: CatalogOption[] = [
  option("http", "HTTP"),
  option("tls", "TLS"),
  option("quic", "QUIC"),
  option("fakedns", "Fake DNS"),
]

const apiRuleDescription =
  "内部 API 规则由面板维护，必须把 inboundTag=api 的流量送到 outboundTag=api，并保持在规则数组最前。"
const dnsEnabled: CatalogCondition = { field: "dns.enabled", equals: true }
const fakeDnsEnabled: CatalogCondition[] = [
  { field: "dns.enabled", equals: true },
  { field: "fakedns.enabled", equals: true },
]
const leastLoadBalancer: CatalogCondition = {
  field: "routing.balancer.strategy",
  equals: "leastLoad",
}
const regularObservatory: CatalogCondition = {
  field: "observatory.mode",
  equals: "observatory",
}
const burstObservatory: CatalogCondition = {
  field: "observatory.mode",
  equals: "burstObservatory",
}

/**
 * Routing rules and the small, derived routing shortcuts exposed by the
 * 3X-UI routing page. The shortcut keys are editor projections: they are
 * materialized as ordinary `routing.rules[]` entries and (for IPv4) an
 * `outbounds[]` entry when a real adapter is added later.
 */
const routingSourceCatalog: CatalogTab[] = [
  {
    id: "routing",
    title: "路由",
    description: "Xray 按 routing.rules 数组从上到下匹配；规则顺序本身就是优先级。",
    sections: [
      {
        id: "routing-basic",
        title: "基本路由",
        description:
          "这些快捷项对应 3X-UI 的 blocked、direct、IPv4 规则投影，不是 XBoard 的套餐、订阅或分享字段。",
        fields: [
          {
            key: "routing.domainStrategy",
            label: "整体域名解析策略",
            control: "select",
            options: routingDomainStrategyOptions,
            defaultValue: "AsIs",
            description:
              "routing.domainStrategy。决定路由匹配前是否解析目标域名；AsIs 保留域名，另外两种只在未命中或需要时解析。",
          },
          {
            key: "routing.defaultOutboundTag",
            label: "默认出站",
            control: "select",
            options: [
              option("direct", "direct · 直接连接"),
              option("blocked", "blocked · 丢弃"),
            ],
            placeholder: "选择已配置的出站标签",
            defaultValue: "direct",
            description:
              "这是编辑器投影；Xray 没有单独的 defaultOutbound 字段，未命中规则时使用 outbounds 数组的第一个出站。动态出站标签应由服务器上下文追加。",
          },
          {
            key: "routing.basic.torrentBlock",
            label: "阻止 BitTorrent",
            control: "switch",
            defaultValue: true,
            description:
              "对应 outboundTag=blocked、protocol=[bittorrent] 的 field 规则；关闭时移除这条快捷规则。",
          },
          {
            key: "routing.basic.blockedIPs",
            label: "阻止 IP",
            control: "tags",
            placeholder: "geoip:private, 10.0.0.0/8",
            description:
              "写入匹配 blocked 出站的 routing.rules[].ip；支持 CIDR、geoip:* 与 ext:geoip_*:* token。",
          },
          {
            key: "routing.basic.blockedDomains",
            label: "阻止域名",
            control: "tags",
            placeholder: "geosite:category-ads-all, domain:example.com",
            description:
              "写入匹配 blocked 出站的 routing.rules[].domain；支持 geosite、domain、regexp 与 ext:geosite token。",
          },
          {
            key: "routing.basic.directIPs",
            label: "直接 IP",
            control: "tags",
            placeholder: "geoip:cn, 192.0.2.0/24",
            description:
              "写入匹配 direct 出站的 routing.rules[].ip，并确保 direct freedom 出站存在。",
          },
          {
            key: "routing.basic.directDomains",
            label: "直接域名",
            control: "tags",
            placeholder: "geosite:cn, domain:example.com",
            description:
              "写入匹配 direct 出站的 routing.rules[].domain，并确保 direct freedom 出站存在。",
          },
          {
            key: "routing.basic.ipv4Domains",
            label: "IPv4 路由域名",
            control: "tags",
            placeholder: "geosite:google, geosite:openai",
            description:
              "写入匹配 IPv4 出站的 routing.rules[].domain；该快捷出站使用 freedom.settings.domainStrategy=UseIPv4。",
          },
        ],
      },
      {
        id: "routing-rule",
        title: "Field 规则",
        description:
          "完整覆盖本地 RuleObjectSchema 与 RuleFormModal 的匹配/目标字段。数组字段由逗号或标签输入，空字段不发到 wire。",
        fields: [
          {
            key: "routing.rule.type",
            label: "规则类型",
            control: "select",
            options: [option("field", "field")],
            defaultValue: "field",
            description:
              "当前 3X-UI 表单只创建 type=field；其他未知类型可通过高级原始 JSON 保留，但不应被此表单误改。",
          },
          {
            key: "routing.rule.enabled",
            label: "启用规则",
            control: "switch",
            defaultValue: true,
            description:
              `${apiRuleDescription}普通规则在生成运行时配置时会删除 enabled=false 的条目，并移除 panel-only 的 enabled 键。`,
          },
          {
            key: "routing.rule.sourceIP",
            label: "源 IP",
            control: "tags",
            placeholder: "0.0.0.0/8, fc00::/7, geoip:private",
            description: "routing.rules[].sourceIP；按来源地址/CIDR/geoip token 匹配。",
          },
          {
            key: "routing.rule.localIP",
            label: "本地 IP",
            control: "tags",
            placeholder: "192.0.2.10, 2001:db8::/32",
            description:
              "RuleObjectSchema 支持的 routing.rules[].localIP；用于匹配本地连接地址，当前简化表单之外仍需保留。",
          },
          {
            key: "routing.rule.sourcePort",
            label: "源端口",
            control: "text",
            placeholder: "53, 443, 1000-2000",
            description: "routing.rules[].sourcePort；支持单端口、逗号列表与端口范围。",
          },
          {
            key: "routing.rule.localPort",
            label: "本地端口",
            control: "text",
            placeholder: "80, 443, 1000-2000",
            description:
              "RuleObjectSchema 支持的 routing.rules[].localPort；与 sourcePort 分别表示来源端和本地端。",
          },
          {
            key: "routing.rule.vlessRoute",
            label: "VLESS 路由端口",
            control: "text",
            placeholder: "53, 443, 1000-2000",
            description: "routing.rules[].vlessRoute；保留 Xray/VLESS 专用的端口匹配字段。",
          },
          {
            key: "routing.rule.network",
            label: "网络",
            control: "select",
            options: ruleNetworkOptions,
            placeholder: "(任意)",
            description: "routing.rules[].network；本地表单值为 (空)、tcp、udp 或 tcp,udp。",
          },
          {
            key: "routing.rule.protocol",
            label: "嗅探协议",
            control: "multiselect",
            options: ruleProtocolOptions,
            placeholder: "选择 HTTP/TLS/QUIC/BitTorrent",
            description: "routing.rules[].protocol；可多选 http、tls、bittorrent、quic。",
          },
          {
            key: "routing.rule.ip",
            label: "目标 IP",
            control: "tags",
            placeholder: "geoip:private, 10.0.0.0/8",
            description: "routing.rules[].ip；GeoIP、CIDR 与扩展 geoip token 均按原值保留。",
          },
          {
            key: "routing.rule.domain",
            label: "目标域名",
            control: "tags",
            placeholder: "google.com, geosite:cn, regexp:^api\\.",
            description: "routing.rules[].domain；支持普通域名、domain:、geosite:、regexp: 与 ext: token。",
          },
          {
            key: "routing.rule.user",
            label: "用户",
            control: "tags",
            placeholder: "用户邮箱或客户端标识",
            description:
              "routing.rules[].user；原 3X-UI 从客户端列表提供建议，同时允许输入现有列表之外的 tag。",
          },
          {
            key: "routing.rule.process",
            label: "进程名",
            control: "tags",
            placeholder: "curl, chrome",
            description:
              "RuleObjectSchema 支持的 routing.rules[].process；当前规则表单没有单独控件，必须在结构化编辑器或高级 JSON 中保留。",
          },
          {
            key: "routing.rule.inboundTag",
            label: "入站标签",
            control: "multiselect",
            placeholder: "选择已配置的入站标签",
            description:
              "routing.rules[].inboundTag；选项来自本机入站、反向代理生成的 inbound tag、DNS tag 等运行时标签。",
          },
          {
            key: "routing.rule.attrs",
            label: "属性匹配",
            control: "code",
            rows: 4,
            placeholder: '{\n  "key": "value"\n}',
            description:
              "routing.rules[].attrs 是 string→string 的对象；属性键和值都参与匹配，不要当作 XBoard 标签。",
          },
          {
            key: "routing.rule.outboundTag",
            label: "目标出站标签",
            control: "select",
            options: [
              option("", "(不设置)"),
              option("direct", "direct"),
              option("blocked", "blocked"),
              option("api", "api · 内部"),
            ],
            placeholder: "选择出站标签",
            description:
              "routing.rules[].outboundTag；动态选项来自当前服务器的出站库。与 balancerTag 是两个互斥的目标语义，至少应设置一个。",
          },
          {
            key: "routing.rule.balancerTag",
            label: "目标均衡器标签",
            control: "select",
            placeholder: "选择已配置的均衡器",
            description:
              "routing.rules[].balancerTag；动态选项来自 routing.balancers。选择后由 Xray 根据均衡器策略决定实际出站。",
          },
          {
            key: "routing.rule.ruleTag",
            label: "规则标签",
            control: "text",
            placeholder: "可选的规则标识",
            description:
              "RuleObjectSchema 支持的 routing.rules[].ruleTag；不是排序序号，也不是 XBoard 业务节点名称。",
          },
          {
            key: "routing.rule.webhook.url",
            label: "Webhook URL",
            control: "text",
            placeholder: "https://ops.example.net/xray-route",
            description:
              "routing.rules[].webhook.url；设置后由 Xray 在规则事件上回调，留空则不输出 webhook。",
          },
          {
            key: "routing.rule.webhook.deduplication",
            label: "Webhook 去重时间",
            control: "number",
            placeholder: "秒",
            description: "routing.rules[].webhook.deduplication；非负整数，单位由 Xray webhook 语义决定。",
          },
          {
            key: "routing.rule.webhook.headers",
            label: "Webhook Headers",
            control: "code",
            rows: 4,
            placeholder: '{\n  "Authorization": "Bearer …"\n}',
            description: "routing.rules[].webhook.headers；仅保存 string→string 的请求头对象，敏感值应由安全存储接管。",
            sensitive: true,
          },
        ],
      },
    ],
  },
]

const routingSections = routingSourceCatalog[0].sections

export const routingCatalog: CatalogTab[] = [
  {
    id: "basics",
    title: "基本路由",
    description: "维护域名策略、默认出站与常用直连/阻断规则。",
    sections: routingSections.filter((section) => section.id === "routing-basic"),
  },
  {
    id: "rules",
    title: "Field 规则",
    description: "维护完整匹配条件、出站目标、均衡器与 Webhook。",
    sections: routingSections.filter((section) => section.id === "routing-rule"),
  },
]

/**
 * Xray configuration resources other than the routing rule editor. It keeps
 * repeatable resources in dotted `[]` paths so a renderer can build a list
 * editor without confusing them with XBoard's subscription/business data.
 */
const xraySourceCatalog: CatalogTab[] = [
  {
    id: "xray",
    title: "Xray 配置",
    description:
      "控制 Xray 的 DNS、均衡器、观测器、策略、日志、API、统计、反向配置和原始模板；分享策略、订阅排序、流量重置、到期字段不在此目录。",
    sections: [
      {
        id: "xray-general",
        title: "通用与直连",
        description: "对应 3X-UI 的 Xray → Basics；这些选项作用于 Xray 运行配置。",
        fields: [
          {
            key: "outbounds.direct.settings.domainStrategy",
            label: "Freedom 域名策略",
            control: "select",
            options: outboundDomainStrategyOptions,
            defaultValue: "AsIs",
            description:
              "direct freedom 出站的 settings.domainStrategy；与 routing.domainStrategy 是两层不同配置，不要混写。",
          },
          {
            key: "outbounds.direct.streamSettings.sockopt.happyEyeballs.enabled",
            label: "启用 Happy Eyeballs",
            control: "switch",
            defaultValue: false,
            description:
              "创建 direct freedom 的 streamSettings.sockopt.happyEyeballs 对象；关闭时移除整个可选对象。",
          },
          {
            key: "outbounds.direct.streamSettings.sockopt.happyEyeballs.tryDelayMs",
            label: "备用地址族等待",
            control: "number",
            placeholder: "250",
            defaultValue: 250,
            showWhen: { field: "outbounds.direct.streamSettings.sockopt.happyEyeballs.enabled", equals: true },
            description: "Happy Eyeballs 的 tryDelayMs，单位毫秒，必须为非负整数。",
          },
          {
            key: "outbounds.direct.streamSettings.sockopt.happyEyeballs.prioritizeIPv6",
            label: "优先 IPv6",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "outbounds.direct.streamSettings.sockopt.happyEyeballs.enabled", equals: true },
            description: "Happy Eyeballs 的 prioritizeIPv6；只改变地址族尝试优先级。",
          },
          {
            key: "outbounds.direct.streamSettings.sockopt.happyEyeballs.interleave",
            label: "地址交错数量",
            control: "number",
            placeholder: "1",
            defaultValue: 1,
            showWhen: { field: "outbounds.direct.streamSettings.sockopt.happyEyeballs.enabled", equals: true },
            description: "完整 HappyEyeballs schema 的 interleave，最小值为 1。",
          },
          {
            key: "outbounds.direct.streamSettings.sockopt.happyEyeballs.maxConcurrentTry",
            label: "最大并发尝试",
            control: "number",
            placeholder: "4",
            defaultValue: 4,
            showWhen: { field: "outbounds.direct.streamSettings.sockopt.happyEyeballs.enabled", equals: true },
            description: "完整 HappyEyeballs schema 的 maxConcurrentTry；0 表示不额外限制。",
          },
        ],
      },
      {
        id: "xray-api",
        title: "API 控制面",
        description:
          "api、内部 API tunnel 入站和 api→api 路由共同组成 3X-UI 控制面；修改前须确认不会切断面板与 Xray 的 gRPC 通道。",
        fields: [
          {
            key: "api.enabled",
            label: "启用 Xray API",
            control: "switch",
            defaultValue: true,
            description:
              "编辑器投影：api 对象存在时启用。删除 api 对象不会被后端偷偷恢复，但会使面板的 Handler/Stats/Routing RPC 不可用。",
          },
          {
            key: "api.tag",
            label: "API 标签",
            control: "text",
            placeholder: "api",
            defaultValue: "api",
            description:
              "api.tag；必须与内部 API inbound 的 tag 及 routing.rules 中的 api 规则保持一致。",
          },
          {
            key: "api.services",
            label: "API 服务",
            control: "multiselect",
            options: apiServiceOptions,
            placeholder: "选择 Xray gRPC 服务",
            description:
              "api.services。面板运行时至少要求 HandlerService、StatsService、RoutingService；LoggerService 用于 Xray 日志服务。",
          },
          {
            key: "api.inbound.listen",
            label: "API 入站监听地址",
            control: "text",
            placeholder: "127.0.0.1",
            defaultValue: "127.0.0.1",
            description: "默认内部 API tunnel 入站只监听回环地址，不应暴露到公网。",
          },
          {
            key: "api.inbound.port",
            label: "API 入站端口",
            control: "number",
            placeholder: "62789",
            defaultValue: 62789,
            description: "内部 API tunnel 入站端口；必须与面板初始化 Xray API 的端口一致。",
          },
          {
            key: "api.inbound.protocol",
            label: "API 入站协议",
            control: "select",
            options: [option("tunnel", "tunnel")],
            defaultValue: "tunnel",
            description: "3X-UI 默认 API 入站使用 tunnel 协议。",
          },
          {
            key: "api.inbound.settings.rewriteAddress",
            label: "API 重写地址",
            control: "text",
            placeholder: "127.0.0.1",
            defaultValue: "127.0.0.1",
            description: "内部 tunnel settings.rewriteAddress；默认把控制请求重写到回环地址。",
          },
          {
            key: "api.inbound.tag",
            label: "API 入站标签",
            control: "text",
            placeholder: "api",
            defaultValue: "api",
            description: `${apiRuleDescription} 修改此标签时必须同步 api.tag、routing.rule.inboundTag 和 outboundTag。`,
          },
        ],
      },
      {
        id: "xray-stats",
        title: "统计与指标",
        description:
          "系统统计开关位于 policy.system；stats 是 Xray 顶层统计对象，metrics 是 Prometheus 风格指标入口。",
        fields: [
          {
            key: "stats",
            label: "Stats 配置",
            control: "code",
            rows: 5,
            placeholder: "{}",
            defaultValue: "{}",
            description:
              "Xray 顶层 stats 对象。3X-UI 默认使用 {}，不要把运行时统计结果或 XBoard 账单数据写回这里。",
          },
          {
            key: "metrics.enabled",
            label: "启用 Xray 指标",
            control: "switch",
            defaultValue: true,
            description:
              "编辑器投影：metrics 对象存在时启用。指标端点没有身份验证，建议仅绑定回环地址并由已认证的反向代理转发。",
          },
          {
            key: "metrics.listen",
            label: "指标监听地址",
            control: "text",
            placeholder: "127.0.0.1:11111",
            defaultValue: "127.0.0.1:11111",
            showWhen: { field: "metrics.enabled", equals: true },
            description: "metrics.listen；address:port 形式，默认示例为 127.0.0.1:11111。",
          },
          {
            key: "metrics.tag",
            label: "指标出站标签",
            control: "text",
            placeholder: "metrics_out",
            defaultValue: "metrics_out",
            showWhen: { field: "metrics.enabled", equals: true },
            description:
              "metrics.tag；Xray 通过此 tag 关联指标出站。配置 metrics 时 3X-UI 同时确保 stats 对象存在。",
          },
        ],
      },
      {
        id: "xray-policy",
        title: "Policy",
        description:
          "按 Xray policy.system 与 policy.levels 的 wire 结构编辑；默认面板连接策略使用 level 0。",
        fields: [
          {
            key: "policy.system.statsInboundUplink",
            label: "统计入站上行",
            control: "switch",
            defaultValue: true,
            description: "policy.system.statsInboundUplink；开启后记录各入站的上行字节。",
          },
          {
            key: "policy.system.statsInboundDownlink",
            label: "统计入站下行",
            control: "switch",
            defaultValue: true,
            description: "policy.system.statsInboundDownlink；开启后记录各入站的下行字节。",
          },
          {
            key: "policy.system.statsOutboundUplink",
            label: "统计出站上行",
            control: "switch",
            defaultValue: false,
            description: "policy.system.statsOutboundUplink；开启后记录各出站的上行字节。",
          },
          {
            key: "policy.system.statsOutboundDownlink",
            label: "统计出站下行",
            control: "switch",
            defaultValue: false,
            description: "policy.system.statsOutboundDownlink；开启后记录各出站的下行字节。",
          },
          {
            key: "policy.levels.0.statsUserUplink",
            label: "统计用户上行",
            control: "switch",
            defaultValue: true,
            description: "policy.levels[\"0\"].statsUserUplink；默认客户端等级使用 level 0。",
          },
          {
            key: "policy.levels.0.statsUserDownlink",
            label: "统计用户下行",
            control: "switch",
            defaultValue: true,
            description: "policy.levels[\"0\"].statsUserDownlink；默认客户端等级使用 level 0。",
          },
          {
            key: "policy.levels.0.statsUserOnline",
            label: "统计用户在线状态",
            control: "switch",
            defaultValue: true,
            description:
              "policy.levels[\"0\"].statsUserOnline。当前 3X-UI 运行时会强制打开它，以支持在线 IP 和 IP 限制；保存模板时不要误删。",
          },
          {
            key: "policy.levels.0.handshake",
            label: "握手超时",
            control: "number",
            placeholder: "4",
            description: "policy.levels[\"0\"].handshake；留空使用 Xray 默认值，单位秒。",
          },
          {
            key: "policy.levels.0.connIdle",
            label: "连接空闲超时",
            control: "number",
            placeholder: "300",
            description: "policy.levels[\"0\"].connIdle；连接空闲达到秒数后关闭，留空使用核心默认值。",
          },
          {
            key: "policy.levels.0.uplinkOnly",
            label: "仅上行保持时间",
            control: "number",
            placeholder: "1",
            description: "policy.levels[\"0\"].uplinkOnly；连接关闭阶段只保留上行的时长，单位秒。",
          },
          {
            key: "policy.levels.0.downlinkOnly",
            label: "仅下行保持时间",
            control: "number",
            placeholder: "1",
            description: "policy.levels[\"0\"].downlinkOnly；连接关闭阶段只保留下行的时长，单位秒。",
          },
          {
            key: "policy.levels.0.bufferSize",
            label: "连接缓冲区",
            control: "number",
            placeholder: "自动",
            description: "policy.levels[\"0\"].bufferSize，单位 KB；留空跟随 Xray，设为 0 可减少低内存机器的占用。",
          },
          {
            key: "policy.levels",
            label: "其他 Policy 等级",
            control: "code",
            rows: 8,
            placeholder: '{\n  "8": { "handshake": 4, "connIdle": 300 }\n}',
            description:
              "保留 level 0 之外的 policy.levels 对象。每个等级可含 handshake、connIdle、uplinkOnly、downlinkOnly、bufferSize 与 statsUser* 字段。",
          },
        ],
      },
      {
        id: "xray-log",
        title: "日志",
        description: "日志字段对应 Xray 顶层 log 对象；访问日志和 DNS 日志会增加运行开销。",
        fields: [
          {
            key: "log.loglevel",
            label: "日志级别",
            control: "select",
            options: logLevelOptions,
            defaultValue: "warning",
            description: "log.loglevel；可选 none、debug、info、warning、error。",
          },
          {
            key: "log.access",
            label: "访问日志",
            control: "select",
            options: accessLogOptions,
            defaultValue: "none",
            description:
              "log.access；特殊值 none 关闭访问日志。自定义路径需由后端安全限定；3X-UI 运行时会把文件名收敛到日志目录。",
          },
          {
            key: "log.error",
            label: "错误日志",
            control: "select",
            options: errorLogOptions,
            defaultValue: "",
            description: "log.error；空值、none 或相对路径分别按核心/面板约定处理。",
          },
          {
            key: "log.maskAddress",
            label: "隐藏日志地址",
            control: "select",
            options: maskAddressOptions,
            defaultValue: "",
            description: "log.maskAddress；可选 quarter、half、full，用于减少日志中的地址暴露。",
          },
          {
            key: "log.dnsLog",
            label: "DNS 查询日志",
            control: "switch",
            defaultValue: false,
            description: "log.dnsLog；开启后记录 DNS 查询，排障后建议关闭。",
          },
        ],
      },
      {
        id: "xray-balancer",
        title: "负载均衡器",
        description:
          "对应 routing.balancers[]。selector 至少一个；fallback 可以引用出站或另一个均衡器，引用均衡器会生成内部 loopback。",
        fields: [
          {
            key: "routing.balancer.tag",
            label: "均衡器标签",
            control: "text",
            placeholder: "streaming-balance",
            description: "routing.balancers[].tag；必填且不可使用保留的 _bl_ 前缀。",
          },
          {
            key: "routing.balancer.strategy",
            label: "均衡策略",
            control: "select",
            options: balancerStrategyOptions,
            defaultValue: "random",
            description: "routing.balancers[].strategy.type；默认 random。",
          },
          {
            key: "routing.balancer.selector",
            label: "成员选择器",
            control: "tags",
            placeholder: "outbound-tag-1, outbound-tag-2",
            description:
              "routing.balancers[].selector；至少一个出站 tag。选项来自当前服务器出站以及运行时注入的反向/订阅 tag，但订阅排序本身不属于此字段。",
          },
          {
            key: "routing.balancer.fallbackTag",
            label: "备用目标",
            control: "select",
            options: [option("", "(不设置)"), option("direct", "direct"), option("blocked", "blocked")],
            placeholder: "出站或另一个均衡器标签",
            description:
              "routing.balancers[].fallbackTag；可选出站或另一个均衡器。引用均衡器会生成 _bl_<tag> loopback，并必须拒绝循环依赖。",
          },
          {
            key: "routing.balancer.settings.expected",
            label: "期望节点数",
            control: "number",
            placeholder: "最佳节点数",
            showWhen: leastLoadBalancer,
            description: "leastLoad strategy.settings.expected；非负整数。",
          },
          {
            key: "routing.balancer.settings.maxRTT",
            label: "最大 RTT",
            control: "text",
            placeholder: "1s",
            showWhen: leastLoadBalancer,
            description: "leastLoad strategy.settings.maxRTT；持续时间字符串，例如 1s。",
          },
          {
            key: "routing.balancer.settings.tolerance",
            label: "负载容差",
            control: "number",
            placeholder: "0.01 = 1%",
            showWhen: leastLoadBalancer,
            description: "leastLoad strategy.settings.tolerance；范围 0 到 1，0.01 表示 1%。",
          },
          {
            key: "routing.balancer.settings.baselines",
            label: "负载基准",
            control: "tags",
            placeholder: "1s, 2s",
            showWhen: leastLoadBalancer,
            description: "leastLoad strategy.settings.baselines；持续时间字符串数组。",
          },
          {
            key: "routing.balancer.settings.costs",
            label: "成本规则",
            control: "code",
            rows: 8,
            placeholder: '[{ "regexp": false, "match": "tag", "value": 1 }]',
            showWhen: leastLoadBalancer,
            description:
              "leastLoad strategy.settings.costs 数组；每项包含 regexp(boolean)、match(string) 与 value(number)，按出站标签计算成本。",
          },
        ],
      },
      {
        id: "xray-observatory",
        title: "Observatory",
        description:
          "观测器由均衡策略自动决定。leastPing 使用普通 Observatory；leastLoad，或带 fallback 的 random/roundRobin，使用 burstObservatory。两种对象同时存在时保存应规范化为一种。",
        fields: [
          {
            key: "observatory.mode",
            label: "观测器模式",
            control: "select",
            options: [
              option("none", "无观测器"),
              option("observatory", "Observatory"),
              option("burstObservatory", "Burst Observatory"),
            ],
            defaultValue: "none",
            description:
              "编辑器投影，不直接写入 Xray。根据 routing.balancers 的 strategy/fallback 自动推导；没有 leastPing 或需要 burst 的策略时不要强行创建。",
          },
          {
            key: "observatory.subjectSelector",
            label: "普通被观测出站",
            control: "tags",
            placeholder: "由均衡器选择器生成",
            showWhen: regularObservatory,
            description:
              "observatory.subjectSelector；由 leastPing 均衡器的 selector 自动汇总，不应脱离均衡器单独维护。",
          },
          {
            key: "observatory.probeURL",
            label: "普通探测 URL",
            control: "text",
            placeholder: "https://www.google.com/generate_204",
            defaultValue: "https://www.google.com/generate_204",
            showWhen: regularObservatory,
            description: "observatory.probeURL；建议使用返回 HTTP 204 的稳定地址。",
          },
          {
            key: "observatory.probeInterval",
            label: "普通探测间隔",
            control: "text",
            placeholder: "1m",
            defaultValue: "1m",
            showWhen: regularObservatory,
            description: "observatory.probeInterval；持续时间字符串，例如 30s、1m、2h45m。",
          },
          {
            key: "observatory.enableConcurrency",
            label: "并发普通探测",
            control: "switch",
            defaultValue: true,
            showWhen: regularObservatory,
            description: "observatory.enableConcurrency；一次并发探测所有 subject，速度更快但网络特征更明显。",
          },
          {
            key: "burstObservatory.subjectSelector",
            label: "Burst 被观测出站",
            control: "tags",
            placeholder: "由均衡器选择器生成",
            showWhen: burstObservatory,
            description:
              "burstObservatory.subjectSelector；由需要 burst 的均衡器以及 leastPing 选择器自动汇总。",
          },
          {
            key: "burstObservatory.pingConfig.destination",
            label: "Burst 探测目标",
            control: "text",
            placeholder: "https://www.google.com/generate_204",
            defaultValue: "https://www.google.com/generate_204",
            showWhen: burstObservatory,
            description: "burstObservatory.pingConfig.destination；每个成员出站都会请求此 URL。",
          },
          {
            key: "burstObservatory.pingConfig.connectivity",
            label: "连通性检查 URL",
            control: "text",
            placeholder: "http://connectivitycheck.example/generate_204",
            showWhen: burstObservatory,
            description: "可选的 burstObservatory.pingConfig.connectivity；留空则跳过额外连通性检查。",
          },
          {
            key: "burstObservatory.pingConfig.interval",
            label: "Burst 探测间隔",
            control: "text",
            placeholder: "1m",
            defaultValue: "1m",
            showWhen: burstObservatory,
            description: "burstObservatory.pingConfig.interval；持续时间字符串，核心对最小间隔有约束。",
          },
          {
            key: "burstObservatory.pingConfig.timeout",
            label: "Burst 探测超时",
            control: "text",
            placeholder: "5s",
            defaultValue: "5s",
            showWhen: burstObservatory,
            description: "burstObservatory.pingConfig.timeout；单次探测失败判定的等待时长。",
          },
          {
            key: "burstObservatory.pingConfig.sampling",
            label: "Burst 采样数",
            control: "number",
            placeholder: "2",
            defaultValue: 2,
            showWhen: burstObservatory,
            description: "burstObservatory.pingConfig.sampling；至少 1 次，用于稳定均衡评分。",
          },
          {
            key: "burstObservatory.pingConfig.httpMethod",
            label: "Burst HTTP 方法",
            control: "select",
            options: observatoryHttpMethodOptions,
            defaultValue: "HEAD",
            showWhen: burstObservatory,
            description: "burstObservatory.pingConfig.httpMethod；可选 HEAD 或 GET。",
          },
        ],
      },
      {
        id: "xray-dns",
        title: "DNS",
        description:
          "dns 对象存在时才启用自定义 DNS。明文 UDP/TCP、本地模式 DoH/DoQ、fallback 与 EDNS client IP 都可能造成 DNS 泄漏。",
        fields: [
          {
            key: "dns.enabled",
            label: "启用自定义 DNS",
            control: "switch",
            defaultValue: false,
            description:
              "编辑器投影：创建/删除顶层 dns 对象。3X-UI 切换 DNS 时会清除 fakedns 旧状态，关闭时同时删除 dns 与 fakedns。",
          },
          {
            key: "dns.tag",
            label: "DNS 标签",
            control: "text",
            placeholder: "dns_inbound",
            defaultValue: "dns_inbound",
            showWhen: dnsEnabled,
            description: "dns.tag；可作为 routing.rules[].inboundTag 的动态选项。",
          },
          {
            key: "dns.clientIp",
            label: "DNS 客户端 IP",
            control: "text",
            placeholder: "可选的 EDNS client IP",
            showWhen: dnsEnabled,
            description: "dns.clientIp；非空可能把客户端地址传给上游解析器，请按隐私策略配置。",
          },
          {
            key: "dns.queryStrategy",
            label: "全局查询策略",
            control: "select",
            options: dnsQueryStrategyOptions,
            defaultValue: "UseIP",
            showWhen: dnsEnabled,
            description: "dns.queryStrategy；控制 DNS 查询时的地址族选择。",
          },
          {
            key: "dns.disableCache",
            label: "禁用缓存",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.disableCache；禁用 DNS 缓存会增加上游请求。",
          },
          {
            key: "dns.disableFallback",
            label: "禁用回退",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.disableFallback；禁用服务器列表之外的回退解析。",
          },
          {
            key: "dns.disableFallbackIfMatch",
            label: "匹配时禁用回退",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.disableFallbackIfMatch；命中服务器 domains 时不再向后续服务器回退。",
          },
          {
            key: "dns.enableParallelQuery",
            label: "并行查询",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.enableParallelQuery；并行请求多个 DNS 服务器。",
          },
          {
            key: "dns.useSystemHosts",
            label: "使用系统 Hosts",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.useSystemHosts；是否把系统 hosts 文件纳入解析。",
          },
          {
            key: "dns.serveStale",
            label: "允许过期缓存",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.serveStale；允许在上游暂时不可用时返回过期缓存。",
          },
          {
            key: "dns.serveExpiredTTL",
            label: "过期记录 TTL",
            control: "number",
            placeholder: "0",
            defaultValue: 0,
            showWhen: dnsEnabled,
            description: "dns.serveExpiredTTL；非负秒数，0 表示不额外延长过期记录。",
          },
        ],
      },
      {
        id: "xray-dns-hosts",
        title: "DNS Hosts 映射",
        description:
          "dns.hosts 是域名到一个或多个 IP/域名值的映射；空行不会写入 wire。它不是 XBoard 发布主机实体。",
        fields: [
          {
            key: "dns.hosts[].domain",
            label: "Hosts 域名",
            control: "text",
            placeholder: "domain:example.com",
            showWhen: dnsEnabled,
            description: "dns.hosts 的 map key；3X-UI 允许 domain:example.com 等 Xray token。",
          },
          {
            key: "dns.hosts[].values",
            label: "Hosts 值",
            control: "tags",
            placeholder: "203.0.113.10 或备用值",
            showWhen: dnsEnabled,
            description:
              "dns.hosts 的 value，可为单个字符串或字符串数组；输入多个值时保持数组语义。",
          },
        ],
      },
      {
        id: "xray-dns-servers",
        title: "DNS Servers",
        description:
          "dns.servers[] 可以是普通地址字符串，也可以是带策略、域名匹配和 IP 过滤的对象。对象字段按 DnsServerObjectSchema 展开。",
        fields: [
          {
            key: "dns.servers[].address",
            label: "服务器地址",
            control: "text",
            placeholder: "8.8.8.8 或 https://dns.google/dns-query",
            showWhen: dnsEnabled,
            description:
              "dns.servers[].address；支持 IP/主机名以及 https、https+local、h2c、h2c+local、quic+local 等地址形式。",
          },
          {
            key: "dns.servers[].addressIsEncrypted",
            label: "加密地址（自动识别）",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description:
              "编辑器派生状态，不写入 wire；由 address scheme 判断是否隐藏/省略 port。",
          },
          {
            key: "dns.servers[].port",
            label: "服务器端口",
            control: "number",
            placeholder: "53",
            defaultValue: 53,
            showWhen: [dnsEnabled, { field: "dns.servers[].addressIsEncrypted", equals: false }],
            description: "普通 DNS server 对象的 port，范围 1–65535；加密 DNS 地址不输出该字段。",
          },
          {
            key: "dns.servers[].tag",
            label: "服务器标签",
            control: "text",
            placeholder: "可选 dns-upstream",
            showWhen: dnsEnabled,
            description: "dns.servers[].tag；可作为 routing.rules[].inboundTag 的动态选项。",
          },
          {
            key: "dns.servers[].clientIP",
            label: "服务器级客户端 IP",
            control: "text",
            placeholder: "可选 EDNS client IP",
            showWhen: dnsEnabled,
            description: "dns.servers[].clientIP；覆盖该服务器的客户端地址提示，注意隐私泄漏。",
          },
          {
            key: "dns.servers[].queryStrategy",
            label: "服务器查询策略",
            control: "select",
            options: dnsQueryStrategyOptions,
            defaultValue: "UseIP",
            showWhen: dnsEnabled,
            description: "dns.servers[].queryStrategy；覆盖全局 DNS queryStrategy。",
          },
          {
            key: "dns.servers[].timeoutMs",
            label: "服务器超时",
            control: "number",
            placeholder: "4000",
            defaultValue: 4000,
            showWhen: dnsEnabled,
            description: "dns.servers[].timeoutMs；非负毫秒数，3X-UI 表单以 500ms 为步长。",
          },
          {
            key: "dns.servers[].domains",
            label: "匹配域名",
            control: "tags",
            placeholder: "geosite:cn, domain:example.com",
            showWhen: dnsEnabled,
            description: "dns.servers[].domains；仅把匹配这些域名的查询交给该服务器。",
          },
          {
            key: "dns.servers[].expectedIPs",
            label: "期望 IP",
            control: "tags",
            placeholder: "203.0.113.0/24, 2001:db8::/32",
            showWhen: dnsEnabled,
            description:
              "dns.servers[].expectedIPs；3X-UI 兼容读取旧字段 expectIPs，但写出统一使用 expectedIPs。",
          },
          {
            key: "dns.servers[].unexpectedIPs",
            label: "禁止 IP",
            control: "tags",
            placeholder: "192.0.2.1",
            showWhen: dnsEnabled,
            description: "dns.servers[].unexpectedIPs；命中这些地址的应答视为不符合预期。",
          },
          {
            key: "dns.servers[].skipFallback",
            label: "跳过回退",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.servers[].skipFallback；该服务器失败/不匹配时不向后续服务器回退。",
          },
          {
            key: "dns.servers[].disableCache",
            label: "服务器禁用缓存",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.servers[].disableCache；只对当前上游关闭缓存。",
          },
          {
            key: "dns.servers[].finalQuery",
            label: "最终查询",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.servers[].finalQuery；将该服务器标记为最终查询路径。",
          },
          {
            key: "dns.servers[].serveStale",
            label: "服务器允许过期缓存",
            control: "switch",
            defaultValue: false,
            showWhen: dnsEnabled,
            description: "dns.servers[].serveStale；允许当前上游返回过期缓存。",
          },
          {
            key: "dns.servers[].serveExpiredTTL",
            label: "服务器过期 TTL",
            control: "number",
            placeholder: "0",
            defaultValue: 0,
            showWhen: dnsEnabled,
            description: "dns.servers[].serveExpiredTTL；非负秒数。",
          },
          {
            key: "dns.servers[].expectIPs",
            label: "旧版 expectIPs（兼容读取）",
            control: "tags",
            placeholder: "旧配置中的 expectIPs",
            showWhen: dnsEnabled,
            description:
              "仅用于读取旧 3X-UI/Xray 配置的兼容别名；保存时应规范化到 dns.servers[].expectedIPs，不要同时输出两个键。",
          },
        ],
      },
      {
        id: "xray-fakedns",
        title: "Fake DNS",
        description:
          "Fake DNS 是顶层 fakedns 数组，与 DNS 配置一起使用；它不是 XBoard 节点域名。Sniffing 的 destOverride 需要显式包含 fakedns 才会消费该池。",
        fields: [
          {
            key: "fakedns.enabled",
            label: "启用 Fake DNS",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "dns.enabled", equals: true },
            description:
              "编辑器投影：fakedns 为非空数组时启用；3X-UI 添加首项默认 198.18.0.0/15、65535。",
          },
          {
            key: "fakedns[].ipPool",
            label: "IP 池子网",
            control: "text",
            placeholder: "198.18.0.0/15",
            defaultValue: "198.18.0.0/15",
            showWhen: fakeDnsEnabled,
            description: "fakedns[].ipPool；Fake DNS 分配地址的 CIDR 池。",
          },
          {
            key: "fakedns[].poolSize",
            label: "池大小",
            control: "number",
            placeholder: "65535",
            defaultValue: 65535,
            showWhen: fakeDnsEnabled,
            description: "fakedns[].poolSize；正整数，不能小于 1。",
          },
        ],
      },
      {
        id: "xray-reverse",
        title: "Reverse 与 Sniffing",
        description:
          "覆盖 Xray reverse 顶层原始对象，以及 VLESS inbound client / outbound settings 中的 reverse 与 sniffing 字段。",
        fields: [
          {
            key: "reverse.bridges",
            label: "Reverse Bridges",
            control: "code",
            rows: 8,
            placeholder: '[{ "tag": "bridge", "domain": "reverse.example.com" }]',
            description:
              "顶层 reverse.bridges 数组；Xray 反向代理的桥接端配置，当前 3X-UI 没有专用表单，保持原始对象。",
          },
          {
            key: "reverse.portals",
            label: "Reverse Portals",
            control: "code",
            rows: 8,
            placeholder: '[{ "tag": "portal", "domain": "reverse.example.com" }]',
            description:
              "顶层 reverse.portals 数组；Xray 反向代理的入口端配置，当前 3X-UI 没有专用表单，保持原始对象。",
          },
          {
            key: "inbound.client.reverse.enabled",
            label: "入站客户端 Reverse",
            control: "switch",
            defaultValue: false,
            description:
              "编辑器投影：inbound client reverse 对象存在且有 tag 时启用；wire 结构为 clients[].reverse。",
          },
          {
            key: "inbound.client.reverse.tag",
            label: "入站 Reverse 标签",
            control: "text",
            placeholder: "reverse-inbound",
            showWhen: { field: "inbound.client.reverse.enabled", equals: true },
            description: "inbounds[].settings.clients[].reverse.tag；供反向流量识别的标签。",
          },
          {
            key: "inbound.client.reverse.sniffing.enabled",
            label: "入站 Reverse 嗅探",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "inbound.client.reverse.enabled", equals: true },
            description: "inbounds[].settings.clients[].reverse.sniffing.enabled。",
          },
          {
            key: "inbound.client.reverse.sniffing.destOverride",
            label: "入站嗅探目标覆盖",
            control: "multiselect",
            options: sniffingDestinationOptions,
            showWhen: { field: "inbound.client.reverse.sniffing.enabled", equals: true },
            description: "reverse.sniffing.destOverride；可选 http、tls、quic、fakedns。",
          },
          {
            key: "inbound.client.reverse.sniffing.metadataOnly",
            label: "入站仅读取元数据",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "inbound.client.reverse.sniffing.enabled", equals: true },
            description: "reverse.sniffing.metadataOnly；不读取完整 payload。",
          },
          {
            key: "inbound.client.reverse.sniffing.routeOnly",
            label: "入站仅用于路由",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "inbound.client.reverse.sniffing.enabled", equals: true },
            description: "reverse.sniffing.routeOnly；嗅探结果仅参与路由，不改变目标。",
          },
          {
            key: "inbound.client.reverse.sniffing.ipsExcluded",
            label: "入站排除 IP",
            control: "tags",
            placeholder: "geoip:private, 192.0.2.0/24",
            showWhen: { field: "inbound.client.reverse.sniffing.enabled", equals: true },
            description: "reverse.sniffing.ipsExcluded；排除 IP/CIDR/geoip token。",
          },
          {
            key: "inbound.client.reverse.sniffing.domainsExcluded",
            label: "入站排除域名",
            control: "tags",
            placeholder: "domain:example.com, ext:*",
            showWhen: { field: "inbound.client.reverse.sniffing.enabled", equals: true },
            description: "reverse.sniffing.domainsExcluded；排除 domain/ext token。",
          },
          {
            key: "outbound.settings.reverse.enabled",
            label: "VLESS 出站 Reverse",
            control: "switch",
            defaultValue: false,
            description:
              "编辑器投影：VLESS outbound settings.reverse 对象存在且有 tag 时启用；其他协议不应显示这些字段。",
          },
          {
            key: "outbound.settings.reverse.tag",
            label: "出站 Reverse 标签",
            control: "text",
            placeholder: "reverse-outbound",
            showWhen: { field: "outbound.settings.reverse.enabled", equals: true },
            description: "outbounds[].settings.reverse.tag；VLESS 反向嗅探标签。",
          },
          {
            key: "outbound.settings.reverse.sniffing.enabled",
            label: "出站 Reverse 嗅探",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "outbound.settings.reverse.enabled", equals: true },
            description: "outbounds[].settings.reverse.sniffing.enabled。",
          },
          {
            key: "outbound.settings.reverse.sniffing.destOverride",
            label: "出站嗅探目标覆盖",
            control: "multiselect",
            options: sniffingDestinationOptions,
            showWhen: { field: "outbound.settings.reverse.sniffing.enabled", equals: true },
            description: "VLESS reverse.sniffing.destOverride；可选 http、tls、quic、fakedns。",
          },
          {
            key: "outbound.settings.reverse.sniffing.metadataOnly",
            label: "出站仅读取元数据",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "outbound.settings.reverse.sniffing.enabled", equals: true },
            description: "VLESS reverse.sniffing.metadataOnly。",
          },
          {
            key: "outbound.settings.reverse.sniffing.routeOnly",
            label: "出站仅用于路由",
            control: "switch",
            defaultValue: false,
            showWhen: { field: "outbound.settings.reverse.sniffing.enabled", equals: true },
            description: "VLESS reverse.sniffing.routeOnly。",
          },
          {
            key: "outbound.settings.reverse.sniffing.ipsExcluded",
            label: "出站排除 IP",
            control: "tags",
            placeholder: "geoip:private, 192.0.2.0/24",
            showWhen: { field: "outbound.settings.reverse.sniffing.enabled", equals: true },
            description: "VLESS reverse.sniffing.ipsExcluded。",
          },
          {
            key: "outbound.settings.reverse.sniffing.domainsExcluded",
            label: "出站排除域名",
            control: "tags",
            placeholder: "domain:example.com, ext:*",
            showWhen: { field: "outbound.settings.reverse.sniffing.enabled", equals: true },
            description: "VLESS reverse.sniffing.domainsExcluded。",
          },
        ],
      },
      {
        id: "xray-advanced",
        title: "高级原始配置",
        description:
          "3X-UI 的 Advanced 页允许编辑完整模板、入站、出站与路由规则 JSON。结构化字段无法覆盖的 Xray 扩展应在这里保留并由后端做 schema/能力校验。",
        fields: [
          {
            key: "xraySetting",
            label: "完整 Xray 模板",
            control: "code",
            rows: 18,
            placeholder: '{\n  "log": {},\n  "inbounds": [],\n  "outbounds": [],\n  "routing": {}\n}',
            description:
              "对应 API payload 的 xraySetting；允许完整顶层配置，包括 api、inbounds、outbounds、routing、dns、log、policy、stats、reverse、fakedns、observatory、burstObservatory、metrics、transport、geodata、env。",
          },
          {
            key: "advanced.inbounds",
            label: "高级入站 JSON",
            control: "code",
            rows: 12,
            placeholder: "[]",
            description: "对应 3X-UI Advanced → Inbounds；数组内容直接映射到顶层 inbounds。",
          },
          {
            key: "advanced.outbounds",
            label: "高级出站 JSON",
            control: "code",
            rows: 12,
            placeholder: "[]",
            description: "对应 3X-UI Advanced → Outbounds；数组内容直接映射到顶层 outbounds。",
          },
          {
            key: "advanced.routingRules",
            label: "高级路由规则 JSON",
            control: "code",
            rows: 12,
            placeholder: "[]",
            description:
              "对应 3X-UI Advanced → Routing Rules；数组内容直接映射到 routing.rules，保存前应固定 api→api 规则的首位。",
          },
          {
            key: "advanced.transport",
            label: "高级 Transport JSON",
            control: "code",
            rows: 8,
            placeholder: "{}",
            description: "Xray 顶层 transport 对象；当前本地 3X-UI 仅通过完整模板保留。",
          },
          {
            key: "advanced.geodata",
            label: "高级 Geodata JSON",
            control: "code",
            rows: 8,
            placeholder: "{}",
            description: "Xray 顶层 geodata 对象；用于 geo 文件加载/行为扩展，按核心版本校验。",
          },
          {
            key: "advanced.env",
            label: "高级 Env JSON",
            control: "code",
            rows: 8,
            placeholder: "{}",
            description: "Xray 顶层 env 对象；不要把宿主机 secret 或 XBoard 环境变量直接写入模板。",
          },
        ],
      },
    ],
  },
]

const xraySections = xraySourceCatalog[0].sections
const selectXraySections = (...ids: string[]) => xraySections.filter((section) => ids.includes(section.id))

export const xrayCatalog: CatalogTab[] = [
  {
    id: "basics",
    title: "基础与 API",
    description: "维护通用直连、内部 API、Stats 和指标入口。",
    sections: selectXraySections("xray-general", "xray-api", "xray-stats"),
  },
  {
    id: "policy-log",
    title: "策略与日志",
    description: "维护 Xray Policy、统计开关和运行日志。",
    sections: selectXraySections("xray-policy", "xray-log"),
  },
  {
    id: "balancing",
    title: "负载均衡",
    description: "维护 Balancer、Observatory 和 Burst Observatory。",
    sections: selectXraySections("xray-balancer", "xray-observatory"),
  },
  {
    id: "dns",
    title: "DNS",
    description: "维护 DNS、Hosts、DNS Servers 和 FakeDNS。",
    sections: selectXraySections("xray-dns", "xray-dns-hosts", "xray-dns-servers", "xray-fakedns"),
  },
  {
    id: "reverse",
    title: "Reverse",
    description: "维护 Xray 反向配置与关联嗅探字段。",
    sections: selectXraySections("xray-reverse"),
  },
  {
    id: "advanced",
    title: "高级",
    description: "保留完整模板和结构化表单暂未覆盖的 Xray 顶层对象。",
    sections: selectXraySections("xray-advanced"),
  },
]

/** Convenience aggregate for callers that render one combined Xray surface. */
export const routingXrayCatalog: CatalogTab[] = [...routingCatalog, ...xrayCatalog]
