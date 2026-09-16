export type PolicyCategory = "business" | "access" | "usage" | "runtime";
export type CleanupMode = "days" | "size" | "either";
export type LogPolicy = {
  id: string;
  title: string;
  description: string;
  category: PolicyCategory;
  location: string;
  enabled: boolean;
  days: number;
  maxMiB: number;
  mode: CleanupMode;
  daily: number;
  bytes: number;
};

// Planning assumptions for the UI draft, never reported as measured disk usage.
export const defaultLogPolicies: LogPolicy[] = [
  {
    id: "audit",
    title: "管理员与 MCP 审计",
    description: "记录执行者、动作、结果与来源。",
    category: "business",
    location: "面板数据库",
    enabled: true,
    days: 90,
    maxMiB: 512,
    mode: "either",
    daily: 2000,
    bytes: 1024,
  },
  {
    id: "mail",
    title: "邮件发送日志",
    description: "保存收件人、模板、发送结果和脱敏错误，不保存邮件凭据。",
    category: "business",
    location: "面板数据库",
    enabled: true,
    days: 30,
    maxMiB: 256,
    mode: "either",
    daily: 3000,
    bytes: 768,
  },
  {
    id: "reset",
    title: "流量重置日志",
    description: "记录重置用户、触发源、清除量和原因。",
    category: "business",
    location: "面板数据库",
    enabled: true,
    days: 90,
    maxMiB: 128,
    mode: "either",
    daily: 500,
    bytes: 512,
  },
  {
    id: "events",
    title: "配置变更事件",
    description: "管理端同步所需的变更记录。同步所需版本由系统保留。",
    category: "business",
    location: "面板数据库",
    enabled: true,
    days: 90,
    maxMiB: 128,
    mode: "either",
    daily: 500,
    bytes: 512,
  },
  {
    id: "web",
    title: "Web 登录与访问",
    description: "记录每次面板访问与登录行为。",
    category: "access",
    location: "面板数据库",
    enabled: true,
    days: 90,
    maxMiB: 512,
    mode: "either",
    daily: 10000,
    bytes: 512,
  },
  {
    id: "subscription",
    title: "订阅拉取",
    description: "记录每次订阅请求、客户端与结果。",
    category: "access",
    location: "面板数据库",
    enabled: true,
    days: 90,
    maxMiB: 512,
    mode: "either",
    daily: 5000,
    bytes: 512,
  },
  {
    id: "source",
    title: "首次连接与历史来源",
    description:
      "保存用户 / IP 的首次发现与最后活动，按最后活动时间计算保留期。",
    category: "access",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 512,
    mode: "either",
    daily: 300,
    bytes: 384,
  },
  {
    id: "review",
    title: "安全核查记录",
    description: "保存安全观察的核查状态，清理已过期且无关联来源的记录。",
    category: "access",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 64,
    mode: "either",
    daily: 20,
    bytes: 256,
  },
  {
    id: "traffic",
    title: "用户与节点流量明细",
    description: "保留历史流量采样，清理明细不应删除账户累计用量。",
    category: "usage",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 1024,
    mode: "either",
    daily: 20000,
    bytes: 128,
  },
  {
    id: "ip",
    title: "用户 / IP / 节点流量",
    description: "用于两端 IP 统计，按来源保存流量明细。",
    category: "usage",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 1024,
    mode: "either",
    daily: 30000,
    bytes: 160,
  },
  {
    id: "nic",
    title: "服务器网卡与实例流量",
    description: "保存服务器网卡和代理实例的历史流量。",
    category: "usage",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 512,
    mode: "either",
    daily: 5000,
    bytes: 128,
  },
  {
    id: "online",
    title: "在线来源与历史趋势",
    description: "过期在线快照单独失效，历史趋势按以下策略保留。",
    category: "usage",
    location: "面板数据库",
    enabled: true,
    days: 400,
    maxMiB: 512,
    mode: "either",
    daily: 10000,
    bytes: 128,
  },
  {
    id: "legacy",
    title: "原有用户 / 服务器流量统计",
    description: "旧统计表的采集与保留；启停前需确认旧报表依赖。",
    category: "usage",
    location: "面板数据库",
    enabled: false,
    days: 60,
    maxMiB: 256,
    mode: "either",
    daily: 5000,
    bytes: 128,
  },
  {
    id: "app",
    title: "面板应用日志",
    description: "应用异常、业务错误与运行信息。",
    category: "runtime",
    location: "面板文件",
    enabled: true,
    days: 14,
    maxMiB: 512,
    mode: "either",
    daily: 20000,
    bytes: 512,
  },
  {
    id: "backup",
    title: "备份日志",
    description: "备份上传与执行结果，不包含备份文件本身。",
    category: "runtime",
    location: "面板文件",
    enabled: true,
    days: 30,
    maxMiB: 64,
    mode: "either",
    daily: 100,
    bytes: 512,
  },
  {
    id: "deprecation",
    title: "弃用警告",
    description: "框架与组件的弃用提示。",
    category: "runtime",
    location: "面板文件",
    enabled: true,
    days: 14,
    maxMiB: 64,
    mode: "either",
    daily: 1000,
    bytes: 512,
  },
  {
    id: "queue",
    title: "失败队列任务",
    description: "保留失败任务摘要与错误，便于排查和重试。",
    category: "runtime",
    location: "面板数据库",
    enabled: true,
    days: 7,
    maxMiB: 128,
    mode: "either",
    daily: 100,
    bytes: 2048,
  },
  {
    id: "load",
    title: "服务器负载历史",
    description: "CPU、内存、磁盘与网速的短期历史。",
    category: "runtime",
    location: "面板数据库",
    enabled: true,
    days: 1,
    maxMiB: 128,
    mode: "either",
    daily: 30000,
    bytes: 128,
  },
];

export function estimatePolicy(policy: LogPolicy, horizon = 30) {
  if (!policy.enabled) return 0;
  const raw =
    policy.daily *
    policy.bytes *
    (policy.mode === "size" ? horizon : policy.days) *
    1.5;
  return policy.mode === "days"
    ? raw
    : Math.min(raw, policy.maxMiB * 1024 ** 2);
}

export function formatLogBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}
