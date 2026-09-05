export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info"

export type ServerRecord = {
  id: string
  name: string
  role: string
  region: string
  kernel: string
  deploymentMethod: "Docker" | "二进制" | null
  status: "在线" | "维护" | "离线"
  lastSeen: string
  cpu: number
  memory: number
  inbounds: number
  nodes: number
  hosts: number
}

export const servers: ServerRecord[] = [
  { id: "us2", name: "US2", role: "香港节点", region: "香港", kernel: "Xray 25.8", deploymentMethod: "Docker", status: "在线", lastSeen: "12 秒前", cpu: 18, memory: 42, inbounds: 2, nodes: 2, hosts: 3 },
  { id: "xfge", name: "XFGE", role: "欧洲节点", region: "法兰克福", kernel: "Xray 25.8", deploymentMethod: "Docker", status: "在线", lastSeen: "28 秒前", cpu: 31, memory: 56, inbounds: 3, nodes: 3, hosts: 4 },
  { id: "dmit", name: "DMIT", role: "美西节点", region: "洛杉矶", kernel: "Xray 25.8", deploymentMethod: "二进制", status: "在线", lastSeen: "41 秒前", cpu: 47, memory: 61, inbounds: 2, nodes: 2, hosts: 3 },
  { id: "jpgreen", name: "JPGREEN", role: "面板与控制面", region: "东京", kernel: "Panel", deploymentMethod: null, status: "维护", lastSeen: "3 分钟前", cpu: 22, memory: 68, inbounds: 0, nodes: 0, hosts: 1 },
]

export type InboundRecord = {
  id: string
  serverId: string
  name: string
  protocol: string
  listen: string
  transport: string
  security: string
  clients: number
  enabled: boolean
}

export const inbounds: InboundRecord[] = [
  { id: "in-us2-ws", serverId: "us2", name: "主站 WebSocket", protocol: "VLESS", listen: "0.0.0.0:30080", transport: "WebSocket", security: "TLS", clients: 128, enabled: true },
  { id: "in-us2-reality", serverId: "us2", name: "直连 Reality", protocol: "VLESS", listen: "0.0.0.0:443", transport: "TCP", security: "Reality", clients: 74, enabled: true },
  { id: "in-xfge-reality", serverId: "xfge", name: "欧洲 Reality", protocol: "VLESS", listen: "0.0.0.0:443", transport: "TCP", security: "Reality", clients: 96, enabled: true },
  { id: "in-xfge-grpc", serverId: "xfge", name: "欧洲 gRPC", protocol: "VLESS", listen: "0.0.0.0:8443", transport: "gRPC", security: "TLS", clients: 62, enabled: true },
  { id: "in-xfge-trojan", serverId: "xfge", name: "兼容 Trojan", protocol: "Trojan", listen: "0.0.0.0:10443", transport: "TCP", security: "TLS", clients: 0, enabled: false },
  { id: "in-dmit-anytls", serverId: "dmit", name: "美西 AnyTLS", protocol: "AnyTLS", listen: "0.0.0.0:443", transport: "TCP", security: "TLS", clients: 81, enabled: true },
  { id: "in-dmit-reality", serverId: "dmit", name: "美西 Reality", protocol: "VLESS", listen: "0.0.0.0:8443", transport: "TCP", security: "Reality", clients: 53, enabled: true },
]

export type HostRecord = {
  id: string
  name: string
  address: string
  port: number
  tls: boolean
  sni: string
  path: string
  priority: number
  enabled: boolean
}

export const hosts: HostRecord[] = [
  { id: "host-01", name: "主站接入", address: "edge-hk.example.net", port: 443, tls: true, sni: "edge-hk.example.net", path: "/gateway", priority: 10, enabled: true },
  { id: "host-02", name: "备用接入", address: "cdn-hk.example.net", port: 443, tls: true, sni: "cdn-hk.example.net", path: "/gateway", priority: 20, enabled: true },
  { id: "host-03", name: "IPv4 直连", address: "203.0.113.20", port: 443, tls: true, sni: "edge-hk.example.net", path: "/gateway", priority: 30, enabled: false },
]

export type CertificateRecord = {
  id: string
  name: string
  domains: string[]
  issuer: string
  challenge: "DNS-01" | "HTTP-01" | "TLS-ALPN-01"
  status: "有效" | "续签中" | "失败" | "待签发"
  expiresAt: string
  lastRenewal: string
  autoRenew: boolean
}

export const certificates: CertificateRecord[] = [
  { id: "cert-edge-hk", name: "香港边缘站点", domains: ["edge-hk.example.net", "cdn-hk.example.net"], issuer: "Let's Encrypt", challenge: "DNS-01", status: "有效", expiresAt: "2026-11-26", lastRenewal: "2026-08-28", autoRenew: true },
  { id: "cert-api", name: "节点 API", domains: ["api.example.net"], issuer: "ZeroSSL", challenge: "HTTP-01", status: "续签中", expiresAt: "2026-09-19", lastRenewal: "2026-06-21", autoRenew: true },
  { id: "cert-wildcard", name: "业务通配符", domains: ["*.service.example.net", "service.example.net"], issuer: "Google Trust Services", challenge: "DNS-01", status: "有效", expiresAt: "2026-10-31", lastRenewal: "2026-08-02", autoRenew: true },
]

export type OutboundRecord = {
  id: string
  name: string
  tag: string
  protocol: string
  source: string
  sourceServer?: string
  target: string
  latency: number | null
  enabled: boolean
}

export const outbounds: OutboundRecord[] = [
  { id: "out-direct", name: "直接连接", tag: "direct", protocol: "freedom", source: "系统内置", target: "本地网络", latency: 0, enabled: true },
  { id: "out-us2-self", name: "US2 本机出口", tag: "us2-self", protocol: "VLESS", source: "引用现有节点", sourceServer: "US2", target: "US2 / 香港 · CDN", latency: 12, enabled: true },
  { id: "out-dmit", name: "DMIT 中继", tag: "dmit-relay", protocol: "VLESS", source: "引用现有节点", sourceServer: "DMIT", target: "DMIT / 美西节点", latency: 168, enabled: true },
  { id: "out-warp", name: "WARP 出口", tag: "warp-egress", protocol: "WireGuard", source: "手动添加", target: "Cloudflare WARP", latency: 42, enabled: true },
  { id: "out-residential", name: "住宅出口", tag: "residential", protocol: "SOCKS", source: "手动添加", target: "proxy.example.net:1080", latency: null, enabled: false },
]

export type NodeRecord = {
  id: string
  name: string
  inboundId: string
  rate: number
  trafficLimit: string
  tags: string[]
  groups: string[]
  visibility: string
  status: "启用" | "停用"
}

export const nodes: NodeRecord[] = [
  { id: "node-01", name: "香港 · CDN", inboundId: "in-us2-ws", rate: 1, trafficLimit: "不限", tags: ["推荐", "低延迟"], groups: ["标准组", "高级组"], visibility: "订阅内可见", status: "启用" },
  { id: "node-02", name: "德国 · Reality", inboundId: "in-xfge-reality", rate: 1.2, trafficLimit: "8 TB / 月", tags: ["欧洲", "Reality"], groups: ["高级组"], visibility: "订阅内可见", status: "启用" },
  { id: "node-03", name: "美国 · AnyTLS", inboundId: "in-dmit-anytls", rate: 1.5, trafficLimit: "5 TB / 月", tags: ["流媒体"], groups: ["高级组", "媒体组"], visibility: "订阅内可见", status: "启用" },
  { id: "node-04", name: "香港 · 备用", inboundId: "in-us2-reality", rate: 0.8, trafficLimit: "2 TB / 月", tags: ["备用"], groups: ["标准组"], visibility: "仅管理员", status: "停用" },
]

export type PermissionGroupRecord = {
  id: string
  name: string
  users: number
  plans: string[]
  nodes: number
  description: string
  enabled: boolean
}

export const permissionGroups: PermissionGroupRecord[] = [
  { id: "group-standard", name: "标准组", users: 238, plans: ["基础套餐", "标准套餐"], nodes: 2, description: "常规用户与测试用户的默认节点权限。", enabled: true },
  { id: "group-premium", name: "高级组", users: 86, plans: ["高级套餐"], nodes: 4, description: "开放中继、Reality 与媒体优化节点。", enabled: true },
  { id: "group-media", name: "媒体组", users: 31, plans: ["媒体增值包"], nodes: 1, description: "仅开放具备流媒体出口的节点。", enabled: true },
  { id: "group-internal", name: "内部测试", users: 4, plans: [], nodes: 4, description: "运维验收与协议兼容测试。", enabled: false },
]

export const routingRules = [
  { id: "rule-01", name: "局域网与保留地址", priority: 10, match: "geoip:private", action: "direct", enabled: true },
  { id: "rule-02", name: "广告与追踪域名", priority: 20, match: "geosite:category-ads-all", action: "block", enabled: true },
  { id: "rule-03", name: "流媒体出口", priority: 30, match: "geosite:netflix,disney", action: "dmit-relay", enabled: true },
  { id: "rule-04", name: "默认出口", priority: 999, match: "network:tcp,udp", action: "direct", enabled: true },
]

export const recentActivity = [
  { at: "20:48", actor: "beihai3body@uegov.org", action: "更新服务器节点装配", target: "US2 / 香港 · CDN" },
  { at: "20:32", actor: "system", action: "节点重新拉取配置", target: "XFGE" },
  { at: "19:56", actor: "beihai3body@uegov.org", action: "修改出站候选", target: "DMIT 中继" },
  { at: "18:41", actor: "system", action: "完成订阅生成", target: "标准组 · 238 用户" },
]
