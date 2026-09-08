import * as React from "react"
import {
  Bot,
  Check,
  CircleAlert,
  Copy,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Radio,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getErrorMessage } from "@/hooks/use-admin-query"
import { useAdminChangeSync } from "@/lib/admin-change-sync"
import { useAdminApi } from "@/lib/auth"

type ScopePreset = "full" | "read" | "custom"
type ClientKind = "codex" | "claude" | "cursor" | "vscode" | "generic"
type KeyStatus = "active" | "revoked" | "expired"

type McpKeyRecord = {
  id: number
  name: string
  suffix: string
  scope: ScopePreset
  domains: string[]
  status: KeyStatus
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  last_ip: string | null
  last_client: string | null
  client: ClientKind
}

type GeneratedKey = {
  secret: string
  record: McpKeyRecord
}

type McpSettings = {
  enabled: boolean
  endpoint: string
  protocol_versions: string[]
  change_version: number
  coverage: {
    operation_count: number
    resource_count: number
    domains: Record<string, { operation_count: number; resource_count: number }>
  }
}

type CreateKeyInput = {
  name: string
  scope: ScopePreset
  domains: string[]
  client: ClientKind
  expires_in_days: number | "never"
}

const managementDomains = [
  {
    id: "infrastructure",
    label: "基础设施",
    resources: ["服务器", "节点", "权限组", "出站", "路由", "Xray 配置"],
    actions: "查询、新增、编辑、复制、排序、验证、重置流量",
    sensitive: "删除服务器、重置机器令牌",
  },
  {
    id: "accounts",
    label: "用户与订阅",
    resources: ["用户", "套餐", "客户端", "订阅模板"],
    actions: "查询、新增、编辑、批量处理、排序、导出",
    sensitive: "删除用户、重置订阅密钥",
  },
  {
    id: "finance",
    label: "订单与财务",
    resources: ["订单", "支付", "优惠券", "礼品卡", "佣金"],
    actions: "查询、创建、分配、更新、审核、导出",
    sensitive: "手动确认支付、取消订单",
  },
  {
    id: "operations",
    label: "运营与支持",
    resources: ["公告", "知识库", "工单", "邮件模板"],
    actions: "查询、发布、编辑、回复、排序、测试",
    sensitive: "发送邮件、删除内容、关闭工单",
  },
  {
    id: "system",
    label: "系统与扩展",
    resources: ["系统配置", "主题", "插件", "审计", "统计"],
    actions: "查询、保存、切换、配置、查看审计与统计",
    sensitive: "删除主题、启停插件、修改安全配置",
  },
] as const

const clientOptions: Array<{ value: ClientKind; label: string; description: string }> = [
  { value: "codex", label: "Codex", description: "PowerShell 命令" },
  { value: "claude", label: "Claude Code", description: "CLI 命令" },
  { value: "cursor", label: "Cursor", description: "mcp.json" },
  { value: "vscode", label: "VS Code", description: "mcp.json" },
  { value: "generic", label: "通用 MCP", description: "mcpServers JSON" },
]

export function McpSettingsPanel() {
  const api = useAdminApi()
  const sync = useAdminChangeSync()
  const [settings, setSettings] = React.useState<McpSettings | null>(null)
  const [keys, setKeys] = React.useState<McpKeyRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [serviceBusy, setServiceBusy] = React.useState(false)
  const [keyBusy, setKeyBusy] = React.useState<number | "create" | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [revokeTarget, setRevokeTarget] = React.useState<McpKeyRecord | null>(null)
  const [rotateTarget, setRotateTarget] = React.useState<McpKeyRecord | null>(null)
  const [generated, setGenerated] = React.useState<GeneratedKey | null>(null)
  const [resultClient, setResultClient] = React.useState<ClientKind>("codex")
  const endpoint = `${window.location.origin}/api/mcp`
  const activeKeyCount = keys.filter((key) => key.status === "active").length
  const serviceEnabled = settings?.enabled ?? false

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const [nextSettings, nextKeys] = await Promise.all([
        api.get<McpSettings>("mcp/settings", undefined, signal),
        api.get<McpKeyRecord[]>("mcp/keys", undefined, signal),
      ])
      setSettings(nextSettings)
      setKeys(nextKeys)
    } catch (cause) {
      if (!signal?.aborted) setError(getErrorMessage(cause, "MCP 配置读取失败。"))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [api])

  React.useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [load])

  async function updateService(checked: boolean) {
    setServiceBusy(true)
    try {
      const next = await api.post<McpSettings>("mcp/settings", { enabled: checked })
      setSettings(next)
      toast.success(checked ? "MCP 服务已启用" : "MCP 服务已停用，现有 Key 已立即失效")
    } catch (cause) {
      toast.error(getErrorMessage(cause, "MCP 服务状态保存失败。"))
    } finally {
      setServiceBusy(false)
    }
  }

  async function createKey(input: CreateKeyInput) {
    setKeyBusy("create")
    try {
      const result = await api.post<{ key: McpKeyRecord; secret: string }>("mcp/keys/create", input)
      setKeys((current) => [result.key, ...current])
      setGenerated({ secret: result.secret, record: result.key })
      setResultClient(result.key.client)
      toast.success("Key 和可导入配置已生成")
    } catch (cause) {
      toast.error(getErrorMessage(cause, "MCP Key 创建失败。"))
    } finally {
      setKeyBusy(null)
    }
  }

  function setGenerateDialogOpen(open: boolean) {
    setCreateOpen(open)
    if (!open) setGenerated(null)
  }

  async function revokeKey() {
    if (!revokeTarget) return
    setKeyBusy(revokeTarget.id)
    try {
      const revoked = await api.post<McpKeyRecord>("mcp/keys/revoke", { id: revokeTarget.id })
      setKeys((current) => current.map((key) => key.id === revoked.id ? revoked : key))
      toast.success(`${revokeTarget.name} 已撤销`)
      setRevokeTarget(null)
    } catch (cause) {
      toast.error(getErrorMessage(cause, "MCP Key 撤销失败。"))
    } finally {
      setKeyBusy(null)
    }
  }

  async function rotateKey() {
    if (!rotateTarget) return
    setKeyBusy(rotateTarget.id)
    try {
      const result = await api.post<{ key: McpKeyRecord; secret: string }>("mcp/keys/rotate", { id: rotateTarget.id })
      setKeys((current) => [
        result.key,
        ...current.map((key) => key.id === rotateTarget.id ? { ...key, status: "revoked" as const } : key),
      ])
      setGenerated({ secret: result.secret, record: result.key })
      setResultClient(result.key.client)
      setRotateTarget(null)
      setCreateOpen(true)
      toast.success(`${rotateTarget.name} 已轮换，旧 Key 已撤销`)
    } catch (cause) {
      toast.error(getErrorMessage(cause, "MCP Key 轮换失败。"))
    } finally {
      setKeyBusy(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">MCP 服务</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            为 Agent 创建独立访问密钥，并通过同一 Xboard 数据源管理后台全部资源。Agent 完成修改后，管理端会收到变更版本并重新读取对应页面。
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : error ? <CircleAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {loading ? "正在连接后端" : error ? "后端连接失败" : "真实后端配置"}
        </Badge>
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>MCP 配置暂时不可用</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" />重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm">服务与同步</CardTitle>
              <CardDescription className="mt-1">统一入口、短连接变更通知和断线版本补偿。</CardDescription>
            </div>
            <Badge variant={serviceEnabled ? "secondary" : "outline"}>
              {serviceEnabled ? <Radio aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              {serviceEnabled ? "服务已启用" : "服务已停用"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 p-4 sm:p-5">
          <Field orientation="horizontal" className="min-h-20 rounded-2xl border bg-background p-4">
            <div className="min-w-0 flex-1">
              <FieldTitle>启用 MCP 服务</FieldTitle>
              <FieldDescription>停用后已有 Key 立即不能调用，密钥记录和审计历史仍会保留。</FieldDescription>
            </div>
            <Switch
              id="mcp-service-enabled"
              checked={serviceEnabled}
              disabled={loading || serviceBusy || Boolean(error)}
              onCheckedChange={(checked) => void updateService(checked)}
            />
          </Field>

          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="mcp-endpoint">Streamable HTTP 端点</FieldLabel>
              <InputGroup>
                <InputGroupInput id="mcp-endpoint" className="font-data text-xs" readOnly value={endpoint} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="复制 MCP 端点" onClick={() => void copyText(endpoint, "MCP 端点")}>
                    <Copy aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>

          <dl className="grid overflow-hidden rounded-2xl border sm:grid-cols-3">
            <StatusItem term="传输协议" value="Streamable HTTP" detail="现代协议 + 旧版握手兼容" />
            <StatusItem
              term="前端同步"
              value={sync.status === "connected" ? "实时连接正常" : sync.status === "connecting" ? "正在建立连接" : "正在自动重连"}
              detail={`短 SSE + 版本补偿${sync.version === null ? "" : ` · v${sync.version}`}`}
            />
            <StatusItem term="审计身份" value="独立 MCP Key" detail="工具、资源和请求可追踪" />
          </dl>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm">访问密钥</CardTitle>
              <CardDescription className="mt-1">
                {activeKeyCount} 个有效 Key。明文只在创建或轮换完成时显示一次。
              </CardDescription>
            </div>
            <Button
              disabled={loading || Boolean(error)}
              onClick={() => {
                setGenerated(null)
                setCreateOpen(true)
              }}
            >
              <KeyRound data-icon="inline-start" aria-hidden="true" />
              生成导入
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>权限</TableHead>
                  <TableHead>密钥</TableHead>
                  <TableHead>最近使用</TableHead>
                  <TableHead>到期时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div className="min-w-36">
                        <div className="font-medium">{key.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ClientIcon client={key.client} />
                          {clientLabel(key.client)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={key.status === "active" ? "secondary" : "destructive"}>
                          {keyStatusLabel(key.status)}
                        </Badge>
                        <Badge variant="outline">{scopeLabel(key.scope, key.domains.length)}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-data text-xs">xbmcp_••••{key.suffix}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(key.last_used_at, "尚未使用")}
                      {key.last_client ? <div className="mt-1 max-w-40 truncate text-xs text-muted-foreground">{key.last_client}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(key.expires_at, "永不过期")}</TableCell>
                    <TableCell className="text-right">
                      <ButtonGroup className="ml-auto" aria-label={`${key.name} 操作`}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={key.status !== "active" || keyBusy === key.id}
                          onClick={() => setRotateTarget(key)}
                        >
                          {keyBusy === key.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                          重新生成
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-sm" aria-label={`更多 ${key.name} 操作`}>
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => void copyText(endpoint, "MCP 端点")}>
                                <Copy aria-hidden="true" />复制端点
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={key.status !== "active"}
                                onSelect={() => setRevokeTarget(key)}
                              >
                                <Trash2 aria-hidden="true" />撤销 Key
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-sm text-muted-foreground">
                      还没有 MCP Key。点击“生成导入”即可一次完成创建与配置生成。
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm">管理覆盖</CardTitle>
              <CardDescription className="mt-1">工具按后台业务域分组，读取与修改使用同一权限模型。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary"><Check aria-hidden="true" />管理面全覆盖</Badge>
              <Badge variant="outline">{settings?.coverage.resource_count ?? "—"} 类资源</Badge>
              <Badge variant="outline">{settings?.coverage.operation_count ?? "—"} 项管理操作</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>业务域</TableHead>
                  <TableHead>资源</TableHead>
                  <TableHead>常规操作</TableHead>
                  <TableHead>高风险操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managementDomains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">
                      {domain.label}
                      <div className="mt-1 text-xs font-normal text-muted-foreground">
                        {settings?.coverage.domains[domain.id]?.operation_count ?? "—"} 项操作
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-52 flex-wrap gap-1">
                        {domain.resources.map((resource) => <Badge key={resource} variant="outline">{resource}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-64 text-sm text-muted-foreground">{domain.actions}</TableCell>
                    <TableCell className="min-w-56 text-sm text-muted-foreground">{domain.sensitive}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <GenerateImportDialog
        open={createOpen}
        endpoint={endpoint}
        generated={generated}
        resultClient={resultClient}
        busy={keyBusy === "create"}
        onResultClientChange={setResultClient}
        onOpenChange={setGenerateDialogOpen}
        onCreate={createKey}
      />

      <Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>撤销 MCP Key</DialogTitle>
            <DialogDescription>
              {revokeTarget?.name} 将立即无法调用 MCP。历史审计记录仍会保留。
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>已导入的客户端会断开连接</AlertTitle>
            <AlertDescription>需要恢复访问时必须创建并导入一个新 Key。</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={keyBusy === revokeTarget?.id} onClick={() => void revokeKey()}>
              {keyBusy === revokeTarget?.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rotateTarget)} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重新生成 MCP Key</DialogTitle>
            <DialogDescription>
              将为 {rotateTarget?.name} 创建新 Key，并在同一事务中立即撤销旧 Key。
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>旧配置会立即失效</AlertTitle>
            <AlertDescription>确认后请复制新配置并更新已连接的客户端。</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={keyBusy === rotateTarget?.id} onClick={() => void rotateKey()}>
              {keyBusy === rotateTarget?.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              确认轮换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GenerateImportDialog({
  open,
  endpoint,
  generated,
  resultClient,
  busy,
  onResultClientChange,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  endpoint: string
  generated: GeneratedKey | null
  resultClient: ClientKind
  busy: boolean
  onResultClientChange: (client: ClientKind) => void
  onOpenChange: (open: boolean) => void
  onCreate: (input: CreateKeyInput) => Promise<void>
}) {
  const [name, setName] = React.useState("运维 Agent")
  const [client, setClient] = React.useState<ClientKind>("codex")
  const [scope, setScope] = React.useState<ScopePreset>("full")
  const [expiry, setExpiry] = React.useState("90")
  const [selectedDomains, setSelectedDomains] = React.useState<string[]>(managementDomains.map((domain) => domain.id))

  function setDialogOpen(next: boolean) {
    if (!next && busy) return
    onOpenChange(next)
  }

  async function generate() {
    await onCreate({
      name: name.trim(),
      client,
      scope,
      domains: scope === "custom" ? selectedDomains : managementDomains.map((domain) => domain.id),
      expires_in_days: expiry === "never" ? "never" : Number(expiry),
    })
  }

  const valid = name.trim().length > 0 && (scope !== "custom" || selectedDomains.length > 0)
  const importConfig = generated ? buildImportConfig(resultClient, endpoint, generated.secret) : ""

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{generated ? "导入配置已生成" : "生成 MCP 导入配置"}</DialogTitle>
          <DialogDescription>
            {generated
              ? "Key 明文只显示这一次。切换客户端会复用同一个 Key 生成对应格式。"
              : "一次完成 Key 创建和客户端配置生成；所有操作都会以这个 Key 的身份进入审计日志。"}
          </DialogDescription>
        </DialogHeader>

        {generated ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertTitle>请现在保存 Key 或完整导入配置</AlertTitle>
              <AlertDescription>关闭窗口后，服务端只保留摘要，无法再次显示这段明文。</AlertDescription>
            </Alert>

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="mcp-created-key">一次性 MCP Key</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="mcp-created-key" className="font-data text-xs" readOnly value={generated.secret} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label="复制一次性 MCP Key" onClick={() => void copyText(generated.secret, "MCP Key")}>
                      <Copy aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>关闭窗口后，页面只保留尾号 {generated.record.suffix}。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="mcp-import-client-result">导入到</FieldLabel>
                <Select value={resultClient} onValueChange={(value) => onResultClientChange(value as ClientKind)}>
                  <SelectTrigger id="mcp-import-client-result" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {clientOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.description}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{clientLabel(resultClient)} 导入内容</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">直接复制整段并粘贴到对应终端或配置文件。</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void copyText(importConfig, "导入配置")}>
                  <Copy data-icon="inline-start" aria-hidden="true" />复制完整配置
                </Button>
              </div>
              <pre className="max-h-72 overflow-auto p-4 font-data text-xs leading-6"><code>{importConfig}</code></pre>
            </div>
          </div>
        ) : (
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="mcp-key-name">Key 名称</FieldLabel>
              <Input
                id="mcp-key-name"
                value={name}
                maxLength={64}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：Codex 运维"
              />
              <FieldDescription>用于审计中识别 Agent 或使用场景。</FieldDescription>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mcp-import-client">首次导入目标</FieldLabel>
                <Select value={client} onValueChange={(value) => setClient(value as ClientKind)}>
                  <SelectTrigger id="mcp-import-client" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {clientOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.description}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="mcp-key-expiry">有效期</FieldLabel>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id="mcp-key-expiry" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="30">30 天</SelectItem>
                      <SelectItem value="90">90 天</SelectItem>
                      <SelectItem value="365">1 年</SelectItem>
                      <SelectItem value="never">永不过期</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <FieldSet>
              <FieldLegend variant="label">权限预设</FieldLegend>
              <FieldDescription>高风险工具仍要求 Agent 传入明确确认字段，并完整记录审计。</FieldDescription>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={scope}
                onValueChange={(value) => value && setScope(value as ScopePreset)}
                className="max-w-full flex-wrap"
                aria-label="MCP Key 权限预设"
              >
                <ToggleGroupItem value="full">全部管理</ToggleGroupItem>
                <ToggleGroupItem value="read">只读审计</ToggleGroupItem>
                <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>

            {scope === "custom" ? (
              <FieldSet>
                <FieldLegend variant="label">允许的管理域</FieldLegend>
                <FieldGroup className="grid gap-2 sm:grid-cols-2">
                  {managementDomains.map((domain) => (
                    <Field key={domain.id} orientation="horizontal" className="rounded-xl border p-3">
                      <FieldLabel htmlFor={`mcp-domain-${domain.id}`} className="font-normal">{domain.label}</FieldLabel>
                      <Checkbox
                        id={`mcp-domain-${domain.id}`}
                        checked={selectedDomains.includes(domain.id)}
                        onCheckedChange={(checked) => setSelectedDomains((current) => checked
                          ? [...current, domain.id]
                          : current.filter((id) => id !== domain.id))}
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            ) : null}
          </FieldGroup>
        )}

        <DialogFooter>
          {generated ? (
            <Button onClick={() => setDialogOpen(false)}>
              <Check data-icon="inline-start" aria-hidden="true" />完成
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>取消</Button>
              <Button disabled={!valid || busy} onClick={() => void generate()}>
                {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <KeyRound data-icon="inline-start" aria-hidden="true" />}
                {busy ? "正在创建" : "创建 Key 并生成导入"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatusItem({ term, value, detail }: { term: string; value: string; detail: string }) {
  return (
    <div className="flex min-h-28 flex-col justify-between gap-3 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd>
        <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck aria-hidden="true" />{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </dd>
    </div>
  )
}

function ClientIcon({ client }: { client: ClientKind }) {
  return client === "codex" || client === "claude"
    ? <TerminalSquare className="size-3.5" aria-hidden="true" />
    : <Bot className="size-3.5" aria-hidden="true" />
}

function scopeLabel(scope: ScopePreset, domainCount: number) {
  if (scope === "full") return "全部管理"
  if (scope === "read") return "只读审计"
  return `${domainCount} 个管理域`
}

function keyStatusLabel(status: KeyStatus) {
  if (status === "active") return "有效"
  if (status === "expired") return "已过期"
  return "已撤销"
}

function clientLabel(client: ClientKind) {
  return clientOptions.find((option) => option.value === client)?.label ?? "通用 MCP"
}

function formatDateTime(value: string | null, empty: string) {
  if (!value) return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function buildImportConfig(client: ClientKind, endpoint: string, secret: string) {
  if (client === "codex") {
    return [
      `[Environment]::SetEnvironmentVariable("XBOARD_MCP_TOKEN", "${secret}", "User")`,
      `codex mcp add xboard --url "${endpoint}" --bearer-token-env-var XBOARD_MCP_TOKEN`,
    ].join("\n")
  }

  if (client === "claude") {
    return `claude mcp add --transport http --scope user xboard "${endpoint}" --header "Authorization: Bearer ${secret}"`
  }

  if (client === "vscode") {
    return JSON.stringify({
      servers: {
        xboard: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    }, null, 2)
  }

  if (client === "cursor") {
    return JSON.stringify({
      mcpServers: {
        xboard: {
          url: endpoint,
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    }, null, 2)
  }

  return JSON.stringify({
    mcpServers: {
      xboard: {
        type: "http",
        url: endpoint,
        headers: { Authorization: `Bearer ${secret}` },
      },
    },
  }, null, 2)
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label}已复制`)
  } catch {
    toast.error(`${label}复制失败，请手动选择文本。`)
  }
}
