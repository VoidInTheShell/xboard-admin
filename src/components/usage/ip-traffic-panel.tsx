import { useMemo, useState, type ReactNode } from "react";
import { useIpQuery } from "@/hooks/use-ip-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Globe2,
  Info,
  Network,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  DateRangeSelect,
  HistoryCard,
  UsageEmpty,
  UsageSelect,
} from "@/components/usage/usage-charts";
import {
  formatGiB,
  formatTime,
  inRange,
  rangeBounds,
  usagePreviewEnabled,
  type UsageRange,
} from "@/lib/usage-data";
import {
  ipTimeSeries,
  makeIpPreview,
  summarizeIps,
  type IpGrouping,
  type IpRow,
  type IpSample,
} from "@/lib/ip-traffic-data";

const chartConfig = {
  download: { label: "下载", color: "var(--chart-1)" },
  upload: { label: "上传", color: "var(--chart-3)" },
};
const columnOptions = [
  ["user", "用户"],
  ["ip", "源 IP"],
  ["node", "节点"],
  ["upload", "上传"],
  ["download", "下载"],
  ["total", "总流量"],
  ["share", "流量占比"],
  ["first", "范围内首次出现"],
  ["last", "范围内最近出现"],
  ["coverage", "采集情况"],
] as const;
type Column = (typeof columnOptions)[number][0];
type SortKey = "total" | "upload" | "download" | "last";
function Amount({
  row,
  field,
}: {
  row: IpRow;
  field: "total" | "upload" | "download";
}) {
  return (
    <span className="font-mono tabular-nums">
      {row.measured ? formatGiB(row[field]) : "—"}
    </span>
  );
}
function IpTrend({
  samples,
  range,
  now,
}: {
  samples: IpSample[];
  range: UsageRange;
  now: number;
}) {
  const series = useMemo(
    () => ipTimeSeries(samples, range, now),
    [samples, range, now],
  );
  if (!samples.length)
    return (
      <UsageEmpty
        title="当前范围没有 IP 流量记录"
        description="调整日期或清除筛选后重试。"
      />
    );
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto">
      <AreaChart
        accessibilityLayer
        data={series}
        margin={{ left: 0, right: 12, top: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={34}
          tickFormatter={(v: string) => v.replace(/^\d{4}-/, "")}
        />
        <YAxis
          width={88}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatGiB(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v, name) => (
                <span>
                  {name === "upload" ? "上传" : "下载"}：{formatGiB(Number(v))}
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="download"
          type="monotone"
          stackId="flow"
          stroke="var(--color-download)"
          fill="var(--color-download)"
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          dataKey="upload"
          type="monotone"
          stackId="flow"
          stroke="var(--color-upload)"
          strokeDasharray="4 3"
          fill="var(--color-upload)"
          fillOpacity={0.2}
          connectNulls={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
function IpBars({
  rows,
  selfOnly,
  nodes = false,
}: {
  rows: IpRow[];
  selfOnly: boolean;
  nodes?: boolean;
}) {
  const data = rows
    .filter((r) => r.measured)
    .slice(0, 6)
    .map((r) => ({
      ...r,
      label: nodes
        ? r.nodes[0]
        : (selfOnly ? "" : "U" + r.userId + " · ") + r.ip,
      description: nodes ? r.nodes[0] : r.ip + (selfOnly ? "" : " · " + r.user),
    }));
  if (!data.length)
    return (
      <UsageEmpty
        title="暂无已采集流量"
        description="未知流量不计入排名，也不作为零流量展示。"
      />
    );
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto">
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={data}
        margin={{ left: 0, right: 14, top: 6 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          minTickGap={24}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatGiB(v)}
        />
        <YAxis
          type="category"
          dataKey="description"
          width={142}
          tickLine={false}
          axisLine={false}
          tickFormatter={(_v: string, i: number) =>
            data[i]?.label.length > 23
              ? data[i].label.slice(0, 20) + "…"
              : (data[i]?.label ?? "")
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v, name) => (
                <span>
                  {name === "upload" ? "上传" : "下载"}：{formatGiB(Number(v))}
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="download"
          stackId="flow"
          fill="var(--color-download)"
          radius={[0, 0, 0, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
        <Bar
          dataKey="upload"
          stackId="flow"
          fill="var(--color-upload)"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
function Stat({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardDescription>{title}</CardDescription>
        {icon}
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-4">
        <p className="text-xl font-semibold font-mono tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
export function IpTrafficPanel({
  selfOnly = false,
  userId = "all",
  nodeId = "all",
  serverId = "all",
  now,
  range,
  onRangeChange,
}: {
  selfOnly?: boolean;
  userId?: string;
  nodeId?: string;
  serverId?: string;
  now: number;
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
}) {
  const [anchor] = useState(now);
  const samples = useMemo(
    () => (usagePreviewEnabled ? makeIpPreview(anchor, selfOnly) : []),
    [anchor, selfOnly],
  );
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [grouping, setGrouping] = useState<IpGrouping>("connection");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "total",
    desc: true,
  });
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState<Column[]>(
    selfOnly
      ? [
          "ip",
          "node",
          "upload",
          "download",
          "total",
          "share",
          "last",
          "coverage",
        ]
      : [
          "user",
          "ip",
          "node",
          "upload",
          "download",
          "total",
          "share",
          "last",
          "coverage",
        ],
  );
  const [selection, setSelection] = useState<IpRow | null>(null);
  const [detailRange, setDetailRange] = useState(range);
  const [from, to] = rangeBounds(range, now);
  const live = useIpQuery({
    from: Math.floor(from / 1000),
    to: Math.floor(to / 1000),
    user_id: selfOnly || userId === "all" ? undefined : userId,
    node_id: nodeId === "all" ? undefined : nodeId,
    machine_id: selfOnly || serverId === "all" ? undefined : serverId,
    search: search.trim() || undefined,
    family,
    coverage,
    grouping,
    sort: sort.key,
    desc: sort.desc ? 1 : 0,
    page,
  });
  const [detailFrom, detailTo] = rangeBounds(detailRange, now);
  const detail = useIpQuery(
    {
      from: Math.floor(detailFrom / 1000),
      to: Math.floor(detailTo / 1000),
      user_id: selection?.userId,
      ip: selection?.ip,
      detail: 1,
    },
    Boolean(selection),
  );
  const scoped = useMemo(
    () =>
      samples.filter(
        (s) =>
          (selfOnly
            ? s.userId === "1"
            : userId === "all" || s.userId === userId) &&
          (nodeId === "all" || s.nodeId === nodeId) &&
          (serverId === "all" || s.serverId === serverId) &&
          (family === "all" || (s.ip.includes(":") ? "v6" : "v4") === family) &&
          (!search ||
            [s.ip, s.user, s.node].some((value) =>
              value.toLowerCase().includes(search.trim().toLowerCase()),
            )),
      ),
    [samples, selfOnly, userId, nodeId, serverId, family, search],
  );
  const ranged = useMemo(
    () => scoped.filter((s) => inRange(s.at, range, now)),
    [scoped, range, now],
  );
  const allRows = useMemo(
    () => summarizeIps(ranged, grouping),
    [ranged, grouping],
  );
  const eligible = new Set(
    allRows
      .filter(
        (r) =>
          coverage === "all" ||
          (coverage === "partial" ? r.missing > 0 : r.missing === 0),
      )
      .map((r) => r.key),
  );
  const filtered = ranged.filter((s) =>
    eligible.has(
      JSON.stringify([
        s.userId,
        s.ip,
        grouping === "connection" ? s.nodeId : "",
      ]),
    ),
  );
  const previewRows = allRows
    .filter((r) => eligible.has(r.key))
    .sort(
      (a, b) =>
        (sort.desc ? -1 : 1) * (a[sort.key] - b[sort.key]) ||
        a.key.localeCompare(b.key),
    );
  const rows = usagePreviewEnabled ? previewRows : (live.data?.rows ?? []);
  const sources = usagePreviewEnabled
    ? summarizeIps(filtered, "source")
    : (live.data?.sources ?? []);
  const total = usagePreviewEnabled
    ? sources.reduce((sum, r) => sum + r.total, 0)
    : (live.data?.summary.total ?? 0);
  const missing = usagePreviewEnabled
    ? filtered.filter((s) => s.upload === null || s.download === null).length
    : (live.data?.summary.missing ?? 0);
  const measured = usagePreviewEnabled
    ? filtered.length - missing
    : (live.data?.summary.measured ?? 0);
  const totalRows = usagePreviewEnabled
    ? rows.length
    : (live.data?.total_rows ?? 0);
  const completeSamples = usagePreviewEnabled
    ? measured
    : (live.data?.summary.completeSamples ?? 0);
  const totalSamples = usagePreviewEnabled
    ? measured + missing
    : (live.data?.summary.totalSamples ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalRows / 10));
  const currentPage = usagePreviewEnabled
    ? Math.min(page, pageCount)
    : (live.data?.page ?? 1);
  const visibleRows = usagePreviewEnabled
    ? rows.slice((currentPage - 1) * 10, currentPage * 10)
    : rows;
  const visibleColumns = columnOptions.filter(
    ([key]) => columns.includes(key) && (!selfOnly || key !== "user"),
  );
  const detailSamples = !usagePreviewEnabled
    ? (detail.data?.trend ?? [])
    : selection
      ? samples.filter(
          (s) =>
            s.userId === selection.userId &&
            s.ip === selection.ip &&
            inRange(s.at, detailRange, now),
        )
      : [];
  const detailRows = usagePreviewEnabled
    ? summarizeIps(detailSamples, "connection")
    : (detail.data?.rows ?? []);
  const dailyRows = ipTimeSeries(detailSamples, detailRange, now);
  const historyProps = { range, onRangeChange };
  const changeSort = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }));
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="IP 流量统计">
      {!usagePreviewEnabled && live.data?.collection_complete === false && (
        <Alert>
          <Info />
          <AlertTitle>来源采集不完整</AlertTitle>
          <AlertDescription>
            所选节点曾达到来源跟踪上限，当前只展示已采集的部分，不代表全部 IP
            或完整流量。
          </AlertDescription>
        </Alert>
      )}
      {live.error && (
        <Alert variant="destructive">
          <Info />
          <AlertTitle>IP 流量暂不可用</AlertTitle>
          <AlertDescription>{live.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">IP 流量统计</h2>
          <p className="text-sm text-muted-foreground">
            {selfOnly
              ? "查看自己的历史连接来源，以及每个 IP 在各节点上的流量。上方节点筛选同步生效。"
              : "定位哪个用户，通过哪个源 IP，在什么节点消耗了流量。上方用户、服务器与节点筛选同步生效。"}
          </p>
        </div>
        <Badge variant="outline">
          {usagePreviewEnabled
            ? "前端演示 · 未接入采集"
            : live.error
              ? "查询失败"
              : live.data
                ? "实际采集 · 每 30 秒刷新"
                : "正在加载"}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          title="已归属 IP 的流量"
          value={measured ? formatGiB(total) : "—"}
          hint="原始上传 + 下载，不含倍率与网卡流量"
          icon={<ArrowUpDown className="size-4 text-muted-foreground" />}
        />
        <Stat
          title="历史源 IP"
          value={
            usagePreviewEnabled
              ? new Set(filtered.map((s) => s.ip)).size + " 个"
              : live.data
                ? live.data.summary.ips + " 个"
                : "—"
          }
          hint={
            (usagePreviewEnabled
              ? sources.length
              : (live.data?.summary.sources ?? 0)) +
            " 组用户 / IP，含已离线来源"
          }
          icon={<Globe2 className="size-4 text-muted-foreground" />}
        />
        <Stat
          title={selfOnly ? "涉及节点" : "涉及用户 / 节点"}
          value={
            !usagePreviewEnabled
              ? live.data
                ? selfOnly
                  ? live.data.summary.nodes + " 个"
                  : live.data.summary.users + " / " + live.data.summary.nodes
                : "—"
              : selfOnly
                ? new Set(filtered.map((s) => s.nodeId)).size + " 个"
                : new Set(filtered.map((s) => s.userId)).size +
                  " / " +
                  new Set(filtered.map((s) => s.nodeId)).size
          }
          hint="同一用户 / IP 可连接多个节点"
          icon={<Users className="size-4 text-muted-foreground" />}
        />
        <Stat
          title="样本采集完整率"
          value={
            totalSamples
              ? ((completeSamples / totalSamples) * 100).toFixed(1) + "%"
              : "—"
          }
          hint={
            missing
              ? missing + " 条采样不完整；仅汇总已知字节"
              : "按当前筛选内有流量计数的样本计算"
          }
          icon={<Network className="size-4 text-muted-foreground" />}
        />
      </div>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[1.35fr_1fr]">
        <HistoryCard
          title="IP 流量趋势"
          description="上传 / 下载 · UTC+8；近24小时按小时，其他范围按天。"
          {...historyProps}
        >
          <IpTrend
            samples={usagePreviewEnabled ? filtered : (live.data?.trend ?? [])}
            range={range}
            now={now}
          />
        </HistoryCard>
        <HistoryCard
          title="高用量 IP · TOP 6"
          description={
            selfOnly
              ? "同一 IP 跨节点汇总，按已知总流量排序。"
              : "按用户 / IP 跨节点汇总；相同 IP 的不同用户独立排序。"
          }
          {...historyProps}
        >
          <IpBars rows={sources} selfOnly={selfOnly} />
        </HistoryCard>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>历史连接 IP 明细</CardTitle>
              <CardDescription>
                {totalRows} 条汇总 · 时间表示所选范围内出现时间，不是连接次数。
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 data-icon="inline-start" />
                  展示列
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>选择展示信息</DropdownMenuLabel>
                  {columnOptions
                    .filter(([key]) => !selfOnly || key !== "user")
                    .map(([key, label]) => (
                      <DropdownMenuCheckboxItem
                        key={key}
                        checked={columns.includes(key)}
                        disabled={key === "ip"}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) =>
                          setColumns((c) =>
                            checked ? [...c, key] : c.filter((k) => k !== key),
                          )
                        }
                      >
                        {label}
                        {key === "ip" ? "（固定）" : ""}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_auto_auto_auto]">
            <Field>
              <FieldLabel htmlFor="ip-traffic-search">搜索来源</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id="ip-traffic-search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={
                    selfOnly ? "源 IP 或节点名称" : "源 IP、用户邮箱或节点名称"
                  }
                />
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel>地址类型</FieldLabel>
              <UsageSelect
                label="IP 地址类型"
                value={family}
                onChange={(v) => {
                  setFamily(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "IPv4 + IPv6" },
                  { value: "v4", label: "仅 IPv4" },
                  { value: "v6", label: "仅 IPv6" },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel>汇总方式</FieldLabel>
              <UsageSelect
                label="IP 汇总方式"
                value={grouping}
                onChange={(v) => {
                  setGrouping(v as IpGrouping);
                  setPage(1);
                }}
                options={[
                  { value: "connection", label: "用户 · IP · 节点" },
                  { value: "source", label: "用户 · IP（跨节点）" },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel>采集情况</FieldLabel>
              <UsageSelect
                label="IP 采集情况"
                value={coverage}
                onChange={(v) => {
                  setCoverage(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "全部记录" },
                  { value: "complete", label: "采集完整" },
                  { value: "partial", label: "存在采集缺口" },
                ]}
              />
            </Field>
          </FieldGroup>
          {(search || family !== "all" || coverage !== "all") && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>图表与表格均已应用来源筛选</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setFamily("all");
                  setCoverage("all");
                  setPage(1);
                }}
              >
                <X data-icon="inline-start" />
                清除来源筛选
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="min-w-0 px-0">
          {!rows.length ? (
            <UsageEmpty
              title="没有匹配的 IP 记录"
              description="尝试清除来源筛选，或扩大日期、用户与节点范围。"
            />
          ) : (
            <Table aria-label="用户源 IP 节点流量明细">
              <TableHeader>
                <TableRow>
                  {visibleColumns.map(([key, label]) => (
                    <TableHead
                      key={key}
                      aria-sort={
                        sort.key === key
                          ? sort.desc
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      {["total", "upload", "download", "last"].includes(key) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => changeSort(key as SortKey)}
                        >
                          {label}
                          {sort.key === key ? (
                            sort.desc ? (
                              <ArrowDown />
                            ) : (
                              <ArrowUp />
                            )
                          ) : (
                            <ArrowUpDown />
                          )}
                        </Button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.key}>
                    {visibleColumns.map(([key]) => (
                      <TableCell key={key}>
                        {key === "user" ? (
                          <span>{row.user}</span>
                        ) : key === "ip" ? (
                          <div className="flex items-center gap-2">
                            <Globe2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="font-mono">{row.ip}</span>
                            <Badge variant="outline">
                              {row.ip.includes(":") ? "v6" : "v4"}
                            </Badge>
                          </div>
                        ) : key === "node" ? (
                          <span title={row.nodes.join(" / ")}>
                            {row.nodes[0]}
                            {row.nodes.length > 1 && (
                              <Badge variant="secondary" className="ml-2">
                                +{row.nodes.length - 1}
                              </Badge>
                            )}
                          </span>
                        ) : key === "upload" ||
                          key === "download" ||
                          key === "total" ? (
                          <Amount row={row} field={key} />
                        ) : key === "share" ? (
                          <span className="font-mono">
                            {total > 0 && row.measured
                              ? ((row.total / total) * 100).toFixed(1) + "%"
                              : "—"}
                          </span>
                        ) : key === "first" || key === "last" ? (
                          <span className="font-mono text-xs">
                            {formatTime(row[key])}
                          </span>
                        ) : (
                          <Badge variant="outline">
                            {!row.measured
                              ? "尚未采集"
                              : row.missing
                                ? "部分已知"
                                : "采集完整"}
                          </Badge>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={
                          "查看 " + row.user + " " + row.ip + " 的 IP 明细"
                        }
                        onClick={() => {
                          setSelection(row);
                          setDetailRange(range);
                        }}
                      >
                        查看
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            占比以当前筛选的已知流量为分母；缺失量不补零、不均摊。
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label="IP 明细上一页"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs font-mono">
              {currentPage} / {pageCount}
            </span>
            <Button
              size="icon"
              variant="outline"
              aria-label="IP 明细下一页"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </CardFooter>
      </Card>
      <Alert>
        <Info />
        <AlertTitle>源 IP 是连接来源，不是设备身份</AlertTitle>
        <AlertDescription>
          同一出口可能由多个设备共享，动态地址也可能属于同一设备。这里只展示归属到用户和节点的代理流量，不包含订阅拉取或
          Web
          访问流量；“部分已知”表示存在未采集样本或采集间隔。断采后可恢复的累计字节按末次活动时间归档，不能还原断采期间的精确时间分布。
        </AlertDescription>
      </Alert>
      <Sheet
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <SheetContent className="w-full gap-0 sm:max-w-3xl">
          <SheetHeader className="shrink-0 border-b p-6 pr-12">
            <SheetTitle className="break-all">
              IP 来源详情 · {selection?.ip}
            </SheetTitle>
            <SheetDescription className="break-all">
              {selection?.user} · 此用户 / IP 的全部节点，不受主页面节点筛选限制
              · UTC+8
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            {detail.error && (
              <Alert variant="destructive">
                <Info />
                <AlertTitle>来源详情暂不可用</AlertTitle>
                <AlertDescription>{detail.error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">
                {usagePreviewEnabled
                  ? "前端演示"
                  : detail.error
                    ? "查询失败"
                    : detail.data
                      ? "实际采集"
                      : "正在加载"}
              </Badge>
              <DateRangeSelect
                value={detailRange}
                onChange={setDetailRange}
                label="IP 详情日期范围"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                title="此来源已知流量"
                value={
                  detailRows.some((r) => r.measured)
                    ? formatGiB(detailRows.reduce((s, r) => s + r.total, 0))
                    : "—"
                }
                hint="仅选中用户，按 IP 跨节点汇总"
                icon={<ArrowUpDown className="size-4" />}
              />
              <Stat
                title="历史连接节点"
                value={detailRows.length + " 个"}
                hint="日期范围内有来源记录的节点"
                icon={<Network className="size-4" />}
              />
            </div>
            <HistoryCard
              title="此 IP 的流量趋势"
              description="仅选中用户 / IP，缺失采样不补零。"
              range={detailRange}
              onRangeChange={setDetailRange}
            >
              <IpTrend samples={detailSamples} range={detailRange} now={now} />
            </HistoryCard>
            <HistoryCard
              title="节点流量分布"
              description="所选 IP 在各节点上的上传与下载。"
              range={detailRange}
              onRangeChange={setDetailRange}
            >
              <IpBars rows={detailRows} selfOnly nodes />
            </HistoryCard>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>节点明细</CardTitle>
                <CardDescription>
                  查看同一来源在不同节点上的流量和出现时间。
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>节点</TableHead>
                      <TableHead>上传</TableHead>
                      <TableHead>下载</TableHead>
                      <TableHead>总流量</TableHead>
                      <TableHead>最近出现</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{row.nodes[0]}</TableCell>
                        <TableCell>
                          <Amount row={row} field="upload" />
                        </TableCell>
                        <TableCell>
                          <Amount row={row} field="download" />
                        </TableCell>
                        <TableCell>
                          <Amount row={row} field="total" />
                        </TableCell>
                        <TableCell>{formatTime(row.last)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>
                  {detailRange.preset === "24h" ? "每小时流量" : "每日流量"}
                </CardTitle>
                <CardDescription>
                  与趋势图一致的明细数据；长日期范围可在上方缩小。
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间（UTC+8）</TableHead>
                      <TableHead>上传</TableHead>
                      <TableHead>下载</TableHead>
                      <TableHead>总流量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyRows.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>
                          {row.upload === null ? "—" : formatGiB(row.upload)}
                        </TableCell>
                        <TableCell>
                          {row.download === null
                            ? "—"
                            : formatGiB(row.download)}
                        </TableCell>
                        <TableCell>
                          {row.upload === null || row.download === null
                            ? "—"
                            : formatGiB(row.upload + row.download)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
