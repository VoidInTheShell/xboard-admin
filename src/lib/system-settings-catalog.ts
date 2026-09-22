import type { CatalogField, CatalogTab } from "@/lib/control-plane/catalog-types"

type SettingDefinition = Omit<CatalogField, "key" | "backendKey">

function setting(group: string, backendKey: string, definition: SettingDefinition): CatalogField {
  return {
    ...definition,
    key: `${group}.${backendKey}`,
    backendKey,
    sourceGroup: group,
  }
}

const resetTrafficOptions = [
  { value: "0", label: "每月 1 日" },
  { value: "1", label: "按月重置" },
  { value: "2", label: "不重置" },
  { value: "3", label: "每年 1 月 1 日" },
  { value: "4", label: "按年重置" },
]

export const systemSettingsCatalog: CatalogTab[] = [
  {
    id: "site",
    title: "站点",
    description: "维护用户端公开信息、注册入口和试用策略。",
    sections: [{
      id: "site-basic",
      title: "站点与品牌",
      fields: [
        setting("site", "app_name", { label: "站点名称", control: "text", required: true, defaultValue: "XBoard" }),
        setting("site", "app_url", { label: "站点网址", control: "text", placeholder: "https://example.com" }),
        setting("site", "app_description", { label: "站点描述", control: "textarea", rows: 4, span: 2 }),
        setting("site", "logo", { label: "站点 Logo", control: "text", placeholder: "https://example.com/logo.png", span: 2, description: "用于用户后台与管理后台的品牌标识。可填写图片链接，或上传并裁剪图片。" }),
        setting("site", "subscribe_url", { label: "订阅 URL", control: "text", description: "留空时由站点网址和订阅路径组合生成。" }),
        setting("site", "tos_url", { label: "用户条款 URL", control: "text" }),
        setting("site", "currency", { label: "货币单位", control: "text", defaultValue: "CNY" }),
        setting("site", "currency_symbol", { label: "货币符号", control: "text", defaultValue: "¥" }),
        setting("site", "force_https", { label: "强制 HTTPS", control: "switch" }),
        setting("site", "stop_register", { label: "停止新用户注册", control: "switch" }),
        setting("site", "ticket_must_wait_reply", { label: "工单等待回复限制", control: "switch", description: "开启后，用户必须等待上一条工单消息得到回复后才能继续发送。" }),
        setting("site", "try_out_plan_id", { label: "注册试用套餐 ID", control: "number", valueType: "number", description: "0 表示不为新用户自动分配试用套餐。" }),
        setting("site", "try_out_hour", { label: "试用时长（小时）", control: "number", valueType: "number", defaultValue: 24 }),
      ],
    }],
  },
  {
    id: "safe",
    title: "安全",
    description: "管理后台入口、注册安全、人机验证与频率限制。",
    sections: [
      {
        id: "safe-account",
        title: "账户与后台",
        fields: [
          setting("safe", "email_verify", { label: "邮箱验证", control: "switch" }),
          setting("safe", "email_gmail_limit_enable", { label: "禁止 Gmail 多别名", control: "switch" }),
          setting("safe", "safe_mode_enable", { label: "安全模式", control: "switch" }),
          setting("safe", "secure_path", { label: "后台路径", control: "text", required: true, defaultValue: "unitedearthgov", description: "至少 8 个字符，仅允许字母、数字、下划线和连字符。保存后会自动切换到新的 Xboard Admin 入口；原版面板仅保留为账户菜单中的兼容回退入口。" }),
          setting("safe", "email_whitelist_enable", { label: "邮箱后缀白名单", control: "switch" }),
          setting("safe", "email_whitelist_suffix", { label: "允许的邮箱后缀", control: "tags", valueType: "string-array", placeholder: "example.com, example.org", span: 2, showWhen: { field: "safe.email_whitelist_enable", equals: true } }),
        ],
      },
      {
        id: "safe-captcha",
        title: "验证码与频率限制",
        fields: [
          setting("safe", "captcha_enable", { label: "启用验证码", control: "switch" }),
          setting("safe", "captcha_type", { label: "验证码类型", control: "select", defaultValue: "turnstile", options: [{ value: "recaptcha", label: "reCAPTCHA v2" }, { value: "recaptcha-v3", label: "reCAPTCHA v3" }, { value: "turnstile", label: "Cloudflare Turnstile" }], showWhen: { field: "safe.captcha_enable", equals: true } }),
          setting("safe", "turnstile_site_key", { label: "Turnstile Site Key", control: "text", showWhen: { field: "safe.captcha_type", equals: "turnstile" } }),
          setting("safe", "turnstile_secret_key", { label: "Turnstile Secret Key", control: "password", sensitive: true, description: "留空表示保留后端当前值。", showWhen: { field: "safe.captcha_type", equals: "turnstile" } }),
          setting("safe", "recaptcha_site_key", { label: "reCAPTCHA v2 Site Key", control: "text", showWhen: { field: "safe.captcha_type", equals: "recaptcha" } }),
          setting("safe", "recaptcha_key", { label: "reCAPTCHA v2 Secret Key", control: "password", sensitive: true, description: "留空表示保留后端当前值。", showWhen: { field: "safe.captcha_type", equals: "recaptcha" } }),
          setting("safe", "recaptcha_v3_site_key", { label: "reCAPTCHA v3 Site Key", control: "text", showWhen: { field: "safe.captcha_type", equals: "recaptcha-v3" } }),
          setting("safe", "recaptcha_v3_secret_key", { label: "reCAPTCHA v3 Secret Key", control: "password", sensitive: true, description: "留空表示保留后端当前值。", showWhen: { field: "safe.captcha_type", equals: "recaptcha-v3" } }),
          setting("safe", "recaptcha_v3_score_threshold", { label: "v3 分数阈值", control: "number", valueType: "number", defaultValue: 0.5, description: "允许范围 0 到 1。", showWhen: { field: "safe.captcha_type", equals: "recaptcha-v3" } }),
          setting("safe", "register_limit_by_ip_enable", { label: "IP 注册限制", control: "switch" }),
          setting("safe", "register_limit_count", { label: "允许注册次数", control: "number", valueType: "number", defaultValue: 3, showWhen: { field: "safe.register_limit_by_ip_enable", equals: true } }),
          setting("safe", "register_limit_expire", { label: "注册限制时长（分钟）", control: "number", valueType: "number", defaultValue: 60, showWhen: { field: "safe.register_limit_by_ip_enable", equals: true } }),
          setting("safe", "password_limit_enable", { label: "密码尝试限制", control: "switch", defaultValue: true }),
          setting("safe", "password_limit_count", { label: "允许尝试次数", control: "number", valueType: "number", defaultValue: 5, showWhen: { field: "safe.password_limit_enable", equals: true } }),
          setting("safe", "password_limit_expire", { label: "锁定时长（分钟）", control: "number", valueType: "number", defaultValue: 60, showWhen: { field: "safe.password_limit_enable", equals: true } }),
        ],
      },
    ],
  },
  {
    id: "subscribe",
    title: "订阅",
    description: "维护订阅变更、流量重置和订单事件策略。",
    sections: [{
      id: "subscribe-policy",
      title: "订阅与订单策略",
      fields: [
        setting("subscribe", "plan_change_enable", { label: "允许用户更改订阅", control: "switch" }),
        setting("subscribe", "reset_traffic_method", { label: "全局流量重置方式", control: "select", valueType: "number", defaultValue: "0", options: resetTrafficOptions, description: "套餐可以单独覆盖这项全局策略。" }),
        setting("subscribe", "surplus_enable", { label: "开启折抵方案", control: "switch" }),
        setting("subscribe", "show_info_to_server_enable", { label: "订阅中展示订阅信息", control: "switch" }),
        setting("subscribe", "show_protocol_to_server_enable", { label: "线路名称显示协议", control: "switch" }),
        setting("subscribe", "default_remind_expire", { label: "默认到期提醒", control: "switch", defaultValue: true }),
        setting("subscribe", "default_remind_traffic", { label: "默认流量提醒", control: "switch", defaultValue: true }),
        setting("subscribe", "subscribe_path", { label: "订阅路径", control: "text", defaultValue: "s", description: "只填写路径片段，不包含站点域名。" }),
        setting("subscribe", "new_order_event_id", { label: "新购订单事件 ID", control: "number", valueType: "number" }),
        setting("subscribe", "renew_order_event_id", { label: "续费订单事件 ID", control: "number", valueType: "number" }),
        setting("subscribe", "change_order_event_id", { label: "变更订单事件 ID", control: "number", valueType: "number" }),
      ],
    }],
  },
  {
    id: "invite",
    title: "邀请与佣金",
    description: "管理邀请码、佣金确认、提现和三级分销比例。",
    sections: [{
      id: "invite-policy",
      title: "邀请、提现与三级分销",
      fields: [
        setting("invite", "invite_force", { label: "开启强制邀请", control: "switch" }),
        setting("invite", "invite_commission", { label: "邀请佣金百分比", control: "number", valueType: "number", defaultValue: 10 }),
        setting("invite", "invite_gen_limit", { label: "邀请码生成上限", control: "number", valueType: "number", defaultValue: 5 }),
        setting("invite", "invite_never_expire", { label: "邀请码永不失效", control: "switch" }),
        setting("invite", "commission_first_time_enable", { label: "佣金仅首次发放", control: "switch" }),
        setting("invite", "commission_auto_check_enable", { label: "佣金自动确认", control: "switch" }),
        setting("invite", "commission_withdraw_limit", { label: "提现申请门槛", control: "number", valueType: "number" }),
        setting("invite", "commission_withdraw_method", { label: "提现方式", control: "tags", valueType: "string-array", placeholder: "支付宝, 银行卡" }),
        setting("invite", "withdraw_close_enable", { label: "关闭提现", control: "switch" }),
        setting("invite", "commission_distribution_enable", { label: "启用三级分销", control: "switch" }),
        setting("invite", "commission_distribution_l1", { label: "一级比例", control: "number", valueType: "number", showWhen: { field: "invite.commission_distribution_enable", equals: true } }),
        setting("invite", "commission_distribution_l2", { label: "二级比例", control: "number", valueType: "number", showWhen: { field: "invite.commission_distribution_enable", equals: true } }),
        setting("invite", "commission_distribution_l3", { label: "三级比例", control: "number", valueType: "number", showWhen: { field: "invite.commission_distribution_enable", equals: true } }),
      ],
    }],
  },
  {
    id: "server",
    title: "节点通信",
    description: "管理面板与节点之间的令牌、轮询频率和 WebSocket 通道。",
    sections: [{
      id: "server-control-plane",
      title: "面板与节点通信",
      fields: [
        setting("server", "server_token", { label: "通讯密钥", control: "password", sensitive: true, span: 2, description: "至少 16 位；留空表示保留后端当前值。修改后需要同步节点 API Key。" }),
        setting("server", "server_pull_interval", { label: "节点拉取间隔（秒）", control: "number", valueType: "number", defaultValue: 60 }),
        setting("server", "server_push_interval", { label: "节点推送间隔（秒）", control: "number", valueType: "number", defaultValue: 60 }),
        setting("server", "device_limit_mode", { label: "设备限制模式", control: "select", valueType: "number", defaultValue: "0", options: [{ value: "0", label: "严格模式" }, { value: "1", label: "宽松模式" }], description: "宽松模式下，同一 IP 使用多个节点只统计为一个设备。" }),
        setting("server", "server_ws_enable", { label: "WebSocket 通信", control: "switch", description: "当前 Xboard Node 支持此实时通信方式。" }),
        setting("server", "server_ws_url", { label: "WebSocket 地址", control: "text", placeholder: "wss://example.com/ws", span: 2, showWhen: { field: "server.server_ws_enable", equals: true } }),
      ],
    }],
  },
  {
    id: "telegram",
    title: "Telegram",
    description: "维护机器人、Webhook 基础地址和用户端群组入口。",
    sections: [{
      id: "telegram-bot",
      title: "机器人与绑定引导",
      fields: [
        setting("telegram", "telegram_bot_enable", { label: "启用 Telegram 机器人", control: "switch" }),
        setting("telegram", "telegram_bot_token", { label: "机器人令牌", control: "password", sensitive: true, span: 2, description: "留空表示保留后端当前值。", showWhen: { field: "telegram.telegram_bot_enable", equals: true } }),
        setting("telegram", "telegram_webhook_url", { label: "Webhook Base URL", control: "text", span: 2, description: "填写公开基础地址；后端会自动补上 Telegram webhook 路径。", showWhen: { field: "telegram.telegram_bot_enable", equals: true } }),
        setting("telegram", "telegram_discuss_link", { label: "群组链接", control: "text", placeholder: "https://t.me/example" }),
      ],
    }],
  },
  {
    id: "frontend",
    title: "主题控制",
    description: "按前端分别管理外观、登录页面与菜单。站点名称、Logo 和描述统一使用站点配置。",
    sections: [{
      id: "user",
      title: "用户后台",
      description: "DK Theme 的登录页面、菜单和展示方式。",
      fields: [
        setting("frontend", "self_use_mode", { label: "自用模式", control: "switch", description: "隐藏首页补充指标，并向所有用户显示节点所属服务器的剩余流量。", span: 2 }),
        setting("frontend", "user_login_title", { label: "登录页标题", control: "text", placeholder: "欢迎使用 {站点名称}", span: 2 }),
        setting("frontend", "user_login_description", { label: "登录页描述", control: "textarea", description: "留空时使用通用站点描述。", span: 2 }),
        setting("frontend", "user_hidden_menus", { label: "隐藏菜单", control: "multiselect", options: [
          { value: "/usage", label: "使用记录" }, { value: "/leaderboard", label: "排行榜" },
          { value: "/node-status", label: "节点状态" }, { value: "/invite", label: "邀请返利" },
          { value: "/tickets", label: "工单支持" }, { value: "/knowledge", label: "帮助文档" },
        ], description: "仅隐藏导航入口，不改变账户权限。", span: 2 }),
        setting("frontend", "user_support_enabled", { label: "显示获取支持菜单", control: "switch", defaultValue: true, span: 2, description: "关闭后，用户后台侧栏不显示获取支持入口。" }),
        setting("frontend", "user_support_description", { label: "支持说明", control: "textarea", defaultValue: "选择联系方式，或通过工单和帮助文档获取支持。", showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_telegram_label", { label: "客服 Telegram 名称", control: "text", placeholder: "@support", showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_telegram_url", { label: "客服 Telegram 链接", control: "text", placeholder: "https://t.me/support", showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_group_label", { label: "Telegram 群组名称", control: "text", showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_group_url", { label: "Telegram 群组链接", control: "text", placeholder: "https://t.me/group", showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_ticket_enabled", { label: "支持窗口显示工单入口", control: "switch", defaultValue: true, showWhen: { field: "frontend.user_support_enabled", equals: true } }),
        setting("frontend", "user_support_knowledge_enabled", { label: "支持窗口显示帮助文档", control: "switch", defaultValue: true, showWhen: { field: "frontend.user_support_enabled", equals: true } }),
      ],
    }, {
      id: "admin",
      title: "管理后台",
      description: "XAdmin 菜单与登录页个性化；登录页背景、毛玻璃和遮罩效果仅影响 XAdmin 登录页。",
      fields: [
        setting("frontend", "admin_hidden_menus", { label: "隐藏菜单", control: "multiselect", options: [
          { value: "/usage", label: "使用记录" }, { value: "/leaderboard", label: "排行榜" },
          { value: "/commissions", label: "邀请与佣金" }, { value: "/knowledge", label: "知识库" },
          { value: "/extensions", label: "主题与插件" },
        ], description: "仅隐藏导航入口，不改变管理员权限。系统配置入口始终保留。", span: 2 }),
        setting("frontend", "admin_login_background", { label: "登录页背景图片", control: "text", placeholder: "https://example.com/background.jpg", span: 2, description: "登录页整页背景图，建议横向大图。留空使用默认深色背景。" }),
        setting("frontend", "admin_login_glass_opacity", { label: "登录框毛玻璃不透明度", control: "slider", valueType: "number", defaultValue: 60, min: 0, max: 95, step: 1, description: "登录卡片的底色浓度：值越低背景越通透，越高文字越清晰。" }),
        setting("frontend", "admin_login_mask_opacity", { label: "登录页背景遮罩透明度", control: "slider", valueType: "number", defaultValue: 40, min: 0, max: 90, step: 1, description: "背景图上叠加的暗色遮罩浓度：越高背景图越暗、登录内容越突出。仅在使用自定义背景图时生效。" }),
      ],
    }, {
      id: "original",
      title: "原版配置",
      description: "管理原版主题的外观；这些选项不影响 DK Theme 和 XAdmin。",
      fields: [
        setting("frontend", "frontend_theme", { label: "当前主题", control: "select", required: true, options: [] }),
        setting("frontend", "frontend_theme_color", { label: "主题色", control: "select", defaultValue: "default", options: [{ value: "default", label: "默认" }, { value: "darkblue", label: "深蓝" }, { value: "black", label: "黑色" }, { value: "green", label: "绿色" }] }),
        setting("frontend", "frontend_theme_sidebar", { label: "侧栏外观", control: "select", defaultValue: "light", options: [{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }] }),
        setting("frontend", "frontend_theme_header", { label: "顶栏外观", control: "select", defaultValue: "dark", options: [{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }] }),
        setting("frontend", "frontend_background_url", { label: "背景图片 URL", control: "text", span: 2 }),
      ],
    }],
  },
]
