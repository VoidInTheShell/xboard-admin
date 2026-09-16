import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs as TabsPrimitive } from "radix-ui";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Download,
  Monitor,
  Smartphone,
  Router,
  HelpCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Network,
  ChartNoAxesCombined,
  History,
  ListFilter,
} from "lucide-react";
import { toast } from "sonner";
import { onlineHistorySeries } from "@/lib/usage-online-history";
import { useUsageApi } from "@/lib/usage-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AccessHistoryTable } from "@/components/usage/access-history-table";
import { ServerTrafficPanel } from "@/components/usage/server-traffic-panel";
import { CatalogNavigation } from "@/components/control-plane/catalog-navigation";
import { IpTrafficPanel } from "@/components/usage/ip-traffic-panel";
import { Separator } from "@/components/ui/separator";
import {
  DateRangeSelect,
  HistoryCard,
  UsageTimeChart,
  PlatformChart,
  RankingChart,
  UsageSelect,
  UsageEmpty,
} from "@/components/usage/usage-charts";
import {
  defaultRange,
  dateInput,
  formatGiB,
  formatSpeed,
  formatTime,
  inRange,
  makeUsagePreview,
  matchesScope,
  onlineCounts,
  summarizeTraffic,
  trafficSeries,
  usagePreviewEnabled,
  usageNodes as previewNodes,
  rangeBounds,
  type UsageDataset,
  type UsageDevice,
  type UsageEvent,
  type UsageScope,
} from "@/lib/usage-data";

export function UsageMetric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardDescription>{label}</CardDescription>
        <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-4">
        <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
function deviceIcon(kind: UsageDevice["kind"]) {
  return {
    desktop: Monitor,
    phone: Smartphone,
    router: Router,
    unknown: HelpCircle,
  }[kind];
}
function exportCsv(rows: (string | number)[][], filename: string) {
  const csv =
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map(
            (cell) =>
              '"' +
              String(cell)
                .replace(/"/g, '""')
                .replace(/^[=+@-]/, "'$&") +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success("已导出当前筛选结果");
}
export function UsageExplorer({ selfOnly = false }: { selfOnly?: boolean }) {
  const api = useUsageApi();
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [eventTotal, setEventTotal] = useState(0);
  const [remoteEventKey, setRemoteEventKey] = useState("");
  const [remoteEvents, setRemoteEvents] = useState<UsageEvent[]>([]);
  const [params] = useSearchParams();
  const [dataset, setDataset] = useState<UsageDataset>(() =>
    usagePreviewEnabled
      ? makeUsagePreview(selfOnly)
      : { devices: [], traffic: [], events: [], sampledAt: Date.now() },
  );
  const [range, setRange] = useState(() => defaultRange(dataset.sampledAt));
  const [tab, setTab] = useState(
    params.get("view") === "ip" ? "traffic" : "overview",
  );
  const [trafficView, setTrafficView] = useState(
    params.get("view") === "ip" ? "ip" : "account",
  );
  const infrastructureView =
    tab === "traffic" && trafficView === "infrastructure";
  const [userId, setUserId] = useState(
    selfOnly && usagePreviewEnabled ? "1" : "all",
  );
  const [serverId, setServerId] = useState(params.get("server") || "all");
  const [nodeId, setNodeId] = useState(params.get("node") || "all");
  const [search, setSearch] = useState("");
  const [eventKind, setEventKind] = useState("panel");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [riskOnly, setRiskOnly] = useState("all");
  const [rankBy, setRankBy] = useState(selfOnly ? "node" : "user");
  const [refresh, setRefresh] = useState("15");
  const [page, setPage] = useState(1);
  const [selectedDetail, setDetail] = useState<UsageDevice | UsageEvent | null>(
    null,
  );
  const detail =
    selectedDetail && "sampledAt" in selectedDetail
      ? (dataset.devices.find((device) => device.id === selectedDetail.id) ??
        selectedDetail)
      : selectedDetail;
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [showReviewed, setShowReviewed] = useState(false);
  const eventQueryKey = JSON.stringify([
    range,
    userId,
    serverId,
    nodeId,
    eventKind,
    platformFilter,
    riskOnly,
    search,
    page,
  ]);
  const eventsLoading =
    !usagePreviewEnabled && remoteEventKey !== eventQueryKey;
  const matchingEventTotal = eventsLoading ? 0 : eventTotal;
  const usageNodes = usagePreviewEnabled ? previewNodes : (dataset.nodes ?? []);
  const enabled = usagePreviewEnabled || dataset.enabled === true;
  useEffect(() => {
    if (usagePreviewEnabled) return;
    const controller = new AbortController();
    const [from, to] = rangeBounds(range, Date.now());
    api
      .get<UsageDataset>(
        "usage/snapshot",
        {
          from: Math.floor(from / 1000),
          to: Math.floor(to / 1000),
          user_id: userId === "all" ? undefined : userId,
          machine_id: serverId === "all" ? undefined : serverId,
          node_id: nodeId === "all" ? undefined : nodeId,
        },
        controller.signal,
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        setLoadError("");
        setReviewed(data.reviewed ?? []);
        setDataset(
          data.enabled === false
            ? {
                devices: [],
                traffic: [],
                events: [],
                sampledAt: Date.now(),
                enabled: false,
              }
            : data,
        );
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [api, range, userId, serverId, nodeId, revision]);
  useEffect(() => {
    if (usagePreviewEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const [from, to] = rangeBounds(range, Date.now());
      api
        .get<{ data: UsageEvent[]; total: number }>(
          "usage/events",
          {
            from: Math.floor(from / 1000),
            to: Math.floor(to / 1000),
            kind: eventKind,
            user_id: userId === "all" ? undefined : userId,
            machine_id: serverId === "all" ? undefined : serverId,
            node_id: nodeId === "all" ? undefined : nodeId,
            platform: platformFilter === "all" ? undefined : platformFilter,
            result: riskOnly === "all" ? undefined : "失败",
            search,
            page,
            per_page: 12,
          },
          controller.signal,
        )
        .then((data) => {
          if (controller.signal.aborted) return;
          setRemoteEvents(data.data);
          setEventTotal(data.total);
          setRemoteEventKey(eventQueryKey);
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) {
            setLoadError(error.message);
            setRemoteEvents([]);
            setEventTotal(0);
            setRemoteEventKey(eventQueryKey);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    api,
    range,
    userId,
    serverId,
    nodeId,
    eventKind,
    eventQueryKey,
    platformFilter,
    riskOnly,
    search,
    page,
    revision,
  ]);
  function refreshSnapshot() {
    if (!usagePreviewEnabled) {
      setRevision((value) => value + 1);
      return;
    }
    setDataset((previous) => {
      const now = Date.now();
      return {
        ...previous,
        sampledAt: now,
        devices: previous.devices.map((device, i) => ({
          ...device,
          sampledAt:
            device.downloadRate === null ? device.sampledAt : now - 3000,
          downloadRate:
            device.downloadRate === null
              ? null
              : Number(
                  (
                    0.8 +
                    i * 1.17 +
                    Math.abs(Math.sin(now / 14000 + i)) * 1.2
                  ).toFixed(2),
                ),
          uploadRate:
            device.uploadRate === null
              ? null
              : Number(
                  (
                    0.06 +
                    i * 0.083 +
                    Math.abs(Math.cos(now / 14000 + i)) * 0.08
                  ).toFixed(2),
                ),
        })),
      };
    });
  }
  useEffect(() => {
    if (refresh === "off") return;
    const timer = window.setInterval(
      () => {
        if (!document.hidden) refreshSnapshot();
      },
      Number(refresh) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [refresh]);
  const historicalScope: UsageScope = {
    userId: userId === "all" ? undefined : userId,
    serverId: serverId === "all" ? undefined : serverId,
    nodeId: nodeId === "all" ? undefined : nodeId,
  };
  const scope = historicalScope;
  const userOptions = [
    ...new Map([
      ...dataset.devices.map(
        (device) => [device.userId, device.user] as [string, string],
      ),
      ...(dataset.users ?? []).map(
        (user) => [String(user.id), user.email] as [string, string],
      ),
    ]).entries(),
  ].map(([value, label]) => ({ value, label }));
  const devices = dataset.devices.filter((device) =>
    matchesScope(device, scope),
  );
  const traffic = useMemo(
    () =>
      dataset.traffic.filter(
        (item) =>
          matchesScope(item, {
            userId: userId === "all" ? undefined : userId,
            serverId: serverId === "all" ? undefined : serverId,
            nodeId: nodeId === "all" ? undefined : nodeId,
          }) &&
          (!usagePreviewEnabled || inRange(item.at, range, dataset.sampledAt)),
      ),
    [dataset, range, userId, serverId, nodeId],
  );
  const series = useMemo(() => {
    const result = trafficSeries(traffic, range, dataset.sampledAt);
    if (!usagePreviewEnabled) {
      const hourly =
        rangeBounds(range, dataset.sampledAt)[1] -
          rangeBounds(range, dataset.sampledAt)[0] <=
        86400000;
      const history = new Map<string, { users: number; devices: number }>();
      for (const row of dataset.onlineHistory ?? []) {
        const date = hourly
          ? new Date(row.bucket * 1000).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              hour12: false,
            }) + ":00"
          : dateInput(row.bucket * 1000);
        const old = history.get(date);
        history.set(date, {
          users: Math.max(old?.users ?? 0, Number(row.users)),
          devices: Math.max(old?.devices ?? 0, Number(row.devices)),
        });
      }
      for (const row of result) {
        row.users = history.get(row.date)?.users ?? 0;
        row.devices = history.get(row.date)?.devices ?? 0;
      }
      for (const [date, counts] of history) {
        if (!result.some((row) => row.date === date))
          result.push({ date, upload: 0, download: 0, billed: 0, ...counts });
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
    }
    return result;
  }, [traffic, range, dataset.sampledAt, dataset.onlineHistory]);
  const daily = useMemo(
    () => trafficSeries(traffic, { ...range, preset: "1m" }, dataset.sampledAt),
    [traffic, range, dataset.sampledAt],
  );
  const totals = summarizeTraffic(traffic);
  const counts = onlineCounts(devices, dataset.sampledAt);
  const freshDevices = devices.filter(
    (d) => dataset.sampledAt - d.sampledAt <= 120000,
  );
  const events = dataset.events.filter(
    (event) =>
      (userId === "all" || event.userId === userId) &&
      inRange(event.at, range, dataset.sampledAt),
  );
  const subscriptions = events.filter((event) => event.kind === "subscription");
  const previewPulls = [
    ...subscriptions
      .reduce((map, event) => {
        const date = dateInput(event.at);
        const item = map.get(date) ?? { date, pulls: 0, failed: 0 };
        if (event.result === "成功") item.pulls++;
        else item.failed++;
        map.set(date, item);
        return map;
      }, new Map<string, { date: string; pulls: number; failed: number }>())
      .values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const pulls = usagePreviewEnabled
    ? previewPulls
    : [
        ...(dataset.subscriptionDays ?? [])
          .reduce((map, row) => {
            const date = dateInput(row.day * 1000);
            const item = map.get(date) ?? { date, pulls: 0, failed: 0 };
            if (row.result === "成功") item.pulls += Number(row.count);
            else item.failed += Number(row.count);
            map.set(date, item);
            return map;
          }, new Map<string, { date: string; pulls: number; failed: number }>())
          .values(),
      ].sort((a, b) => a.date.localeCompare(b.date));
  const previewPlatforms = [
    ...subscriptions
      .reduce(
        (map, event) =>
          map.set(event.platform, (map.get(event.platform) ?? 0) + 1),
        new Map<string, number>(),
      )
      .entries(),
  ].map(([name, value]) => ({ name, value }));
  const platforms = usagePreviewEnabled
    ? previewPlatforms
    : (dataset.subscriptionPlatforms ?? []).map((row) => ({
        name: row.platform,
        value: Number(row.count),
      }));
  const previewRanks = [
    ...traffic
      .reduce((map, item) => {
        const device = dataset.devices.find((d) => d.id === item.deviceId);
        const name =
          rankBy === "user"
            ? (device?.user ??
              dataset.users?.find((u) => String(u.id) === item.userId)?.email ??
              item.userId)
            : rankBy === "server"
              ? (device?.server ?? item.serverId)
              : (device?.node ??
                usageNodes.find((n) => n.id === item.nodeId)?.name ??
                item.nodeId);
        map.set(name, (map.get(name) ?? 0) + item.upload + item.download);
        return map;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const ranks = usagePreviewEnabled
    ? previewRanks
    : (dataset.ranks?.[rankBy] ?? []);
  const needle = search.trim().toLowerCase();
  const visibleDevices = devices.filter(
    (device) =>
      [device.user, device.platform, device.ip, device.client, device.node]
        .join(" ")
        .toLowerCase()
        .includes(needle) &&
      (riskOnly === "all" || Boolean(device.risk)),
  );
  const visibleEvents = events.filter(
    (event) =>
      event.kind === eventKind &&
      (platformFilter === "all" || event.platform === platformFilter) &&
      [
        event.user,
        event.platform,
        event.ip,
        event.client,
        event.node ?? "",
        event.path ?? "",
        event.action ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle) &&
      (riskOnly === "all" ||
        Boolean(event.risk) ||
        event.result.includes("失败")),
  );
  const pageSize = 12;
  const pageCount = Math.max(
    1,
    Math.ceil(
      (usagePreviewEnabled ? visibleEvents.length : matchingEventTotal) /
        pageSize,
    ),
  );
  const currentPage = Math.min(page, pageCount);
  const eventPage = usagePreviewEnabled
    ? visibleEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : eventsLoading
      ? []
      : remoteEvents.filter((event) => event.kind === eventKind);
  const riskEvents = events.filter(
    (event) =>
      (event.risk || event.result.includes("失败")) &&
      ((serverId === "all" && nodeId === "all") ||
        (event.kind === "connection" && matchesScope(event, scope))),
  );
  const risks = [
    ...new Map(
      riskEvents.map((event) => [
        usagePreviewEnabled
          ? event.userId + (event.risk || event.result)
          : event.id,
        event,
      ]),
    ).values(),
  ];
  const displayedRisks = risks.filter(
    (event) =>
      showReviewed ||
      !reviewed.includes(
        usagePreviewEnabled
          ? event.userId + (event.risk || event.result)
          : event.id,
      ),
  );
  const staleCount = devices.length - freshDevices.length;
  const historyProps = { range, onRangeChange: setRange };
  const detailDevice = detail
    ? dataset.devices.find(
        (d) => d.id === ("sampledAt" in detail ? detail.id : detail.deviceId),
      )
    : undefined;
  const detailHistory = detailDevice
    ? trafficSeries(
        dataset.traffic.filter(
          (item) =>
            item.deviceId === detailDevice.id &&
            inRange(item.at, range, dataset.sampledAt),
        ),
        range,
        dataset.sampledAt,
      )
    : [];
  const connectionEvents = events.filter(
    (event) => event.kind === "connection",
  );
  function resetFilters() {
    setUserId(selfOnly && usagePreviewEnabled ? "1" : "all");
    setServerId("all");
    setNodeId("all");
    setSearch("");
    setRiskOnly("all");
    setPlatformFilter("all");
    setPage(1);
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">使用记录</h1>
            {usagePreviewEnabled && <Badge variant="outline">演示数据</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {selfOnly
              ? "查看我的流量、在线设备与账号访问记录。"
              : "查看用户、节点与服务器的流量和连接情况。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UsageSelect
            label="实时刷新频率"
            value={refresh}
            onChange={setRefresh}
            options={[
              { value: "15", label: "每15秒刷新" },
              { value: "30", label: "每30秒刷新" },
              { value: "off", label: "暂停刷新" },
            ]}
          />
          <Button
            variant="outline"
            onClick={refreshSnapshot}
            disabled={!enabled && !loadError}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
        </div>
      </div>
      {!enabled || loadError ? (
        <Card>
          <CardContent>
            <UsageEmpty
              title={
                loadError
                  ? "使用记录加载失败"
                  : dataset.enabled === false
                    ? "使用记录尚未启用"
                    : "正在加载使用记录"
              }
              description={
                loadError ||
                (dataset.enabled === false
                  ? "启用使用记录采集后，可在这里查看流量、设备与访问历史。"
                  : "正在读取实际采集数据，请稍候。")
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!selfOnly && !infrastructureView && (
                <UsageSelect
                  label="筛选用户"
                  value={userId}
                  onChange={(value) => {
                    setUserId(value);
                    setPage(1);
                  }}
                  options={[
                    { value: "all", label: "所有用户" },
                    ...userOptions,
                  ]}
                />
              )}
              {tab !== "access" && !selfOnly && (
                <UsageSelect
                  label="筛选服务器"
                  value={serverId}
                  onChange={(value) => {
                    setServerId(value);
                    setNodeId("all");
                  }}
                  options={[
                    { value: "all", label: "所有服务器" },
                    ...[
                      ...new Map(
                        usageNodes.map((node) => [node.serverId, node.server]),
                      ).entries(),
                    ].map(([value, label]) => ({ value, label })),
                  ]}
                />
              )}
              {tab !== "access" && !infrastructureView && (
                <UsageSelect
                  label="筛选节点"
                  value={nodeId}
                  onChange={setNodeId}
                  options={[
                    { value: "all", label: "所有节点" },
                    ...usageNodes
                      .filter(
                        (node) =>
                          serverId === "all" || node.serverId === serverId,
                      )
                      .map((node) => ({ value: node.id, label: node.name })),
                  ]}
                />
              )}
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                清除筛选
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              采样于{" "}
              {new Date(dataset.sampledAt).toLocaleTimeString("zh-CN", {
                hour12: false,
              })}{" "}
              · UTC+8
            </span>
          </div>
          {!(tab === "traffic" && trafficView === "ip") && (
            <section
              aria-label="使用摘要"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <UsageMetric
                label={selfOnly ? "在线设备" : "在线用户 / 设备"}
                value={
                  selfOnly
                    ? counts.devices + " 台"
                    : counts.users + " / " + counts.devices
                }
                hint={
                  counts.ips +
                  " 个独立 IP" +
                  (staleCount
                    ? " · " + staleCount + " 条采集延迟"
                    : " · 最近2分钟活跃")
                }
                icon={<Users />}
              />
              <UsageMetric
                label={selfOnly ? "当前下载 / 上传" : "用户代理下载 / 上传"}
                value={
                  <span className="text-xl">
                    {formatSpeed(freshDevices.some((d) => d.downloadRate !== null) ? freshDevices.reduce((sum, d) => sum + (d.downloadRate ?? 0), 0) : null)}{" "}
                    /{" "}
                    {formatSpeed(freshDevices.some((d) => d.uploadRate !== null) ? freshDevices.reduce((sum, d) => sum + (d.uploadRate ?? 0), 0) : null)}
                  </span>
                }
                hint="最近有效采样"
                icon={<Activity />}
              />
              <UsageMetric
                label={selfOnly ? "所选范围原始流量" : "用户代理原始流量"}
                value={formatGiB(totals.upload + totals.download)}
                hint={"计费流量 " + formatGiB(totals.billed)}
                icon={<Download />}
              />
              <UsageMetric
                label="待核查信号"
                value={displayedRisks.length}
                hint="新来源、访问失败等异常记录"
                icon={<ShieldAlert />}
              />
            </section>
          )}
          <TabsPrimitive.Root
            value={tab}
            orientation="vertical"
            onValueChange={(value) => {
              setTab(value);
              if (value === "access") {
                setServerId("all");
                setNodeId("all");
              }
              setSearch("");
              setRiskOnly("all");
              setPlatformFilter("all");
              setPage(1);
            }}
            className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 overflow-visible lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-6"
          >
            <CatalogNavigation
              label="使用记录"
              items={[
                {
                  id: "overview",
                  title: "用量概览",
                  icon: ChartNoAxesCombined,
                },
                { id: "devices", title: "在线设备", icon: Monitor },
                { id: "traffic", title: "流量明细", icon: ListFilter },
                { id: "access", title: "访问记录", icon: History },
                { id: "risks", title: "安全观察", icon: ShieldAlert },
              ]}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {
                    {
                      overview: "用量概览",
                      devices: "在线设备",
                      traffic: "流量明细",
                      access: "访问记录",
                      risks: "安全观察",
                    }[tab]
                  }
                </h2>
                <DateRangeSelect value={range} onChange={setRange} />
              </div>
              {range.preset === "custom" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {range.from} 至 {range.to} · UTC+8
                </p>
              )}
              <TabsContent
                value="overview"
                className="mt-4 flex flex-col gap-4"
              >
                <div className="grid min-w-0 gap-4 xl:grid-cols-[1.5fr_1fr]">
                  <HistoryCard
                    title="流量趋势"
                    description="用户 / 节点原始上传与下载；网卡及实例统计见流量明细"
                    {...historyProps}
                  >
                    <UsageTimeChart data={series} />
                  </HistoryCard>
                  <HistoryCard
                    title="在线变化"
                    description="每个时间段内的同时在线峰值"
                    {...historyProps}
                  >
                    <UsageTimeChart
                      data={
                        usagePreviewEnabled
                          ? series
                          : onlineHistorySeries(
                              dataset.onlineHistory ?? [],
                              range,
                              dataset.sampledAt,
                            )
                      }
                      kind="online"
                      unit="个"
                    />
                  </HistoryCard>
                  <HistoryCard
                    title="每日流量"
                    description="按自然日汇总上传与下载"
                    {...historyProps}
                  >
                    <UsageTimeChart data={daily} kind="bar" />
                  </HistoryCard>
                  <HistoryCard
                    title="流量分布"
                    description="当前筛选范围内的原始流量"
                    {...historyProps}
                  >
                    <div className="mb-3">
                      <UsageSelect
                        label="流量排名维度"
                        value={rankBy}
                        onChange={setRankBy}
                        options={
                          selfOnly
                            ? [{ value: "node", label: "按节点" }]
                            : [
                                { value: "user", label: "按用户" },
                                { value: "server", label: "按服务器" },
                                { value: "node", label: "按节点" },
                              ]
                        }
                      />
                    </div>
                    <RankingChart data={ranks} />
                  </HistoryCard>
                </div>
              </TabsContent>
              <TabsContent value="devices" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>在线设备与来源</CardTitle>
                    <CardDescription>
                      最近2分钟有活动记录；设备类型以识别来源为准。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <InputGroup className="w-full sm:max-w-sm">
                        <InputGroupAddon>
                          <Search />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="usage-device-search"
                          name="usage-device-search"
                          aria-label="搜索在线设备"
                          placeholder={
                            selfOnly
                              ? "搜索 IP、设备或节点"
                              : "搜索用户、IP、设备或节点"
                          }
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </InputGroup>
                      <UsageSelect
                        label="设备风险筛选"
                        value={riskOnly}
                        onChange={setRiskOnly}
                        options={[
                          { value: "all", label: "全部设备" },
                          { value: "risk", label: "需关注设备" },
                        ]}
                      />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {!selfOnly && <TableHead>用户</TableHead>}
                          <TableHead>设备 / 平台</TableHead>
                          <TableHead>在线 IP</TableHead>
                          <TableHead>节点</TableHead>
                          <TableHead>下载 / 上传</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleDevices.map((device) => {
                          const Icon = deviceIcon(device.kind);
                          const stale =
                            dataset.sampledAt - device.sampledAt > 120000;
                          return (
                            <TableRow key={device.id}>
                              {!selfOnly && (
                                <TableCell>{device.user}</TableCell>
                              )}
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Icon className="size-4 text-muted-foreground" />
                                  <div>
                                    {device.platform}
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {device.client}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-mono text-xs">
                                  {device.ip}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {device.location}
                                </div>
                              </TableCell>
                              <TableCell>
                                {device.node}
                                {!selfOnly && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {device.server}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 font-mono text-xs">
                                  <ArrowDown className="size-3" />
                                  {formatSpeed(
                                    stale ? null : device.downloadRate,
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                  <ArrowUp className="size-3" />
                                  {formatSpeed(
                                    stale ? null : device.uploadRate,
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    stale || device.risk
                                      ? "outline"
                                      : "secondary"
                                  }
                                >
                                  {stale ? "采集延迟" : device.risk || "在线"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDetail(device)}
                                >
                                  详情
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {!visibleDevices.length && <UsageEmpty />}
                    <p className="text-xs text-muted-foreground">
                      {counts.devices} 台已识别设备 · {counts.ips} 个独立 IP ·{" "}
                      {counts.unknown} 个未识别来源 · {staleCount}{" "}
                      条过期采样。共享出口 IP 可能对应多台设备。
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="traffic" className="mt-4 flex flex-col gap-4">
                <Tabs
                  value={trafficView}
                  onValueChange={(value) => {
                    setTrafficView(value);
                    if (value === "infrastructure") {
                      setUserId("all");
                      setNodeId("all");
                    }
                  }}
                  className="min-w-0"
                >
                  <div className="max-w-full overflow-x-auto overflow-y-hidden pb-px">
                    <TabsList
                      variant="line"
                      className="w-max group-data-[orientation=horizontal]/tabs:h-auto"
                    >
                      <TabsTrigger value="account">用户 / 节点用量</TabsTrigger>
                      <TabsTrigger value="ip">IP 统计</TabsTrigger>
                      <TabsTrigger value="infrastructure">
                        服务器网卡 / 代理实例
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="ip" className="mt-4 min-w-0">
                    <IpTrafficPanel
                      key={[userId, serverId, nodeId].join(":")}
                      userId={userId}
                      serverId={serverId}
                      nodeId={nodeId}
                      now={dataset.sampledAt}
                      range={range}
                      onRangeChange={setRange}
                    />
                  </TabsContent>
                  <TabsContent value="infrastructure" className="mt-4">
                    <ServerTrafficPanel
                      key={serverId}
                      serverId={serverId}
                      now={dataset.sampledAt}
                      range={range}
                      onRangeChange={setRange}
                    />
                  </TabsContent>
                  <TabsContent
                    value="account"
                    className="mt-4 flex flex-col gap-4"
                  >
                    <HistoryCard
                      title="每日流量"
                      description="原始流量按上传、下载拆分；计费流量包含节点倍率。"
                      {...historyProps}
                    >
                      <UsageTimeChart data={daily} kind="bar" />
                    </HistoryCard>
                    <Card>
                      <CardHeader className="flex flex-wrap items-center justify-between gap-3 sm:flex-row">
                        <div className="flex flex-col gap-1">
                          <CardTitle>每日账目</CardTitle>
                          <CardDescription>
                            日期以 UTC+8 为准，1 GiB = 1024³ 字节。
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            exportCsv(
                              [
                                [
                                  "日期",
                                  "上传 GiB",
                                  "下载 GiB",
                                  "原始总计 GiB",
                                  "计费 GiB",
                                ],
                                ...daily.map((item) => [
                                  item.date,
                                  item.upload,
                                  item.download,
                                  item.upload + item.download,
                                  item.billed,
                                ]),
                              ],
                              "usage-daily.csv",
                            )
                          }
                          disabled={!daily.length}
                        >
                          <Download data-icon="inline-start" />
                          导出明细
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>日期</TableHead>
                              <TableHead>上传</TableHead>
                              <TableHead>下载</TableHead>
                              <TableHead>原始合计</TableHead>
                              <TableHead>计费流量</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...daily].reverse().map((item) => (
                              <TableRow key={item.date}>
                                <TableCell className="font-mono">
                                  {item.date}
                                </TableCell>
                                <TableCell>{formatGiB(item.upload)}</TableCell>
                                <TableCell>
                                  {formatGiB(item.download)}
                                </TableCell>
                                <TableCell>
                                  {formatGiB(item.upload + item.download)}
                                </TableCell>
                                <TableCell>{formatGiB(item.billed)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {!daily.length && <UsageEmpty />}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </TabsContent>
              <TabsContent value="access" className="mt-4 flex flex-col gap-4">
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  <HistoryCard
                    title="订阅拉取趋势"
                    description={
                      (usagePreviewEnabled
                        ? subscriptions.length
                        : (dataset.subscriptionStats?.pulls ?? 0)) +
                      " 次拉取 · " +
                      (usagePreviewEnabled
                        ? new Set(subscriptions.map((e) => e.ip)).size
                        : (dataset.subscriptionStats?.ips ?? 0)) +
                      " 个来源 IP"
                    }
                    {...historyProps}
                  >
                    <UsageTimeChart data={pulls} kind="pulls" unit="次" />
                  </HistoryCard>
                  <HistoryCard
                    title="订阅客户端平台"
                    description="根据订阅请求的平台信息归类"
                    {...historyProps}
                  >
                    <PlatformChart data={platforms} />
                  </HistoryCard>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>访问历史</CardTitle>
                    <CardDescription>
                      用户后台每次访问、节点新设备或新 IP
                      首次访问，以及订阅拉取记录。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <UsageSelect
                        label="记录类型"
                        value={eventKind}
                        onChange={(value) => {
                          setEventKind(value);
                          setPage(1);
                        }}
                        options={[
                          { value: "panel", label: "用户后台访问" },
                          { value: "connection", label: "节点首次访问" },
                          { value: "subscription", label: "订阅拉取" },
                        ]}
                      />
                      <InputGroup className="w-full sm:max-w-sm">
                        <InputGroupAddon>
                          <Search />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="usage-access-search"
                          name="usage-access-search"
                          aria-label="搜索访问记录"
                          placeholder="搜索 IP、设备、客户端或页面"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </InputGroup>
                      <UsageSelect
                        label="平台筛选"
                        value={platformFilter}
                        onChange={(value) => {
                          setPlatformFilter(value);
                          setPage(1);
                        }}
                        options={[
                          { value: "all", label: "全部平台" },
                          ...[
                            ...new Set(events.map((event) => event.platform)),
                          ].map((value) => ({ value, label: value })),
                        ]}
                      />
                      <UsageSelect
                        label="访问结果筛选"
                        value={riskOnly}
                        onChange={(value) => {
                          setRiskOnly(value);
                          setPage(1);
                        }}
                        options={[
                          { value: "all", label: "全部结果" },
                          { value: "risk", label: "异常与失败" },
                        ]}
                      />
                    </div>
                    <AccessHistoryTable
                      events={eventPage}
                      selfOnly={selfOnly}
                      kind={eventKind}
                      onDetail={setDetail}
                    />
                    {!eventPage.length && (
                      <UsageEmpty
                        title={eventsLoading ? "正在加载访问记录" : undefined}
                        description={
                          eventsLoading
                            ? "正在查询当前筛选范围，旧筛选结果不会混入。"
                            : undefined
                        }
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        共{" "}
                        {usagePreviewEnabled
                          ? visibleEvents.length
                          : eventTotal}{" "}
                        条 · 第 {currentPage} / {pageCount} 页
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setPage(currentPage - 1)}
                        >
                          上一页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= pageCount}
                          onClick={() => setPage(currentPage + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="risks" className="mt-4 flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <UsageMetric
                    label="新增来源 IP"
                    value={
                      usagePreviewEnabled
                        ? new Set(
                            events
                              .filter((event) => event.risk)
                              .map((event) => event.ip),
                          ).size
                        : (dataset.security?.newIps ?? 0)
                    }
                    hint="所选日期内首次观察到的来源"
                    icon={<Network />}
                  />
                  <UsageMetric
                    label="访问失败"
                    value={
                      usagePreviewEnabled
                        ? events.filter((event) =>
                            event.result.includes("失败"),
                          ).length
                        : (dataset.security?.failed ?? 0)
                    }
                    hint="登录或订阅请求失败"
                    icon={<ShieldAlert />}
                  />
                  <UsageMetric
                    label="连接来源"
                    value={
                      usagePreviewEnabled
                        ? new Set(connectionEvents.map((event) => event.ip))
                            .size
                        : (dataset.security?.connectionIps ?? 0)
                    }
                    hint={
                      (usagePreviewEnabled
                        ? connectionEvents.length
                        : (dataset.security?.connections ?? 0)) +
                      " 条设备 / IP 首访记录"
                    }
                    icon={<Activity />}
                  />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>待核查记录</CardTitle>
                    <CardDescription>
                      来源变化与失败记录只表示需核查，不会自动封禁或判定泄露。
                      {!usagePreviewEnabled &&
                        dataset.security &&
                        ` 展示最近 ${dataset.security.shownSignals} / ${dataset.security.totalSignals} 条；更多记录可在访问历史筛选。`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {displayedRisks.length ? (
                      displayedRisks.map((event) => (
                        <div
                          key={event.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                        >
                          <div className="flex items-start gap-3">
                            <ShieldAlert className="mt-0.5 size-4 text-muted-foreground" />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  {event.risk || event.result}
                                </span>
                                <Badge variant="outline">
                                  {reviewed.includes(
                                    usagePreviewEnabled
                                      ? event.userId +
                                          (event.risk || event.result)
                                      : event.id,
                                  )
                                    ? "已核查"
                                    : "待核查"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {selfOnly ? event.platform : event.user} ·{" "}
                                {event.ip} · {event.location}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatTime(event.at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetail(event)}
                            >
                              查看记录
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const signal = usagePreviewEnabled
                                  ? event.userId + (event.risk || event.result)
                                  : event.id;
                                try {
                                  if (!usagePreviewEnabled)
                                    await api.post("usage/review", { signal });
                                  setReviewed((previous) => [
                                    ...new Set([...previous, signal]),
                                  ]);
                                  toast.success(
                                    usagePreviewEnabled
                                      ? "已在本次预览中标记核查"
                                      : "已保存核查记录",
                                  );
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "保存失败",
                                  );
                                }
                              }}
                            >
                              标记已核查
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <UsageEmpty
                        title="没有待核查记录"
                        description="当前筛选范围内没有尚未核查的异常信号。"
                      />
                    )}
                    {reviewed.length > 0 && (
                      <Button
                        variant="ghost"
                        onClick={() => setShowReviewed((value) => !value)}
                      >
                        {showReviewed ? "隐藏" : "显示"}已核查记录（
                        {reviewed.length}）
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </TabsPrimitive.Root>
          <Sheet
            open={Boolean(detail)}
            onOpenChange={(open) => {
              if (!open) setDetail(null);
            }}
          >
            <SheetContent className="w-full gap-0 sm:max-w-2xl">
              <SheetHeader className="shrink-0 border-b p-6">
                <SheetTitle>
                  {detail && "sampledAt" in detail
                    ? "设备详情"
                    : "访问记录详情"}
                </SheetTitle>
                <SheetDescription>
                  {detail?.platform} · {detail?.ip}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
                {detail && (
                  <>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
                      {[
                        ...(!selfOnly ? [["用户", detail.user]] : []),
                        ["客户端", detail.client],
                        ["来源 IP", detail.ip],
                        ["位置", detail.location],
                        [
                          "设备识别",
                          "sampledAt" in detail || detail.kind === "connection"
                            ? (detailDevice?.identification ?? "未识别")
                            : "User-Agent 推断（仅供参考）",
                        ],
                        [
                          "时间",
                          formatTime(
                            "sampledAt" in detail
                              ? detail.connectedAt
                              : detail.at,
                          ),
                        ],
                        ["节点", detail.node ?? "不适用"],
                        ...(!("sampledAt" in detail)
                          ? [
                              ["访问行为", detail.action ?? "订阅拉取"],
                              ["访问页面", detail.path ?? "不适用"],
                            ]
                          : []),
                        [
                          "状态",
                          "sampledAt" in detail
                            ? dataset.sampledAt - detail.sampledAt > 120000
                              ? "采集延迟"
                              : "在线"
                            : detail.result,
                        ],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="mb-1 text-xs text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="break-all">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <Separator />
                    {"sampledAt" in detail && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <UsageMetric
                            label="当前下载速度"
                            value={
                              <span className="text-lg">
                                {formatSpeed(detail.downloadRate)}
                              </span>
                            }
                            hint="最近有效采样"
                            icon={<ArrowDown />}
                          />
                          <UsageMetric
                            label="当前上传速度"
                            value={
                              <span className="text-lg">
                                {formatSpeed(detail.uploadRate)}
                              </span>
                            }
                            hint="最近有效采样"
                            icon={<ArrowUp />}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          采样时间：{formatTime(detail.sampledAt)}
                        </p>
                      </>
                    )}
                    {detailDevice && (
                      <HistoryCard
                        title="设备历史流量"
                        description="与该设备标识关联的原始流量"
                        {...historyProps}
                      >
                        <UsageTimeChart data={detailHistory} />
                      </HistoryCard>
                    )}
                    <p className="text-xs leading-6 text-muted-foreground">
                      IP 可能随网络切换而变化；未提供稳定设备标识时，无法仅凭 IP
                      确定物理设备。
                    </p>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
