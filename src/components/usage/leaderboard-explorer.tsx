import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUsageApi } from "@/lib/usage-api";
import { Tabs as TabsPrimitive } from "radix-ui";
import {
  Trophy,
  Medal,
  Users,
  Network,
  MonitorSmartphone,
  Fingerprint,
  Globe,
  ArrowDown,
  ArrowUp,
  Search,
  ShieldCheck,
  RefreshCw,
  Info,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  DateRangeSelect,
  UsageSelect,
  UsageEmpty,
  RankingChart,
} from "@/components/usage/usage-charts";
import {
  defaultRange,
  formatGiB,
  formatTime,
  usagePreviewEnabled,
  rangeBounds,
} from "@/lib/usage-data";
import { makeLeaderboardPreview, type RankEntry } from "@/lib/leaderboard-data";
import { cn } from "@/lib/utils";

export const leaderboardCategories = [
  { id: "users", title: "用户流量排行", icon: Users },
  { id: "nodes", title: "节点流量排行", icon: Network },
  { id: "devices", title: "历史设备排行", icon: MonitorSmartphone },
];
type Kind = "users" | "nodes" | "devices";

export function LeaderboardExplorer({
  admin = false,
  navigation,
}: {
  admin?: boolean;
  navigation?: ReactNode;
}) {
  const api = useUsageApi();
  const [remoteData, setRemote] = useState<{
    rows: RankEntry[];
    participants: number;
    total: number;
    own: { rank: number; value: number } | null;
    sampledAt: number;
  } | null>(null);
  const [remoteKey, setRemoteKey] = useState("");
  const [remoteError, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState(() => defaultRange(now));
  const [kind, setKind] = useState<Kind>("users");
  const [search, setSearch] = useState("");
  const [deviceScope, setDeviceScope] = useState("all");
  const [limit, setLimit] = useState("10");
  const queryKey = JSON.stringify([
    range,
    now,
    kind,
    deviceScope,
    limit,
    search,
  ]);
  const remote = remoteKey === queryKey ? remoteData : null;
  const error = remoteKey === queryKey ? remoteError : "";
  const loading = !usagePreviewEnabled && remoteKey !== queryKey;
  useEffect(() => {
    if (usagePreviewEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const [from, to] = rangeBounds(range, now);
      api
        .get<NonNullable<typeof remote>>(
          "usage/leaderboard",
          {
            from: Math.floor(from / 1000),
            to: Math.floor(to / 1000),
            kind,
            period: deviceScope === "period" ? 1 : 0,
            limit: Number(limit),
            search,
          },
          controller.signal,
        )
        .then((data) => {
          if (!controller.signal.aborted) {
            setRemote(data);
            setRemoteKey(queryKey);
            setError("");
          }
        })
        .catch((reason: Error) => {
          if (!controller.signal.aborted) {
            setError(reason.message);
            setRemoteKey(queryKey);
            setRemote(null);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, range, now, kind, deviceScope, limit, search, queryKey]);
  const data = useMemo(
    () => makeLeaderboardPreview(range, now, deviceScope === "period", admin),
    [range, now, deviceScope, admin],
  );
  const rows = usagePreviewEnabled ? data[kind] : (remote?.rows ?? []);
  const filtered = rows.filter((row) =>
    row.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const shown = filtered.slice(0, Number(limit));
  const total = usagePreviewEnabled
    ? rows.reduce((sum, row) => sum + row.value, 0)
    : (remote?.total ?? 0);
  const leader = rows[0];
  const own =
    kind !== "nodes"
      ? usagePreviewEnabled
        ? rows.find((row) => row.isSelf)
        : remote?.own
          ? {
              rank: remote.own.rank,
              value: remote.own.value / (kind === "devices" ? 1 : 1073741824),
            }
          : undefined
      : undefined;
  const cumulative = kind === "devices" && deviceScope === "all";
  const title = leaderboardCategories.find((item) => item.id === kind)!.title;
  const amount = (value: number) =>
    kind === "devices"
      ? value.toLocaleString("zh-CN") + " 个"
      : formatGiB(value);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Trophy className="size-6" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight">排行榜</h1>
            {usagePreviewEnabled && <Badge variant="outline">演示数据</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {admin
              ? "查看全体用户和节点的用量排名，管理员可查看完整用户邮箱。"
              : "查看全体用户和节点的用量排名；邮箱已脱敏，仅公开汇总数据。"}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setNow(Date.now())}
          disabled={!usagePreviewEnabled && !remote && !error}
        >
          <RefreshCw data-icon="inline-start" />
          刷新榜单
        </Button>
      </div>
      {(!usagePreviewEnabled && !remoteData) || error ? (
        <UsageEmpty
          title={error ? "排行榜加载失败" : "正在加载排行榜"}
          description={
            error || "正在读取汇总数据，不公开其他用户的 IP 或访问明细。"
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: kind === "nodes" ? "参与节点" : "参与用户",
                value: loading
                  ? "—"
                  : (usagePreviewEnabled
                      ? rows.length
                      : (remote?.participants ?? 0)
                    ).toLocaleString(),
                hint: "同值并列，搜索不改变名次",
                icon: kind === "nodes" ? Network : Users,
              },
              {
                label:
                  kind === "devices" ? "历史设备 / IP 标识" : "榜单原始总流量",
                value: loading ? "—" : amount(total),
                hint: cumulative ? "累计记录 · 包含离线设备" : "当前统计范围",
                icon: kind === "devices" ? Fingerprint : ArrowDown,
              },
              {
                label: !admin && kind !== "nodes" ? "我的名次" : "榜首用量",
                value: loading
                  ? "—"
                  : !admin && kind !== "nodes"
                    ? own
                      ? "#" + own.rank
                      : "未上榜"
                    : amount(leader?.value ?? 0),
                hint:
                  !admin && kind !== "nodes"
                    ? own
                      ? amount(own.value)
                      : "当前统计范围内暂无记录"
                    : (leader?.label ?? "暂无数据"),
                icon: Trophy,
              },
            ].map((item) => (
              <Card key={item.label} className="gap-3 py-4">
                <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
                  <CardDescription>{item.label}</CardDescription>
                  <item.icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-1 px-4">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    {item.value}
                  </span>
                  <span className="break-all text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
          <TabsPrimitive.Root
            value={kind}
            onValueChange={(value) => {
              setKind(value as Kind);
              setSearch("");
            }}
            orientation={admin ? "vertical" : "horizontal"}
            className={cn(
              "min-w-0",
              admin
                ? "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-6"
                : "group/tabs flex flex-col gap-4",
            )}
          >
            {admin ? (
              navigation
            ) : (
              <div className="max-w-full overflow-x-auto overflow-y-hidden pb-px">
                <TabsList className="w-max">
                  {leaderboardCategories.map((item) => (
                    <TabsTrigger key={item.id} value={item.id}>
                      <item.icon aria-hidden="true" />
                      {item.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{title}</h2>
                {cumulative ? (
                  <Badge variant="outline">累计历史</Badge>
                ) : (
                  <DateRangeSelect
                    value={range}
                    onChange={setRange}
                    label="排行榜日期范围"
                  />
                )}
              </div>
              {!cumulative && range.preset === "custom" && (
                <p className="text-xs text-muted-foreground">
                  {range.from} 至 {range.to} · UTC+8
                </p>
              )}
              {kind === "devices" && (
                <div className="flex flex-wrap items-center gap-2">
                  <UsageSelect
                    label="设备排行统计口径"
                    value={deviceScope}
                    onChange={setDeviceScope}
                    options={[
                      { value: "all", label: "累计历史记录" },
                      { value: "period", label: "所选日期首次记录" },
                    ]}
                  />
                  <span className="text-xs text-muted-foreground">
                    {cumulative
                      ? "累计榜不受日期筛选影响；可切换为按首次记录日期统计。"
                      : "统计所选日期首次记录的设备和无 ID 来源。"}
                  </span>
                </div>
              )}
              <Alert>
                <ShieldCheck />
                <AlertDescription>
                  {kind === "devices"
                    ? "当前不采集节点设备 ID，按每位用户的历史 IP 去重，包含已离线记录。IP 数量不等于物理设备数量，可能受共享出口或动态 IP 影响。"
                    : "流量按原始上传 + 下载排名，不使用套餐计费倍率，不包含服务器整机网卡流量。"}
                  {!admin &&
                    " 不提供其他用户的 IP、设备 ID、邮箱原文或访问明细。"}
                </AlertDescription>
              </Alert>
              {leaderboardCategories.map((category) => (
                <TabsContent
                  key={category.id}
                  value={category.id}
                  className="m-0 flex min-w-0 flex-col gap-4"
                >
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <category.icon aria-hidden="true" />
                          前六名分布
                        </CardTitle>
                        {cumulative ? (
                          <Badge variant="outline">累计历史</Badge>
                        ) : (
                          <DateRangeSelect
                            value={range}
                            onChange={setRange}
                            label="排行图表日期范围"
                          />
                        )}
                      </div>
                      <CardDescription>
                        {cumulative ? "累计历史记录" : "跟随所选日期"} ·{" "}
                        {kind === "devices"
                          ? "按用户去重的历史 IP 数量"
                          : "原始流量"}{" "}
                        · 同分并列
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RankingChart
                        data={rows.slice(0, 6).map((row) => ({
                          name: row.label,
                          value: row.value,
                        }))}
                        unit={kind === "devices" ? "个" : "GiB"}
                        valueLabel={
                          kind === "devices" ? "历史设备 / IP" : "原始流量"
                        }
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <CardTitle className="flex items-center gap-2">
                            <Medal aria-hidden="true" />
                            完整榜单
                          </CardTitle>
                          <CardDescription>
                            {cumulative ? "累计历史" : "所选日期范围"} ·
                            按用量降序，搜索保留全局名次
                          </CardDescription>
                        </div>
                        <UsageSelect
                          label="榜单显示数量"
                          value={limit}
                          onChange={setLimit}
                          options={[
                            { value: "10", label: "前 10 名" },
                            { value: "20", label: "前 20 名" },
                            { value: "50", label: "前 50 名" },
                          ]}
                        />
                      </div>
                      <InputGroup className="mt-3 w-full sm:max-w-sm">
                        <InputGroupAddon>
                          <Search />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="usage-ranking-search"
                          name="usage-ranking-search"
                          aria-label="搜索排行榜"
                          placeholder={
                            kind === "nodes"
                              ? "搜索节点名称"
                              : admin
                                ? "搜索用户邮箱"
                                : "搜索脱敏后的邮箱"
                          }
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </InputGroup>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <span className="flex items-center gap-1.5">
                                <Trophy className="size-4" />
                                名次
                              </span>
                            </TableHead>
                            <TableHead>
                              <span className="flex items-center gap-1.5">
                                <category.icon className="size-4" />
                                {kind === "nodes"
                                  ? "节点"
                                  : admin
                                    ? "用户"
                                    : "用户（邮箱脱敏）"}
                              </span>
                            </TableHead>
                            <TableHead className="text-right">
                              {kind === "devices" ? "设备 / IP 数" : "总流量"}
                            </TableHead>
                            <TableHead>
                              {kind === "devices" ? "识别方式" : "上传 / 下载"}
                            </TableHead>
                            <TableHead className="min-w-32">榜单占比</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shown.map((row) => (
                            <RankRow
                              key={row.id}
                              row={row}
                              kind={kind}
                              total={total}
                              admin={admin}
                            />
                          ))}
                        </TableBody>
                      </Table>
                      {!shown.length && (
                        <UsageEmpty
                          title={
                            loading ? "正在加载排行榜" : "没有匹配的排行记录"
                          }
                          description={
                            loading
                              ? "正在查询当前榜单，旧类别数据不会混入。"
                              : "尝试其他关键词或日期范围。"
                          }
                        />
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          显示 {shown.length} 项，共 {filtered.length} 项匹配
                        </span>
                        <span className="flex items-center gap-1">
                          <Info className="size-3" />
                          统计于{" "}
                          {formatTime(
                            usagePreviewEnabled
                              ? data.sampledAt
                              : (remote?.sampledAt ?? now),
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </div>
          </TabsPrimitive.Root>
        </>
      )}
    </div>
  );
}

function RankRow({
  row,
  kind,
  total,
  admin,
}: {
  row: RankEntry;
  kind: Kind;
  total: number;
  admin: boolean;
}) {
  const share = total > 0 ? (row.value / total) * 100 : 0;
  const Icon =
    kind === "nodes" ? Network : kind === "devices" ? MonitorSmartphone : Users;
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          {row.rank <= 3 ? (
            <Medal className="size-4" aria-label={"前" + row.rank + "名"} />
          ) : (
            <span className="size-4" />
          )}
          <span className="font-mono font-semibold tabular-nums">
            #{row.rank}
          </span>
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{row.label}</span>
          {!admin && row.isSelf && <Badge variant="outline">我</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono font-semibold tabular-nums">
        {kind === "devices" ? row.value + " 个" : formatGiB(row.value)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 text-xs">
          {kind === "devices" ? (
            <>
              <span className="flex items-center gap-1">
                <Fingerprint className="size-3" />
                设备 ID：未采集
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="size-3" />
                IP 回退：{row.ipFallback}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <ArrowUp className="size-3" />
                {formatGiB(row.upload)}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <ArrowDown className="size-3" />
                {formatGiB(row.download)}
              </span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress
            value={share}
            className="h-1.5 w-20"
            aria-label={row.label + "占比"}
          />
          <span className="font-mono text-xs">{share.toFixed(1)}%</span>
        </div>
      </TableCell>
    </TableRow>
  );
}
