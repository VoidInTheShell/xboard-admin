import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowUpCircle,
  BellRing,
  BookOpenText,
  CircleDollarSign,
  FileCode2,
  FileClock,
  Gauge,
  Gift,
  Globe2,
  Layers3,
  KeyRound,
  Mail,
  MonitorSmartphone,
  PackageOpen,
  PanelsTopLeft,
  PlugZap,
  ReceiptText,
  Route,
  Server,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Tags,
  TicketCheck,
  Users,
  Trophy,
} from "lucide-react"

export type AdminNavItem = {
  title: string
  path: string
  icon: LucideIcon
  keywords?: string[]
}

export type AdminNavGroup = {
  label: string
  icon: LucideIcon
  items: AdminNavItem[]
}

export const adminNavigation: AdminNavGroup[] = [
  {
    label: "总览",
    icon: Gauge,
    items: [
      { title: "仪表盘", path: "/dashboard", icon: Gauge, keywords: ["状态", "概览"] },
      { title: "使用记录", path: "/usage", icon: Activity, keywords: ["流量", "在线", "设备", "登录", "订阅记录"] },
      { title: "排行榜", path: "/leaderboard", icon: Trophy, keywords: ["排名", "用户流量", "节点流量", "历史设备"] },
    ],
  },
  {
    label: "基础设施",
    icon: Layers3,
    items: [
      { title: "服务器管理", path: "/servers", icon: Server, keywords: ["机器", "主机"] },
      { title: "出站管理", path: "/outbounds", icon: Route, keywords: ["出口", "代理链"] },
      { title: "节点管理", path: "/nodes", icon: Globe2, keywords: ["倍率", "流量"] },
      { title: "权限组管理", path: "/permission-groups", icon: ShieldCheck, keywords: ["分组", "可见性"] },
      { title: "订阅管理", path: "/subscriptions", icon: FileCode2, keywords: ["订阅模板", "Clash", "Sing-box"] },
      { title: "客户端适配", path: "/clients", icon: MonitorSmartphone, keywords: ["下载", "平台", "默认推荐"] },
    ],
  },
  {
    label: "用户与订阅",
    icon: Users,
    items: [
      { title: "用户管理", path: "/users", icon: Users },
      { title: "套餐管理", path: "/plans", icon: PackageOpen },
      { title: "订单管理", path: "/orders", icon: ShoppingBag },
      { title: "优惠券管理", path: "/coupons", icon: Tags },
      { title: "礼品卡管理", path: "/gift-cards", icon: Gift },
    ],
  },
  {
    label: "运营与支持",
    icon: BellRing,
    items: [
      { title: "公告管理", path: "/notices", icon: BellRing },
      { title: "知识库", path: "/knowledge", icon: BookOpenText },
      { title: "工单管理", path: "/tickets", icon: TicketCheck },
      { title: "邀请与佣金", path: "/commissions", icon: Gift },
    ],
  },
  {
    label: "财务与系统",
    icon: Settings2,
    items: [
      { title: "支付配置", path: "/payments", icon: CircleDollarSign },
      { title: "邮件配置", path: "/mail", icon: Mail },
      { title: "系统配置", path: "/settings", icon: Settings2 },
      { title: "版本更新", path: "/updates", icon: ArrowUpCircle, keywords: ["升级", "版本", "release", "dev", "节点客户端更新", "实例", "面板更新"] },
      { title: "主题与插件", path: "/extensions", icon: PlugZap },
      { title: "日志", path: "/logs", icon: FileClock, keywords: ["审计", "邮件发送", "流量重置", "运行日志", "日志配置", "清理", "保留期"] },
    ],
  },
]

export const serverWorkspaceTabs = [
  { title: "入站", value: "inbounds", icon: Layers3 },
  { title: "发布端点", value: "hosts", icon: Activity },
  { title: "回落站点", value: "fallback", icon: PanelsTopLeft },
  { title: "证书管理", value: "certificates", icon: KeyRound },
  { title: "路由", value: "routing", icon: ReceiptText },
  { title: "Xray 配置", value: "xray-config", icon: Settings2 },
] as const

export const resourceMeta: Record<string, { title: string; description: string; action: string }> = {
  users: { title: "用户管理", description: "管理用户状态、余额、流量、套餐、邀请关系与权限。", action: "新增用户" },
  plans: { title: "套餐管理", description: "配置套餐价格、流量、周期、权限组与可售状态。", action: "新增套餐" },
  orders: { title: "订单管理", description: "查询订单状态、支付方式、金额与开通结果。", action: "筛选订单" },
  coupons: { title: "优惠券管理", description: "创建固定额或比例优惠券，并控制数量、期限和套餐范围。", action: "新增优惠券" },
  "gift-cards": { title: "礼品卡管理", description: "管理礼品卡模板、兑换码、使用记录与发放统计。", action: "新增模板" },
  notices: { title: "公告管理", description: "发布面向用户的站内公告并控制展示顺序。", action: "新增公告" },
  knowledge: { title: "知识库", description: "维护分类、文章、访问级别与排序。", action: "新增文章" },
  tickets: { title: "工单管理", description: "处理用户问题、优先级、状态和回复记录。", action: "筛选工单" },
  commissions: { title: "邀请与佣金", description: "查看邀请关系、佣金比例、结算与提现申请。", action: "佣金设置" },
  clients: { title: "客户端适配", description: "维护各平台客户端、下载地址、文档、订阅导入模板与默认推荐。", action: "新增客户端" },
  payments: { title: "支付配置", description: "配置支付渠道、手续费、回调与启停状态。", action: "新增渠道" },
  mail: { title: "邮件配置", description: "管理 SMTP、发件人、模板与通知事件。", action: "发送测试邮件" },
  settings: { title: "系统配置", description: "集中管理站点、安全、订阅、注册、通知和运行参数。", action: "保存配置" },
  extensions: { title: "主题与插件", description: "管理用户端主题、管理端构建版本与扩展能力。", action: "安装扩展" },
  "audit-logs": { title: "审计日志", description: "追踪管理员操作、登录、配置变更和任务结果。", action: "导出日志" },
  "traffic-reset-logs": { title: "流量重置日志", description: "查询用户流量重置类型、触发源、清除量与执行时间。", action: "筛选日志" },
}

export function flatNavigation() {
  return adminNavigation.flatMap((group) => group.items)
}
