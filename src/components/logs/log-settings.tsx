import { useState, useEffect, type ReactNode } from "react";
import {
  Activity,
  Archive,
  Database,
  FileClock,
  HardDrive,
  Info,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  defaultLogPolicies,
  estimatePolicy,
  formatLogBytes,
  type CleanupMode,
  type LogPolicy,
} from "@/lib/log-policy";

const categories = [
  { id: "storage", title: "容量与清理", icon: HardDrive },
  { id: "business", title: "操作与邮件", icon: FileClock },
  { id: "access", title: "访问与安全", icon: ShieldCheck },
  { id: "usage", title: "流量与在线", icon: Activity },
  { id: "runtime", title: "运行日志", icon: Database },
  { id: "archive", title: "长期归档", icon: Archive },
];
import { useAdminApi } from "@/lib/auth";
type StorageStatus = { effectiveLevel: string; debugUntil: number | null; storage: {bytes: number; measuredAt: number} | null; maintenance: {ranAt: number; overBudget: boolean} | null };
const defaults = {
  policies: defaultLogPolicies,
  totalGiB: 10,
  cleanup: true,
  interval: "hourly",
  watermark: 80,
  usageEnabled: true,
  auditFailures: true,
  auditLogin: true,
  auditReads: false,
  level: "warning",
  debugMinutes: "30",
  rotationMiB: 20,
  rotationFiles: 5,
  compress: true,
  archiveAfter: 90,
  archiveKeep: "forever",
  archiveYears: 5,
  summaryDaily: true,
  summaryUsers: 1000,
  estimateYears: 5,
  compressionRatio: 35,
  horizonMinutes: 60,
  horizonFailedDays: 7,
  appliedHours: 24,
};
type Draft = typeof defaults;

function validateDraft(draft: Draft) {
  const positive = [
    draft.totalGiB,
    draft.watermark,
    draft.rotationMiB,
    draft.rotationFiles,
    draft.archiveAfter,
    draft.archiveYears,
    draft.summaryUsers,
    draft.estimateYears,
    draft.compressionRatio,
    draft.horizonMinutes,
    draft.horizonFailedDays,
    draft.appliedHours,
  ];
  if (
    positive.some((value) => !Number.isFinite(value) || value <= 0) ||
    draft.watermark >= 100 ||
    draft.compressionRatio > 100
  )
    return "容量和数量必须大于 0；清理目标需小于 100%，压缩比例不能超过 100%。";
  if (
    !["hourly", "daily"].includes(draft.interval) ||
    !["debug", "info", "warning", "error"].includes(draft.level) ||
    !["15", "30", "60"].includes(draft.debugMinutes) ||
    !["forever", "years"].includes(draft.archiveKeep)
  )
    return "请选择有效的配置选项。";
  for (const policy of draft.policies) {
    if (
      typeof policy.enabled !== "boolean" ||
      !["days", "size", "either"].includes(policy.mode) ||
      [policy.days, policy.maxMiB, policy.bytes].some(
        (value) => !Number.isFinite(value) || value <= 0,
      ) ||
      !Number.isFinite(policy.daily) ||
      policy.daily < 0
    )
      return `${policy.title}：请填写有效的保留期、容量和估算参数。`;
  }
  return "";
}

export function LogSettings() {
  const api = useAdminApi();
  const [draft, setDraft] = useState(defaults);
  const [baseline, setBaseline] = useState(() => JSON.stringify(defaults));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [serviceStatus, setServiceStatus] = useState<StorageStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.get<{settings: Draft; status: StorageStatus}>("logs/settings", undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const next = {...defaults, ...result.settings, policies: defaultLogPolicies.map(p => ({...p, ...result.settings.policies.find(saved => saved.id === p.id)}))};
      setDraft(next); setBaseline(JSON.stringify(next)); setServiceStatus(result.status); setLoaded(true);
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "无法读取日志配置"); });
    return () => controller.abort();
  }, [api]);
  const [tab, setTab] = useState("storage");
  const dirty = JSON.stringify(draft) !== baseline;
  const error = validateDraft(draft);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function updatePolicy(id: string, patch: Partial<LogPolicy>) {
    update(
      "policies",
      draft.policies.map((policy) =>
        policy.id === id ? { ...policy, ...patch } : policy,
      ),
    );
  }
  const activePolicies = draft.policies.map((policy) => ({
    ...policy,
    enabled:
      policy.enabled &&
      (!(policy.category === "access" || policy.category === "usage") ||
        draft.usageEnabled ||
        policy.id === "legacy"),
  }));
  const detailBytes = activePolicies.reduce(
    (sum, policy) =>
      sum +
      (policy.location === "面板文件"
        ? Math.min(
            estimatePolicy(policy),
            draft.rotationMiB * draft.rotationFiles * 1024 ** 2,
          )
        : estimatePolicy(policy)),
    0,
  );
  const years =
    draft.archiveKeep === "years"
      ? Math.min(draft.archiveYears, draft.estimateYears)
      : draft.estimateYears;
  const summaryRaw = draft.summaryDaily
    ? draft.summaryUsers * 365 * years * 96 * 1.5
    : 0;
  const hotRatio = Math.min(1, draft.archiveAfter / (365 * years));
  const summaryBytes = draft.compress
    ? summaryRaw * (hotRatio + ((1 - hotRatio) * draft.compressionRatio) / 100)
    : summaryRaw;
  const estimate = detailBytes + summaryBytes;
  const budget = draft.totalGiB * 1024 ** 3;
  async function save() {
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await api.post("logs/save", draft);
      setBaseline(JSON.stringify(draft));
      setServiceStatus(await api.get<StorageStatus>("logs/stats").catch(() => serviceStatus));
      toast.success("日志配置已保存");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally { setSaving(false); }
  }
  if (loadError) return <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription><Button variant="outline" onClick={() => window.location.reload()}>重新加载</Button></Alert>;
  if (!loaded) return <p className="p-4 text-sm text-muted-foreground" role="status">正在读取日志配置…</p>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">日志配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理采集、循环清理和长期保留。
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || Boolean(error) || saving}>
          <Save data-icon="inline-start" />
          {saving ? "正在保存…" : "保存日志配置"}
        </Button>
      </div>
      <Alert>
        <Info />
        <AlertTitle>当前生效级别：{serviceStatus?.effectiveLevel ?? "—"}</AlertTitle>
        <AlertDescription>
          保存后采集策略约 5 秒内更新。空间预估根据下方假设计算，数据库占用采用行样本估算，不等同于数据库文件大小。
          {serviceStatus?.storage ? ` 当前保留量约 ${formatLogBytes(serviceStatus.storage.bytes)}。` : " 等待首次存储统计。"}
          {serviceStatus?.maintenance ? ` 最近维护：${new Date(serviceStatus.maintenance.ranAt * 1000).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})}（UTC+8）。` : ""}
          {serviceStatus?.maintenance?.overBudget && " 已达总预算，新增明细暂停，等待清理释放空间。"}
          {serviceStatus?.debugUntil ? ` 临时 debug 到期时间：${new Date(serviceStatus.debugUntil * 1000).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})}（UTC+8）。` : ""}
        </AlertDescription>
      </Alert>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
        <div className="min-w-0 overflow-x-auto border-b pb-px">
          <TabsList
            variant="line"
            className="w-max group-data-[orientation=horizontal]/tabs:h-auto"
            aria-label="日志配置分类"
          >
            {categories.map(({ id, title, icon: Icon }) => (
              <TabsTrigger value={id} key={id}>
                <Icon aria-hidden="true" />
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="storage" className="flex flex-col gap-4">
          <Section
            title="总保存上限"
            description="预算覆盖面板日志文件、日志数据库记录与归档；不包含业务数据、备份文件、Redis 缓存及节点 / 宿主机日志。"
          >
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <NumberField
                id="total-budget"
                label="日志总保存上限（GiB）"
                value={draft.totalGiB}
                onChange={(value) => update("totalGiB", value)}
                hint={`约 ${formatLogBytes(budget)}，1 GiB = 1024 MiB。`}
              />
              <NumberField
                id="watermark"
                label="达到上限后清理至（%）"
                value={draft.watermark}
                max={99}
                onChange={(value) => update("watermark", value)}
                hint={`按最旧记录优先，目标降至 ${formatLogBytes((budget * draft.watermark) / 100)}。`}
              />
            </FieldGroup>
            <div
              className="mt-5 flex flex-col gap-2 rounded-xl border bg-muted/30 p-4"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">按当前配置估算</span>
                <span className="font-data text-lg font-semibold">
                  {formatLogBytes(estimate)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {formatLogBytes(budget)}
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Number.isFinite(estimate / budget) ? Math.min(100, (estimate / budget) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                明细约 {formatLogBytes(detailBytes)} + {years} 年轻量汇总约{" "}
                {formatLogBytes(summaryBytes)}。仅按容量保留的类别，以 30
                天新增量估算。
              </p>
              {estimate > budget && (
                <p className="text-sm text-destructive">
                  预计超过总上限；循环清理会缩短实际保留时间，可增加预算或减少高频明细。
                </p>
              )}
            </div>
          </Section>
          <Section
            title="循环清理"
            description="分类规则与总上限同时生效；优先清理审计、邮件和访问明细，再处理其他历史记录。"
          >
            <FieldGroup>
              <SwitchField
                id="cleanup"
                label="自动循环清理"
                description="按计划删除超过保留期或空间额度的旧日志。"
                checked={draft.cleanup}
                onChange={(value) => update("cleanup", value)}
              />
              <ChoiceField
                id="cleanup-interval"
                label="清理频率"
                value={draft.interval}
                onChange={(value) => update("interval", value)}
                options={[
                  ["hourly", "每小时"],
                  ["daily", "每天"],
                ]}
                disabled={!draft.cleanup}
              />
              {!draft.cleanup && (
                <Alert>
                  <Info />
                  <AlertDescription>
                    关闭自动清理后，总上限仍由写入保护执行，文件轮转继续运行；达到上限时暂停新增非必要日志。
                  </AlertDescription>
                </Alert>
              )}
              <FieldDescription>
                同步必需记录和账户累计用量不随日志清理。总上限是日志保留预算，数据库文件回收与宿主机磁盘保护需分别处理。
              </FieldDescription>
            </FieldGroup>
          </Section>
        </TabsContent>
        {categories
          .filter((category) =>
            ["business", "access", "usage", "runtime"].includes(category.id),
          )
          .map((category) => (
            <TabsContent
              key={category.id}
              value={category.id}
              className="flex flex-col gap-4"
            >
              {category.id === "business" && (
                <Section
                  title="审计范围"
                  description="按排查频率保留管理操作与安全事件。"
                >
                  <FieldGroup>
                    <SwitchField
                      id="audit-login"
                      label="记录管理员登录"
                      description="记录管理员登录成功与失败。"
                      checked={draft.auditLogin}
                      onChange={(value) => update("auditLogin", value)}
                    />
                    <SwitchField
                      id="audit-failures"
                      label="记录失败的管理操作"
                      description="补充未成功完成的写入请求与响应状态。"
                      checked={draft.auditFailures}
                      onChange={(value) => update("auditFailures", value)}
                    />
                    <SwitchField
                      id="audit-reads"
                      label="记录只读查询"
                      description="额外记录管理端与 MCP 的查询请求，可能明显增加日志量。"
                      checked={draft.auditReads}
                      onChange={(value) => update("auditReads", value)}
                    />
                  </FieldGroup>
                </Section>
              )}
              {category.id === "usage" && (
                <Section
                  title="使用记录采集"
                  description="控制新增的访问、来源、流量明细与在线历史，不影响计费和账户累计用量。"
                >
                  <FieldGroup>
                    <SwitchField
                      id="usage-enabled"
                      label="启用使用记录采集"
                      checked={draft.usageEnabled}
                      onChange={(value) => update("usageEnabled", value)}
                    />
                    <FieldDescription>
                      原有用户 /
                      服务器流量统计在下方独立控制；首页、排行榜和用户流量报表仍使用旧统计，默认开启。
                    </FieldDescription>
                  </FieldGroup>
                </Section>
              )}
              {(category.id === "access" || category.id === "usage") &&
                !draft.usageEnabled && (
                  <Alert>
                    <Info />
                    <AlertDescription>
                      使用记录采集总开关已关闭。分类策略会保留，重新启用总开关后适用。
                    </AlertDescription>
                  </Alert>
                )}
              {category.id === "runtime" && (
                <Section
                  title="日志级别与文件轮转"
                  description="控制面板应用输出；临时 Debug 到期后恢复此前级别。"
                >
                  <FieldGroup className="grid gap-5 sm:grid-cols-2">
                    <ChoiceField
                      id="runtime-level"
                      label="面板应用日志级别"
                      value={draft.level}
                      onChange={(value) => update("level", value)}
                      options={[
                        ["error", "Error · 仅错误"],
                        ["warning", "Warning · 警告与错误"],
                        ["info", "Info · 运行信息"],
                        ["debug", "Debug · 临时调试"],
                      ]}
                    />
                    {draft.level === "debug" && (
                      <ChoiceField
                        id="debug-duration"
                        label="自动恢复时间"
                        value={draft.debugMinutes}
                        onChange={(value) => update("debugMinutes", value)}
                        options={[
                          ["15", "15 分钟"],
                          ["30", "30 分钟"],
                          ["60", "1 小时"],
                        ]}
                      />
                    )}
                    <NumberField
                      id="rotation-size"
                      label="单文件轮转大小（MiB）"
                      value={draft.rotationMiB}
                      onChange={(value) => update("rotationMiB", value)}
                    />
                    <NumberField
                      id="rotation-files"
                      label="每类日志最多文件数"
                      value={draft.rotationFiles}
                      onChange={(value) => update("rotationFiles", value)}
                      hint={`含当前文件，每类最多约 ${formatLogBytes(draft.rotationMiB * draft.rotationFiles * 1024 ** 2)}；与分类额度取更小值。`}
                    />
                  </FieldGroup>
                </Section>
              )}
              {draft.policies
                .filter((policy) => policy.category === category.id)
                .map((policy) => (
                  <PolicyEditor
                    key={policy.id}
                    policy={policy}
                    fileLimit={
                      draft.rotationMiB * draft.rotationFiles * 1024 ** 2
                    }
                    onChange={(patch) => updatePolicy(policy.id, patch)}
                  />
                ))}
              {category.id === "runtime" && (
                <Section
                  title="队列与状态缓存"
                  description="缓存不计入面板日志预算；新保留期应用于后续写入，现有缓存按原过期时间失效。"
                >
                  <FieldGroup className="grid gap-5 sm:grid-cols-2">
                    <NumberField
                      id="horizon-minutes"
                      label="Horizon 普通任务保留（分钟）"
                      value={draft.horizonMinutes}
                      onChange={(value) => update("horizonMinutes", value)}
                    />
                    <NumberField
                      id="horizon-failed-days"
                      label="Horizon 失败 / 监控任务保留（天）"
                      value={draft.horizonFailedDays}
                      onChange={(value) => update("horizonFailedDays", value)}
                    />
                    <NumberField
                      id="applied-hours"
                      label="节点配置结果缓存保留（小时）"
                      value={draft.appliedHours}
                      onChange={(value) => update("appliedHours", value)}
                      hint="控制缓存有效期；节点配置中的最新应用回执继续保留。"
                    />
                  </FieldGroup>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Docker
                    与系统服务日志保存在宿主机，其轮转、额度和实际生效状态需独立核对。
                  </p>
                </Section>
              )}
            </TabsContent>
          ))}
        <TabsContent value="archive" className="flex flex-col gap-4">
          <Section
            title="轻量汇总长期保留"
            description="每日用户 / 节点流量按日汇总；账户总流量作为业务数据持续保留，不随日志清理。"
          >
            <FieldGroup>
              <SwitchField
                id="summary-daily"
                label="保留每日流量汇总"
                description="清理历史流量明细时保留按日汇总，用于长期趋势查询。"
                checked={draft.summaryDaily}
                onChange={(value) => update("summaryDaily", value)}
              />
              <ChoiceField
                id="archive-keep"
                label="汇总保留时长"
                value={draft.archiveKeep}
                onChange={(value) => update("archiveKeep", value)}
                options={[
                  ["forever", "长期保留"],
                  ["years", "指定年数"],
                ]}
                disabled={!draft.summaryDaily}
              />
              {draft.archiveKeep === "years" && (
                <NumberField
                  id="archive-years"
                  label="汇总保留年数"
                  value={draft.archiveYears}
                  onChange={(value) => update("archiveYears", value)}
                />
              )}
            </FieldGroup>
          </Section>
          <Section
            title="压缩归档"
            description="将较早的每日汇总分批压缩保存，查询时按需读取；不归档连接明细。"
          >
            <FieldGroup>
              <SwitchField
                id="compress"
                label="压缩历史汇总"
                description="降低长期保存的空间占用，历史查询可能稍慢。"
                checked={draft.compress}
                onChange={(value) => update("compress", value)}
              />
              <NumberField
                id="archive-after"
                label="超过多少天转为归档"
                value={draft.archiveAfter}
                onChange={(value) => update("archiveAfter", value)}
                disabled={!draft.compress}
              />
              <FieldDescription>
                归档计入总保存上限；预算不足时优先清理高频明细，并暂停新增汇总。长期保留的数据不会静默删除。
              </FieldDescription>
            </FieldGroup>
          </Section>
          <Section
            title="长期空间预估"
            description="汇总按每个用户 / 节点每天一条、每条 96 B，另加 50% 索引及存储开销计算。"
          >
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <NumberField
                id="summary-users"
                label="每日汇总对象数"
                value={draft.summaryUsers}
                onChange={(value) => update("summaryUsers", value)}
                hint="填写预计每天的用户与节点组合数，并计入服务器网卡汇总。"
              />
              <NumberField
                id="estimate-years"
                label="预估未来年数"
                value={draft.estimateYears}
                onChange={(value) => update("estimateYears", value)}
              />
              <NumberField
                id="compression-ratio"
                label="预计压缩后占原体积（%）"
                value={draft.compressionRatio}
                max={100}
                onChange={(value) => update("compressionRatio", value)}
                disabled={!draft.compress}
                hint="默认 35% 仅为估算假设，实际比例取决于数据。"
              />
            </FieldGroup>
            <p className="mt-4 text-sm" aria-live="polite">
              {years} 年预计：未压缩 {formatLogBytes(summaryRaw)} → 按当前策略{" "}
              {formatLogBytes(summaryBytes)}。长期保留仍会持续增长。
            </p>
          </Section>
        </TabsContent>
      </Tabs>
      {error && (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-xs text-muted-foreground">
          {dirty ? "有未保存的修改" : "配置已同步"}
        </span>
        <Button
          variant="outline"
          disabled={!dirty}
          onClick={() => setDraft(JSON.parse(baseline) as Draft)}
        >
          撤销本次修改
        </Button>
      </div>
    </div>
  );
}

function PolicyEditor({
  policy,
  onChange,
  fileLimit,
}: {
  policy: LogPolicy;
  onChange: (patch: Partial<LogPolicy>) => void;
  fileLimit: number;
}) {
  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <label htmlFor={`enable-${policy.id}`}>{policy.title}</label>
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{policy.location}</Badge>
            <Switch
              id={`enable-${policy.id}`}
              checked={policy.enabled}
              onCheckedChange={(enabled) => onChange({ enabled })}
              disabled={policy.id === "events"}
            />
          </div>
        </div>
        <CardDescription>{policy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ChoiceField
            id={`${policy.id}-mode`}
            label="循环清理条件"
            value={policy.mode}
            onChange={(mode) => onChange({ mode: mode as CleanupMode })}
            disabled={!policy.enabled}
            options={[
              ["either", "天数或容量先到即清理"],
              ["days", "按保留天数"],
              ["size", "按占用空间"],
            ]}
          />
          <NumberField
            id={`${policy.id}-days`}
            label="保留天数"
            value={policy.days}
            onChange={(days) => onChange({ days })}
            disabled={!policy.enabled || policy.mode === "size"}
          />
          <NumberField
            id={`${policy.id}-size`}
            label="分类保存上限（MiB）"
            value={policy.maxMiB}
            onChange={(maxMiB) => onChange({ maxMiB })}
            disabled={!policy.enabled || policy.mode === "days"}
          />
        </FieldGroup>
        <details className="rounded-xl border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-ring">
            空间预估{" "}
            {formatLogBytes(
              policy.location === "面板文件"
                ? Math.min(estimatePolicy(policy), fileLimit)
                : estimatePolicy(policy),
            )}{" "}
            · 调整计算依据
          </summary>
          <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              id={`${policy.id}-daily`}
              label="预计每天新增条数"
              min={0}
              value={policy.daily}
              onChange={(daily) => onChange({ daily })}
            />
            <NumberField
              id={`${policy.id}-bytes`}
              label="平均每条大小（B）"
              value={policy.bytes}
              onChange={(bytes) => onChange({ bytes })}
            />
          </FieldGroup>
          <p className="mt-3 text-xs text-muted-foreground">
            每天条数 × 每条大小 × 保留天数 ×
            1.5（索引与开销），再按分类容量取上限。仅按空间清理时用 30
            天估算；仍受总上限约束。
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  min = 1,
  max,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const invalid =
    !Number.isFinite(value) ||
    value < min ||
    (max !== undefined && value > max);
  return (
    <Field data-disabled={disabled} data-invalid={!disabled && invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value === 0 && min > 0 ? "" : value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        aria-invalid={!disabled && invalid}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}
export function ChoiceField({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
  disabled?: boolean;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map(([key, text]) => (
              <SelectItem key={key} value={key}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}
