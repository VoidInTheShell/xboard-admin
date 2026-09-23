# Xboard-Admin

Xboard 管理后台前端（独立 SPA），与 [Xboard](https://github.com/VoidInTheShell/Xboard)
后端配套使用。仓库同时包含面板更新器（`updater/`，Go）——Admin 镜像与
`xboard-admin-updater` 镜像、二进制从同一提交构建，构成一个版本单元发布。

## 功能概览

- 仪表盘、使用记录、排行榜与用量可观测性
- 服务器 / 权限组 / 订阅 / 客户端适配 / 出站 / 节点管理
- 用户与订阅、订单、优惠券、礼品卡、工单
- 证书管理（机器作用域 + 面板作用域，面板证书由入口网关自动签发/续期）
- 版本更新：对后端 / Admin / Theme / Node 组件选择准确版本执行更新、回退与恢复
- MCP：后端提供 MCP 工具目录，可用 MCP 客户端管理面板

## 运行形态

Admin 有两种访问形态，同一构建同时支持：

1. **随 Theme 路由（推荐）**：DK_Theme 在面板域名下把 `/<admin-path>/` 路由到本
   服务，`/<admin-path>/original` 保留后端内置管理视图。公网仅暴露主题入口。
2. **独立端口**：直接访问 Admin 容器端口（默认不发布，需要时自行映射或由反向
   代理转发）。

管理员安全路径由后端 `secure_path` 决定；登录走后端
`/api/v1/passport/auth/login`，管理 API 在 `/api/v2/<admin-path>/` 下。

## 开发

~~~bash
npm install
npm run dev          # http://localhost:5173
npm run build        # 生产构建（dist/）
npm test             # 单元测试
~~~

本地预览（不连真实后端）：

~~~bash
VITE_LOCAL_PREVIEW_AUTH=true npm run dev              # 本地登录旁路
VITE_CERTIFICATE_PREVIEW=true npm run dev             # 证书页 mock 数据
~~~~

连接真实后端开发时，用 `VITE_DEV_PROXY_TARGET` 指向面板地址（或本地后端
`http://127.0.0.1:7001`），Vite 会把 `/api` 代理过去。

设计规范见 `design-system/`；UI 遵循 shadcn 组件与中文文案约定。

## 版本与发布

- 发布物：`ghcr.io/voidintheshell/xboard-admin`、
  `ghcr.io/voidintheshell/xboard-admin-updater`、
  `xboard-updater-linux-{amd64,arm64}`、`release-manifest.json`（schema 2）。
- Admin 与 Updater 必须同版本部署；Xboard 发布清单的 component suite 记录了
  匹配的 Admin 版本。
- 升级/回退通过面板的“版本更新”页面执行，由更新器完成交接；不在 CI 中自动
  部署。更新器细节见 [updater/README.md](./updater/README.md)。

## 与其他仓库的关系

| 仓库 | 角色 |
| --- | --- |
| Xboard | 面板后端与 API |
| Xboard-Admin | 本仓库：管理后台前端 + 面板更新器 |
| DK_Theme | 用户面板主题（公网入口、Admin 路由） |
| Xboard-Node | 节点端 |
