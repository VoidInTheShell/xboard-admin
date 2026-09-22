import { useEffect, useMemo, useState } from "react";
import { useUsageApi, useOnlineCounts } from "@/lib/usage-api";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Gauge,
  Save,
  Scale,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { formatTrafficBytes } from "@/lib/traffic-format";
import { onlineHistorySeries } from "@/lib/usage-online-history";
import { UsageDisabledNotice } from "@/components/usage/usage-disabled-notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  HistoryCard,
  UsageEmpty,
  UsageSelect,
  UsageTimeChart,
} from "@/components/usage/usage-charts";
import { UsageMetric } from "@/components/usage/usage-explorer";
import {
  defaultRange,
  formatGiB,
  formatTime,
  inRange,
  makeUsagePreview,
  onlineCounts,
  trafficSeries,
  usagePreviewEnabled,
  rangeBounds,
  type UsageDataset,
} from "@/lib/usage-data";
import type { Machine } from "@/lib/control-plane/runtime-api";
import { ServerTrafficPanel } from "@/components/usage/server-traffic-panel";
import { makeServerTrafficPreview } from "@/lib/server-traffic-data";

export type TrafficPolicy = {
  limit: string;
  unit: "GiB" | "TiB";
  resetDay: string;
  zone: string;
  direction: string;
  warning: string;
};

export type TrafficCalibration = { used_bytes: string; at: number };

type PolicyResponse = {
  policy: TrafficPolicy & { calibration?: unknown };
  used: string;
  calibration?: TrafficCalibration | null;
};
export function defaultTrafficPolicy(id: number): TrafficPolicy {
  return {
    limit: id === 2 ? "2" : "1",
    unit: "TiB",
    resetDay: String(id === 1 ? 1 : id === 2 ? 15 : 28),
    zone: "Asia/Shanghai",
    direction: "both",
    warning: "80",
  };
}
export function billingCycle(policy: TrafficPolicy, now: number) {
  const offset =
    ({ UTC: 0, "Asia/Shanghai": 8, "Asia/Tokyo": 9 }[policy.zone] ?? 0) *
    3600000;
  const local = new Date(now + offset);
  const boundary = (year: number, month: number) =>
    Date.UTC(
      year,
      month,
      Math.min(
        Number(policy.resetDay),
        new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
      ),
    ) - offset;
  const year = local.getUTCFullYear(),
    month = local.getUTCMonth();
  const current = boundary(year, month);
  const start = now >= current ? current : boundary(year, month - 1);
  const end = now >= current ? boundary(year, month + 1) : current;
  return { start, end };
}

export function OnlineUsageCell({
  serverId,
  nodeId,
}: {
  serverId?: number;
  nodeId?: number;
}) {
  const remoteCounts = useOnlineCounts();
  const data = useMemo(
    () => (usagePreviewEnabled ? makeUsagePreview() : null),
    [],
  );
  const devices = (data?.devices ?? []).filter(
    (device) =>
      (!serverId || device.serverId === String(serverId)) &&
      (!nodeId || device.nodeId === String(nodeId)),
  );
  const sample = serverId
    ? remoteCounts?.machines[String(serverId)]
    : remoteCounts?.nodes[String(nodeId)];
  const counts = data
    ? onlineCounts(devices, data.sampledAt)
    : {
        users: sample?.users ?? 0,
        devices: sample?.devices ?? 0,
        ips: sample?.ips ?? 0,
      };
  if (!data && (!remoteCounts?.enabled || !sample))
    return <span className="text-xs text-muted-foreground">— / —</span>;
  return (
    <Link
      className="flex flex-col gap-1 rounded-md text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      to={"/usage?" + (serverId ? "server=" + serverId : "node=" + nodeId)}
      aria-label={
        "查看在线用户 " + counts.users + " 人、设备 " + counts.devices + " 台"
      }
    >
      <span className="font-mono">
        {counts.users} 人 / {counts.devices} 台
      </span>
      <span className="text-xs text-muted-foreground">
        {counts.ips} 个 IP{usagePreviewEnabled ? " · 演示" : ""}
      </span>
    </Link>
  );
}

export function ServerUsageSheet({
  machine,
  initialTab = "history",
  policy: initialPolicy,
  onSave,
  onClose,
}: {
  machine: Machine;
  initialTab?: string;
  policy: TrafficPolicy;
  onSave: (policy: TrafficPolicy) => void;
  onClose: () => void;
}) {
  const api = useUsageApi();
  const [policy, setPolicy] = useState(initialPolicy);
  const [remote, setRemote] = useState<UsageDataset | null>(null);
  const [remoteUsed, setRemoteUsed] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(policy);
  const [range, setRange] = useState(defaultRange);
  const [calibration, setCalibration] = useState<TrafficCalibration | null>(null);
  const [calibrationValue, setCalibrationValue] = useState("");
  const [calibrationUnit, setCalibrationUnit] = useState<"GiB" | "TiB">("GiB");
  const [clearCalibration, setClearCalibration] = useState(false);
  const previewData = useMemo(
    () => (usagePreviewEnabled ? makeUsagePreview() : null),
    [],
  );
  const data = usagePreviewEnabled ? previewData : remote;
  useEffect(() => {
    if (usagePreviewEnabled) return;
    const controller = new AbortController();
    const [from, to] = rangeBounds(range, Date.now());
    Promise.all([
      api.get<UsageDataset>(
        "usage/snapshot",
        {
          machine_id: machine.id,
          from: Math.floor(from / 1000),
          to: Math.floor(to / 1000),
        },
        controller.signal,
      ),
      api.get<PolicyResponse>(
        "usage/policy",
        { machine_id: machine.id },
        controller.signal,
      ),
    ])
      .then(([snapshot, response]) => {
        if (controller.signal.aborted) return;
        setRemote(snapshot);
        const policyFields = { ...response.policy };
        delete policyFields.calibration;
        setPolicy(policyFields);
        setDraft({
          ...policyFields,
          limit: String(policyFields.limit),
          resetDay: String(policyFields.resetDay),
          warning: String(policyFields.warning),
        });
        setRemoteUsed(Number(response.used) / 1073741824);
        setCalibration(response.calibration ?? null);
        setCalibrationUnit(policyFields.unit);
        setCalibrationValue("");
        setClearCalibration(false);
        setError("");
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [api, machine.id, range]);
  const [openedAt] = useState(() => Date.now());
  const now = data?.sampledAt ?? openedAt;
  const serverTraffic = useMemo(() => makeServerTrafficPreview(now), [now]);
  const traffic = (data?.traffic ?? []).filter(
    (item) => item.serverId === String(machine.id),
  );
  const selected = traffic.filter((item) => inRange(item.at, range, now));
  const series = usagePreviewEnabled
    ? trafficSeries(selected, range, now)
    : onlineHistorySeries(data?.onlineHistory ?? [], range, now);
  const devices = (data?.devices ?? []).filter(
    (item) => item.serverId === String(machine.id),
  );
  const counts = onlineCounts(devices, now);
  const validLimit =
    Number.isFinite(Number(draft.limit)) && Number(draft.limit) > 0;
  const validDay =
    Number.isInteger(Number(draft.resetDay)) &&
    Number(draft.resetDay) >= 1 &&
    Number(draft.resetDay) <= 31;
  const validWarning =
    Number.isFinite(Number(draft.warning)) &&
    Number(draft.warning) >= 1 &&
    Number(draft.warning) <= 100;
  const calibrationNumber = Number(calibrationValue);
  const validCalibration =
    calibrationValue.trim() === "" ||
    (Number.isFinite(calibrationNumber) && calibrationNumber > 0);
  const valid = validLimit && validDay && validWarning && validCalibration;
  const cycle = billingCycle(policy, now);
  const draftCycle = valid ? billingCycle(draft, now) : null;
  const used = usagePreviewEnabled
    ? serverTraffic.nic
        .filter((item) => item.serverId === String(machine.id))
        .filter((item) => item.at >= cycle.start && item.at < cycle.end)
        .reduce(
          (sum, item) =>
            sum +
            (policy.direction === "upload"
              ? item.incoming
              : policy.direction === "download"
                ? item.outgoing
                : item.incoming + item.outgoing),
          0,
        )
    : remoteUsed;
  const limit = Number(policy.limit) * (policy.unit === "TiB" ? 1024 : 1);
  const percent = (used / limit) * 100;
  const localDate = (at: number, zone = policy.zone) =>
    new Date(at).toLocaleDateString("zh-CN", { timeZone: zone });
  const elapsed = Math.max(1, (now - cycle.start) / 86400000);
  const forecast = (used / elapsed) * ((cycle.end - cycle.start) / 86400000);
  function field(key: keyof TrafficPolicy, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  const disabled = !usagePreviewEnabled && data?.enabled === false;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="shrink-0 border-b p-6 pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>{machine.name}</SheetTitle>
            {usagePreviewEnabled && <Badge variant="outline">演示数据</Badge>}
          </div>
          <SheetDescription>
            服务器信息 · SID {machine.id} ·{" "}
            {machine.notes || "Xboard-Node Agent"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <UsageEmpty
              title="服务器历史加载失败"
              description={error}
            />
          ) : !data ? (
            <UsageEmpty
              title="正在加载服务器历史"
              description="正在从后端获取流量与在线历史。"
            />
          ) : disabled ? (
            <UsageDisabledNotice compact />
          ) : null}
          {disabled || (!error && data) ? (
            <>
              {!disabled && (
                <div className="grid gap-3 sm:grid-cols-3">
                <UsageMetric
                  label="在线用户 / 设备"
                  value={counts.users + " / " + counts.devices}
                  hint={counts.ips + " 个在线 IP"}
                  icon={<Users />}
                />
                <UsageMetric
                  label="网卡本账期已用"
                  value={formatGiB(used)}
                  hint={"上限 " + policy.limit + " " + policy.unit}
                  icon={<Gauge />}
                />
                <UsageMetric
                  label="下次重置"
                  value={
                    <span className="text-lg">{localDate(cycle.end)}</span>
                  }
                  hint={"每月 " + policy.resetDay + " 日 · " + policy.zone}
                  icon={<CalendarClock />}
                />
                </div>
              )}
              <Tabs value={disabled ? "traffic" : tab} onValueChange={setTab} className="min-w-0">
                {!disabled && (
                <TabsList
                  variant="line"
                  className="group-data-[orientation=horizontal]/tabs:h-auto"
                >
                  <TabsTrigger value="history">
                    <Activity />
                    历史与状态
                  </TabsTrigger>
                  <TabsTrigger value="traffic">
                    <Gauge />
                    流量管理
                  </TabsTrigger>
                </TabsList>
                )}
                {!disabled && (
                <TabsContent
                  value="history"
                  className="mt-4 flex flex-col gap-4"
                >
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>网卡本账期流量</CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTab("traffic")}
                        >
                          管理流量
                        </Button>
                      </div>
                      <CardDescription>
                        {localDate(cycle.start)} — {localDate(cycle.end)} ·{" "}
                        {policy.direction === "both"
                          ? "网卡入站 + 出站"
                          : policy.direction === "download"
                            ? "仅网卡出站 TX"
                            : "仅网卡入站 RX"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex justify-between text-sm">
                        <span>
                          {formatGiB(used)} / {formatGiB(limit)}
                        </span>
                        <Badge
                          variant={
                            percent >= Number(policy.warning)
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {percent.toFixed(1)}%
                        </Badge>
                      </div>
                      <Progress value={Math.min(100, percent)} />
                      <p className="text-xs text-muted-foreground">
                        剩余 {formatGiB(Math.max(0, limit - used))} ·
                        按本账期日均预计使用 {formatGiB(forecast)}
                      </p>
                    </CardContent>
                  </Card>
                  <ServerTrafficPanel
                    serverId={String(machine.id)}
                    now={now}
                    range={range}
                    onRangeChange={setRange}
                    showInventory={false}
                  />
                  <HistoryCard
                    title="历史在线人数与设备"
                    description="每个时间段内的同时在线峰值"
                    range={range}
                    onRangeChange={setRange}
                  >
                    <UsageTimeChart data={series} kind="online" unit="个" />
                  </HistoryCard>
                  <Button variant="outline" asChild>
                    <Link to={"/usage?server=" + machine.id}>
                      查看此服务器的使用记录
                      <ArrowRight data-icon="inline-end" />
                    </Link>
                  </Button>
                </TabsContent>
                )}
                <TabsContent
                  value="traffic"
                  className="mt-4 flex flex-col gap-5"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>账期与流量额度</CardTitle>
                      <CardDescription>
                        按服务器选定计量网卡的原始流量独立计算账期；修改重置日期不会删除历史记录。
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field data-invalid={!validLimit}>
                          <FieldLabel htmlFor="server-monthly-limit">
                            每月流量上限
                          </FieldLabel>
                          <div className="flex gap-2">
                            <Input
                              id="server-monthly-limit"
                              type="number"
                              min="0.01"
                              step="any"
                              value={draft.limit}
                              onChange={(e) => field("limit", e.target.value)}
                              aria-invalid={!validLimit}
                            />
                            <UsageSelect
                              label="流量单位"
                              value={draft.unit}
                              onChange={(value) => field("unit", value)}
                              options={[
                                { value: "GiB", label: "GiB" },
                                { value: "TiB", label: "TiB" },
                              ]}
                            />
                          </div>
                          {!validLimit && (
                            <FieldDescription role="alert">
                              请输入大于 0 的流量上限。
                            </FieldDescription>
                          )}
                        </Field>
                        <Field data-invalid={!validDay}>
                          <FieldLabel htmlFor="server-reset-day">
                            每月重置日期
                          </FieldLabel>
                          <Input
                            id="server-reset-day"
                            type="number"
                            min={1}
                            max={31}
                            step={1}
                            value={draft.resetDay}
                            onChange={(e) => field("resetDay", e.target.value)}
                            aria-invalid={!validDay}
                          />
                          <FieldDescription>
                            每月指定日 00:00
                            重置；当月没有该日期时，在当月最后一天重置。
                          </FieldDescription>
                          {!validDay && (
                            <FieldDescription role="alert">
                              重置日须为 1 到 31 的整数。
                            </FieldDescription>
                          )}
                        </Field>
                        <Field>
                          <FieldLabel>账期时区</FieldLabel>
                          <UsageSelect
                            label="账期时区"
                            value={draft.zone}
                            onChange={(value) => field("zone", value)}
                            options={[
                              {
                                value: "Asia/Shanghai",
                                label: "Asia/Shanghai · UTC+8",
                              },
                              { value: "UTC", label: "UTC · UTC+0" },
                              {
                                value: "Asia/Tokyo",
                                label: "Asia/Tokyo · UTC+9",
                              },
                            ]}
                          />
                        </Field>
                        <Field>
                          <FieldLabel>计入额度的流量</FieldLabel>
                          <UsageSelect
                            label="计入额度的流量"
                            value={draft.direction}
                            onChange={(value) => field("direction", value)}
                            options={[
                              { value: "both", label: "网卡入站 RX + 出站 TX" },
                              {
                                value: "download",
                                label: "仅网卡出站 TX",
                              },
                              {
                                value: "upload",
                                label: "仅网卡入站 RX",
                              },
                            ]}
                          />
                          <FieldDescription>
                            来源为服务器计量网卡，含同机其他服务；不使用实例流量、不应用用户计费倍率，避免重复计数。运营商的
                            GB / GiB 计量规则需另行核对。
                          </FieldDescription>
                        </Field>
                        <Field data-invalid={!validWarning}>
                          <FieldLabel htmlFor="server-warning">
                            流量预警阈值（%）
                          </FieldLabel>
                          <Input
                            id="server-warning"
                            type="number"
                            min={1}
                            max={100}
                            value={draft.warning}
                            onChange={(e) => field("warning", e.target.value)}
                            aria-invalid={!validWarning}
                          />
                          <FieldDescription>
                            达到阈值时突出显示用量，保持节点运行。
                          </FieldDescription>
                          {!validWarning && (
                            <FieldDescription role="alert">
                              阈值须为 1 到 100。
                            </FieldDescription>
                          )}
                        </Field>
                        <Field data-invalid={!validCalibration}>
                          <FieldLabel htmlFor="server-calibration">
                            流量校准（本账期已用）
                          </FieldLabel>
                          {calibration && !clearCalibration ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <Badge variant="secondary">
                                <Scale aria-hidden="true" />
                                已校准 {formatTrafficBytes(Number(calibration.used_bytes))} · {formatTime(calibration.at * 1000)}
                              </Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setClearCalibration(true)}
                              >
                                清除校准
                              </Button>
                            </div>
                          ) : clearCalibration ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              保存后将清除校准，改用面板自身统计。
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setClearCalibration(false)}
                              >
                                撤销
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                id="server-calibration"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="留空则不校准"
                                value={calibrationValue}
                                onChange={(e) => {
                                  setCalibrationValue(e.target.value);
                                  setClearCalibration(false);
                                }}
                                aria-invalid={!validCalibration}
                              />
                              <UsageSelect
                                label="校准单位"
                                value={calibrationUnit}
                                onChange={(value) => setCalibrationUnit(value as "GiB" | "TiB")}
                                options={[
                                  { value: "GiB", label: "GiB" },
                                  { value: "TiB", label: "TiB" },
                                ]}
                              />
                            </div>
                          )}
                          <FieldDescription>
                            填入供应商管理面板显示的本账期已用流量，保存后本账期用量从该值重新起算，后续流量在其基础上继续累计；留空保持面板自身统计。修改重置日期会使已保存的校准失效。
                          </FieldDescription>
                          {!validCalibration && (
                            <FieldDescription role="alert">
                              校准值须为大于 0 的数字。
                            </FieldDescription>
                          )}
                        </Field>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                  {draftCycle && (
                    <div className="flex flex-col gap-1 text-sm">
                      <span>
                        下一次重置：{localDate(draftCycle.end, draft.zone)}{" "}
                        00:00
                      </span>
                      <span className="text-xs text-muted-foreground">
                        当前账期：{localDate(draftCycle.start, draft.zone)} —{" "}
                        {localDate(draftCycle.end, draft.zone)}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDraft(policy);
                        setCalibrationValue("");
                        setClearCalibration(false);
                        setCalibrationUnit(policy.unit);
                        if (!disabled) setTab("history");
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      disabled={!valid || saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          if (!usagePreviewEnabled) {
                            const calibrationPayload = clearCalibration
                              ? { clear: true }
                              : calibrationValue.trim() !== ""
                                ? { value: Number(calibrationValue), unit: calibrationUnit }
                                : undefined;
                            await api.post("usage/policy/save", {
                              machine_id: machine.id,
                              ...draft,
                              ...(calibrationPayload ? { calibration: calibrationPayload } : {}),
                            });
                            const updated = await api.get<PolicyResponse>(
                              "usage/policy",
                              { machine_id: machine.id },
                            );
                            setRemoteUsed(Number(updated.used) / 1073741824);
                            setCalibration(updated.calibration ?? null);
                          }
                          setPolicy(draft);
                          setCalibrationValue("");
                          setClearCalibration(false);
                          onSave(draft);
                          toast.success(
                            usagePreviewEnabled
                              ? "已保存到本次前端预览"
                              : "流量规则已保存",
                          );
                          if (!disabled) setTab("history");
                        } catch (reason) {
                          toast.error(
                            reason instanceof Error
                              ? reason.message
                              : "保存失败",
                          );
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <Save data-icon="inline-start" />
                      保存流量规则
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
              {!disabled && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="size-3" />
                采样时间：{formatTime(now)}
              </p>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
