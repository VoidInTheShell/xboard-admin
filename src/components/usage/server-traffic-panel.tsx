import { useEffect, useMemo, useState } from "react";
import { useUsageApi } from "@/lib/usage-api";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  HistoryCard,
  UsageTimeChart,
  UsageSelect,
} from "@/components/usage/usage-charts";
import {
  formatGiB,
  inRange,
  rangeBounds,
  usagePreviewEnabled,
  type UsageRange,
} from "@/lib/usage-data";
import {
  makeServerTrafficPreview,
  serverTrafficSeries,
  sumServerTraffic,
  trafficInterfaces as previewInterfaces,
  trafficInstances as previewInstances,
  type ServerTrafficSample,
} from "@/lib/server-traffic-data";

export function ServerTrafficPanel({
  serverId,
  now,
  range,
  onRangeChange,
  showInventory = true,
}: {
  serverId: string;
  now: number;
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  showInventory?: boolean;
}) {
  const api = useUsageApi();
  const [remoteRows, setRemoteRows] = useState<
    (ServerTrafficSample & {
      layer: string;
      name: string;
      nodeId: string;
      collectionScope?: string;
    })[]
  >([]);
  const [error, setError] = useState("");
  const [loadedScope, setLoadedScope] = useState("");
  const scopeKey = JSON.stringify([serverId, range]);
  useEffect(() => {
    if (usagePreviewEnabled) return;
    const controller = new AbortController();
    const [from, to] = rangeBounds(range, now);
    api
      .get<typeof remoteRows>(
        "usage/infrastructure",
        {
          from: Math.floor(from / 1000),
          to: Math.floor(to / 1000),
          machine_id: serverId === "all" ? undefined : serverId,
        },
        controller.signal,
      )
      .then((rows) => {
        if (!controller.signal.aborted) {
          setRemoteRows(rows);
          setLoadedScope(scopeKey);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) {
          setRemoteRows([]);
          setLoadedScope(scopeKey);
          setError(reason.message);
        }
      });
    return () => controller.abort();
  }, [api, range, now, serverId, scopeKey]);
  const [sampledAt] = useState(now);
  const preview = useMemo(
    () => makeServerTrafficPreview(sampledAt),
    [sampledAt],
  );
  const data = usagePreviewEnabled
    ? preview
    : {
        nic: remoteRows.filter((r) => r.layer === "nic"),
        instances: remoteRows.filter((r) => r.layer === "instance"),
      };
  const trafficInterfaces = usagePreviewEnabled
    ? previewInterfaces
    : [
        ...new Map(
          remoteRows
            .filter((r) => r.layer === "nic")
            .map((r) => [
              r.resourceId,
              {
                id: r.resourceId,
                serverId: r.serverId,
                name:
                  (r.collectionScope === "host"
                    ? "宿主机 · "
                    : r.collectionScope === "container"
                      ? "容器 · "
                      : "范围未标注 · ") + r.name,
                server: "SID " + r.serverId,
              },
            ]),
        ).values(),
      ];
  const trafficInstances = usagePreviewEnabled
    ? previewInstances
    : [
        ...new Map(
          remoteRows
            .filter((r) => r.layer === "instance")
            .map((r) => [
              r.resourceId,
              {
                id: r.resourceId,
                serverId: r.serverId,
                name: r.name,
                runtime: r.name.startsWith("xray:") ? "Xray" : "sing-box",
                nodeIds: [r.nodeId],
                server: "SID " + r.serverId,
              },
            ]),
        ).values(),
      ];
  const [nicId, setNicId] = useState("all");
  const [instanceId, setInstanceId] = useState("all");
  const nics = trafficInterfaces.filter(
    (item) => serverId === "all" || item.serverId === serverId,
  );
  const instances = trafficInstances.filter(
    (item) => serverId === "all" || item.serverId === serverId,
  );
  const select = (rows: ServerTrafficSample[], resourceId = "all") =>
    rows.filter(
      (row) =>
        (serverId === "all" || row.serverId === serverId) &&
        (resourceId === "all" || row.resourceId === resourceId) &&
        (usagePreviewEnabled
          ? inRange(row.at, range, now)
          : loadedScope === scopeKey && !error),
    );
  const nicRows = select(data.nic, nicId),
    instanceRows = select(data.instances, instanceId);
  const nicTotals = sumServerTraffic(nicRows),
    instanceTotals = sumServerTraffic(instanceRows);
  const stats = (
    incoming: string,
    outgoing: string,
    total: ReturnType<typeof sumServerTraffic>,
    available: boolean,
  ) => (
    <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        [incoming, total.incoming],
        [outgoing, total.outgoing],
        ["总流量", total.total],
      ].map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {available ? formatGiB(Number(value)) : "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Alert>
        <Info />
        <AlertDescription>
          {error && <span>{error}</span>}
          网卡记录按采集范围标注：宿主机网卡包含该接口上其他服务的流量，容器网卡仅包含容器网络；旧记录的范围未标注。
          实例是 Xray / sing-box
          上报的代理流量，不含计费倍率。两种口径独立展示，不相加，也不直接将差值视为其他服务用量。用户、节点筛选不适用于整机网卡。
        </AlertDescription>
      </Alert>
      <div className="grid min-w-0 grid-cols-1 gap-4">
        <HistoryCard
          title="服务器网卡流量"
          description="入站 RX / 出站 TX / 总量 · UTC+8"
          range={range}
          onRangeChange={onRangeChange}
        >
          <div className="mb-4">
            <UsageSelect
              label="统计网卡"
              value={nicId}
              onChange={setNicId}
              options={[
                { value: "all", label: "所有计量网卡" },
                ...nics.map((item) => ({
                  value: item.id,
                  label: item.server + " · " + item.name,
                })),
              ]}
            />
          </div>
          {stats("入站 RX", "出站 TX", nicTotals, nicRows.length > 0)}
          <UsageTimeChart
            data={serverTrafficSeries(nicRows, range)}
            labels={{ upload: "入站 RX", download: "出站 TX" }}
          />
        </HistoryCard>
        <HistoryCard
          title="Xray / sing-box 实例流量"
          description="实例代理上传 / 下载 / 总量 · 不等于网卡流量"
          range={range}
          onRangeChange={onRangeChange}
        >
          <div className="mb-4">
            <UsageSelect
              label="统计实例"
              value={instanceId}
              onChange={setInstanceId}
              options={[
                { value: "all", label: "所有代理实例" },
                ...instances.map((item) => ({
                  value: item.id,
                  label: item.name + " · " + item.runtime,
                })),
              ]}
            />
          </div>
          {stats(
            "代理上传",
            "代理下载",
            instanceTotals,
            instanceRows.length > 0,
          )}
          <UsageTimeChart
            data={serverTrafficSeries(instanceRows, range)}
            kind="bar"
            labels={{ upload: "代理上传", download: "代理下载" }}
          />
        </HistoryCard>
      </div>
      {showInventory && (
        <Card>
          <CardHeader>
            <CardTitle>计量对象明细</CardTitle>
            <CardDescription>
              跟随所选日期和服务器 · 网卡与实例分组核对，不跨口径合计。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>来源 / 对象</TableHead>
                  <TableHead>服务器</TableHead>
                  <TableHead>入站 / 代理上传</TableHead>
                  <TableHead>出站 / 代理下载</TableHead>
                  <TableHead>总流量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nics
                  .filter((item) => nicId === "all" || item.id === nicId)
                  .map((item) => {
                    const totals = sumServerTraffic(select(data.nic, item.id));
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">网卡</Badge>
                            <span className="font-mono">{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.server}</TableCell>
                        <TableCell>{formatGiB(totals.incoming)}</TableCell>
                        <TableCell>{formatGiB(totals.outgoing)}</TableCell>
                        <TableCell>{formatGiB(totals.total)}</TableCell>
                      </TableRow>
                    );
                  })}
                {instances
                  .filter(
                    (item) => instanceId === "all" || item.id === instanceId,
                  )
                  .map((item) => {
                    const totals = sumServerTraffic(
                      select(data.instances, item.id),
                    );
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono">{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.runtime} · 节点 {item.nodeIds.join(", ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{item.server}</TableCell>
                        <TableCell>{formatGiB(totals.incoming)}</TableCell>
                        <TableCell>{formatGiB(totals.outgoing)}</TableCell>
                        <TableCell>{formatGiB(totals.total)}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
