import type { CatalogTab } from "@/lib/control-plane/catalog-types"

const yesNo = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
]

export const certificateCatalog: CatalogTab[] = [
  {
    id: "certificate",
    title: "证书",
    description: "定义证书标识、域名集合与 ACME 证书颁发机构。",
    sections: [
      {
        id: "identity",
        title: "证书标识",
        fields: [
          { key: "certificate.name", label: "证书名称", control: "text", defaultValue: "新 ACME 证书", placeholder: "例如：香港边缘站点" },
          { key: "certificate.enabled", label: "启用证书任务", control: "switch", defaultValue: true, description: "停用后不会执行签发和自动续签。" },
          { key: "certificate.domains", label: "域名 / SAN", control: "tags", span: 2, placeholder: "edge.example.net, cdn.example.net", description: "使用逗号分隔；第一个域名作为证书 Common Name。" },
        ],
      },
      {
        id: "authority",
        title: "ACME 证书机构",
        fields: [
          {
            key: "acme.ca",
            label: "证书机构",
            control: "select",
            defaultValue: "letsencrypt",
            options: [
              { value: "letsencrypt", label: "Let's Encrypt" },
              { value: "zerossl", label: "ZeroSSL" },
              { value: "buypass", label: "Buypass" },
              { value: "google", label: "Google Trust Services" },
              { value: "custom", label: "自定义 ACME 服务" },
            ],
          },
          { key: "acme.directoryMode", label: "ACME 目录", control: "select", defaultValue: "production", options: [{ value: "production", label: "正式签发目录" }, { value: "staging", label: "CA 调试目录" }], description: "CA 调试目录用于验证挑战配置，不签发受信任证书。" },
          { key: "acme.directoryUrl", label: "Directory URL", control: "text", span: 2, placeholder: "https://acme.example/directory", showWhen: { field: "acme.ca", equals: "custom" } },
          { key: "acme.email", label: "ACME 账户邮箱", control: "text", placeholder: "admin@example.net" },
          { key: "acme.keyType", label: "证书密钥算法", control: "select", defaultValue: "ec256", options: [{ value: "ec256", label: "EC P-256" }, { value: "ec384", label: "EC P-384" }, { value: "rsa2048", label: "RSA 2048" }, { value: "rsa4096", label: "RSA 4096" }] },
          { key: "acme.preferredChain", label: "首选证书链", control: "text", placeholder: "可选，例如 ISRG Root X1" },
          { key: "acme.acceptTerms", label: "接受 CA 服务条款", control: "switch", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "challenge",
    title: "挑战",
    description: "配置域名所有权验证方式。通配符证书必须使用 DNS-01。",
    sections: [
      {
        id: "challenge-type",
        title: "挑战类型",
        fields: [
          { key: "challenge.type", label: "验证方式", control: "select", defaultValue: "dns-01", options: [{ value: "dns-01", label: "DNS-01" }, { value: "http-01", label: "HTTP-01" }, { value: "tls-alpn-01", label: "TLS-ALPN-01" }] },
          { key: "challenge.disablePropagationCheck", label: "跳过 DNS 传播检查", control: "switch", defaultValue: false, showWhen: { field: "challenge.type", equals: "dns-01" }, description: "仅在权威 DNS 无法被公共解析器查询时使用。" },
        ],
      },
      {
        id: "dns-challenge",
        title: "DNS-01",
        description: "凭据只应写入后端密钥存储；当前页面仅展示字段结构。",
        fields: [
          { key: "dns.provider", label: "DNS 提供商", control: "select", defaultValue: "cloudflare", showWhen: { field: "challenge.type", equals: "dns-01" }, options: [{ value: "cloudflare", label: "Cloudflare" }, { value: "alidns", label: "AliDNS" }, { value: "dnspod", label: "DNSPod" }, { value: "route53", label: "AWS Route 53" }, { value: "google", label: "Google Cloud DNS" }, { value: "hetzner", label: "Hetzner DNS" }, { value: "webhook", label: "自定义 Webhook" }] },
          { key: "dns.zone", label: "DNS Zone", control: "text", placeholder: "example.net", showWhen: { field: "challenge.type", equals: "dns-01" } },
          { key: "dns.apiToken", label: "API Token / Secret", control: "password", sensitive: true, placeholder: "由后端密钥库读取", showWhen: { field: "challenge.type", equals: "dns-01" } },
          { key: "dns.accountId", label: "账户 / Project ID", control: "text", showWhen: { field: "challenge.type", equals: "dns-01" } },
          { key: "dns.webhookUrl", label: "Webhook URL", control: "text", span: 2, placeholder: "https://dns-api.example.net/acme", showWhen: [{ field: "challenge.type", equals: "dns-01" }, { field: "dns.provider", equals: "webhook" }] },
          { key: "dns.propagationSeconds", label: "传播等待（秒）", control: "number", defaultValue: 60, showWhen: { field: "challenge.type", equals: "dns-01" } },
          { key: "dns.resolvers", label: "递归解析器", control: "tags", placeholder: "1.1.1.1:53, 8.8.8.8:53", showWhen: { field: "challenge.type", equals: "dns-01" } },
        ],
      },
      {
        id: "http-tls-challenge",
        title: "HTTP / TLS-ALPN",
        fields: [
          { key: "http.mode", label: "HTTP-01 模式", control: "select", defaultValue: "webroot", showWhen: { field: "challenge.type", equals: "http-01" }, options: [{ value: "webroot", label: "写入 Webroot" }, { value: "standalone", label: "独立监听" }, { value: "reverse-proxy", label: "反代回调" }] },
          { key: "http.webroot", label: "Webroot", control: "text", placeholder: "/var/www/acme", showWhen: [{ field: "challenge.type", equals: "http-01" }, { field: "http.mode", equals: "webroot" }] },
          { key: "http.listen", label: "监听地址", control: "text", defaultValue: "0.0.0.0", showWhen: { field: "challenge.type", equals: "http-01" } },
          { key: "http.port", label: "监听端口", control: "number", defaultValue: 80, showWhen: { field: "challenge.type", equals: "http-01" } },
          { key: "tlsAlpn.listen", label: "TLS-ALPN 监听地址", control: "text", defaultValue: "0.0.0.0", showWhen: { field: "challenge.type", equals: "tls-alpn-01" } },
          { key: "tlsAlpn.port", label: "TLS-ALPN 监听端口", control: "number", defaultValue: 443, showWhen: { field: "challenge.type", equals: "tls-alpn-01" } },
        ],
      },
    ],
  },
  {
    id: "renewal",
    title: "自动续签",
    description: "控制续签窗口、失败重试、证书切换和通知。",
    sections: [
      {
        id: "renewal-policy",
        title: "续签策略",
        fields: [
          { key: "renewal.enabled", label: "启用自动续签", control: "switch", defaultValue: true },
          { key: "renewal.daysBeforeExpiry", label: "提前续签（天）", control: "number", defaultValue: 30, showWhen: { field: "renewal.enabled", equals: true } },
          { key: "renewal.checkInterval", label: "检查间隔（小时）", control: "number", defaultValue: 12, showWhen: { field: "renewal.enabled", equals: true } },
          { key: "renewal.retryInterval", label: "失败重试（分钟）", control: "number", defaultValue: 30, showWhen: { field: "renewal.enabled", equals: true } },
          { key: "renewal.maxRetries", label: "最大重试次数", control: "number", defaultValue: 5, showWhen: { field: "renewal.enabled", equals: true } },
          { key: "renewal.jitterMinutes", label: "随机延迟（分钟）", control: "number", defaultValue: 20, showWhen: { field: "renewal.enabled", equals: true }, description: "避免多台服务器同时请求 CA。" },
        ],
      },
      {
        id: "deployment",
        title: "签发后处理",
        fields: [
          { key: "deployment.atomicReplace", label: "原子替换证书文件", control: "switch", defaultValue: true },
          { key: "deployment.keepPrevious", label: "保留上一版本", control: "switch", defaultValue: true },
          { key: "deployment.reloadXray", label: "续签后重载 Xray", control: "switch", defaultValue: true },
          { key: "deployment.reloadCommand", label: "自定义重载命令", control: "text", span: 2, placeholder: "由后端受限命令模板提供，不执行任意 Shell" },
          { key: "deployment.notify", label: "通知续签结果", control: "select", defaultValue: "failure", options: [{ value: "always", label: "成功与失败" }, { value: "failure", label: "仅失败" }, { value: "never", label: "不通知" }] },
          { key: "deployment.healthCheck", label: "切换后验证证书", control: "switch", defaultValue: true },
        ],
      },
    ],
  },
  {
    id: "advanced",
    title: "高级",
    description: "管理 EAB、证书存储和安全检查。",
    sections: [
      {
        id: "eab",
        title: "外部账户绑定（EAB）",
        fields: [
          { key: "eab.enabled", label: "启用 EAB", control: "select", defaultValue: "false", options: yesNo },
          { key: "eab.keyId", label: "Key ID", control: "text", showWhen: { field: "eab.enabled", equals: "true" } },
          { key: "eab.hmacKey", label: "HMAC Key", control: "password", sensitive: true, showWhen: { field: "eab.enabled", equals: "true" } },
        ],
      },
      {
        id: "storage",
        title: "存储与校验",
        fields: [
          { key: "storage.certificatePath", label: "证书链路径", control: "text", defaultValue: "/etc/xboard/certificates/{name}/fullchain.pem" },
          { key: "storage.privateKeyPath", label: "私钥路径", control: "text", defaultValue: "/etc/xboard/certificates/{name}/privkey.pem" },
          { key: "storage.accountPath", label: "ACME 账户路径", control: "text", defaultValue: "/etc/xboard/acme/accounts" },
          { key: "storage.fileMode", label: "私钥文件权限", control: "text", defaultValue: "0600" },
          { key: "validation.checkCAA", label: "签发前检查 CAA", control: "switch", defaultValue: true },
          { key: "validation.mustStaple", label: "TLS Must-Staple", control: "switch", defaultValue: false },
          { key: "validation.ocsp", label: "获取 OCSP 响应", control: "switch", defaultValue: true },
          { key: "validation.rawJson", label: "ACME 高级 JSON", control: "code", rows: 7, span: 2, defaultValue: "{}", description: "后端接入时必须经过 schema 与敏感字段校验。" },
        ],
      },
    ],
  },
]
