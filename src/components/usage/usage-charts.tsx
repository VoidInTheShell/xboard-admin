import { formatUsageValue } from "@/lib/traffic-format";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  Label,
  Cell,
} from "recharts";
import { CalendarDays } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { dateInput, type UsageRange } from "@/lib/usage-data";

export function UsageSelect({
  label,
  value,
  onChange,
  options,
  onCloseAutoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full min-w-32 sm:w-auto">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={onCloseAutoFocus}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function DateRangeSelect({
  value,
  onChange,
  label = "日期范围",
}: {
  value: UsageRange;
  onChange: (value: UsageRange) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pendingCustom = useRef(false);
  const [draft, setDraft] = useState(value);
  const id = useId();
  const [today] = useState(() => dateInput(Date.now()));
  const valid = Boolean(
    draft.from && draft.to && draft.from <= draft.to && draft.to <= today,
  );
  return (
    <div className="flex items-center gap-2 [&>[role=combobox]]:w-auto">
      <UsageSelect
        label={label}
        value={value.preset}
        onChange={(preset) => {
          if (preset === "custom") {
            setDraft(value);
            pendingCustom.current = true;
          } else onChange({ ...value, preset: preset as UsageRange["preset"] });
        }}
        options={[
          { value: "24h", label: "24h · 近24小时" },
          { value: "7d", label: "7d · 近7天" },
          { value: "1m", label: "1m · 近30天" },
          { value: "custom", label: "自定义" },
        ]}
        onCloseAutoFocus={(event) => {
          if (pendingCustom.current) {
            event.preventDefault();
            pendingCustom.current = false;
            setOpen(true);
          }
        }}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setDraft(value);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={label + "自定义日期"}
          >
            <CalendarDays />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72"
          aria-label="自定义日期范围"
        >
          <FieldGroup>
            <Field data-invalid={!valid}>
              <FieldLabel htmlFor={id + "-from"}>开始日期</FieldLabel>
              <Input
                id={id + "-from"}
                type="date"
                value={draft.from}
                max={today}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                aria-invalid={!valid}
              />
            </Field>
            <Field data-invalid={!valid}>
              <FieldLabel htmlFor={id + "-to"}>结束日期</FieldLabel>
              <Input
                id={id + "-to"}
                type="date"
                value={draft.to}
                min={draft.from}
                max={today}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                aria-invalid={!valid}
              />
            </Field>
            {!valid && (
              <p role="alert" className="text-xs text-destructive">
                结束日期不能早于开始日期，也不能晚于今天。
              </p>
            )}
            <Button
              disabled={!valid}
              onClick={() => {
                onChange({ ...draft, preset: "custom" });
                setOpen(false);
              }}
            >
              应用日期
            </Button>
          </FieldGroup>
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function UsageEmpty({
  title = "此范围内暂无记录",
  description = "试试其他日期范围或清除筛选条件。",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function HistoryCard({
  title,
  description,
  range,
  onRangeChange,
  children,
}: {
  title: string;
  description: string;
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <DateRangeSelect
            value={range}
            onChange={onRangeChange}
            label={title + "日期范围"}
          />
        </div>
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
const flowConfig = {
  download: { label: "下载", color: "var(--chart-1)" },
  upload: { label: "上传", color: "var(--chart-3)" },
  users: { label: "在线用户", color: "var(--chart-1)" },
  devices: { label: "在线设备", color: "var(--chart-3)" },
  pulls: { label: "成功拉取", color: "var(--chart-2)" },
  failed: { label: "失败次数", color: "var(--chart-4)" },
} satisfies ChartConfig;
export type SeriesPoint = {
  date: string;
  upload?: number;
  download?: number;
  users?: number;
  devices?: number;
  pulls?: number;
  failed?: number;
};
export function UsageTimeChart({
  data,
  kind = "area",
  unit = "GiB",
  height = 240,
  labels,
}: {
  data: SeriesPoint[];
  kind?: "area" | "bar" | "online" | "pulls" | "speed";
  unit?: string;
  height?: number;
  labels?: { upload: string; download: string };
}) {
  if (!data.length) return <UsageEmpty />;
  const config = {
    ...flowConfig,
    ...(labels
      ? {
          upload: { ...flowConfig.upload, label: labels.upload },
          download: { ...flowConfig.download, label: labels.download },
        }
      : {}),
  };
  const common = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="date"
        tickLine={false}
        axisLine={false}
        tickMargin={10}
        minTickGap={34}
        tickFormatter={(v) => String(v).replace(/^\d{4}-/, "")}
      />
      <YAxis
        width={88}
        tickLine={false}
        axisLine={false}
        allowDecimals={kind !== "online" && kind !== "pulls"}
        tickFormatter={(value) => formatUsageValue(Number(value), unit)}
      />
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name) => (
              <div className="flex w-full justify-between gap-5">
                <span className="text-muted-foreground">
                  {config[name as keyof typeof config]?.label ?? name}
                </span>
                <span className="font-mono tabular-nums">
                  {formatUsageValue(Number(value), unit)}
                </span>
              </div>
            )}
          />
        }
      />
      <ChartLegend content={<ChartLegendContent />} />
    </>
  );
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
      aria-label={kind === "online" ? "在线用户与在线设备历史" : "历史趋势图"}
    >
      {kind === "online" ? (
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ left: -14, right: 8, top: 8 }}
        >
          {common}
          <Line
            dataKey="users"
            stroke="var(--color-users)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="devices"
            stroke="var(--color-devices)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      ) : kind === "bar" || kind === "pulls" ? (
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ left: -14, right: 8, top: 8 }}
        >
          {common}
          <Bar
            dataKey={kind === "pulls" ? "pulls" : "download"}
            stackId="flow"
            fill={
              kind === "pulls" ? "var(--color-pulls)" : "var(--color-download)"
            }
            radius={[0, 0, 3, 3]}
            isAnimationActive={false}
          />
          <Bar
            dataKey={kind === "pulls" ? "failed" : "upload"}
            stackId="flow"
            fill={
              kind === "pulls" ? "var(--color-failed)" : "var(--color-upload)"
            }
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      ) : (
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ left: -14, right: 8, top: 8 }}
        >
          {common}
          <Area
            dataKey="download"
            type="monotone"
            fill="var(--color-download)"
            fillOpacity={0.14}
            stroke="var(--color-download)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            dataKey="upload"
            type="monotone"
            fill="var(--color-upload)"
            fillOpacity={0.14}
            stroke="var(--color-upload)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      )}
    </ChartContainer>
  );
}
export function PlatformChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const config = Object.fromEntries(
    data.map((item, i) => [
      item.name,
      { label: item.name, color: `var(--chart-${(i % 5) + 1})` },
    ]),
  ) satisfies ChartConfig;
  if (!total) return <UsageEmpty />;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <ChartContainer
        config={config}
        className="mx-auto aspect-square h-56 w-full"
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={<ChartTooltipContent nameKey="name" hideLabel />}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={3}
            isAnimationActive={false}
          >
            {data.map((item, i) => (
              <Cell key={item.name} fill={`var(--chart-${(i % 5) + 1})`} />
            ))}
            <Label
              position="center"
              value={total + " 次"}
              className="fill-foreground text-xl font-semibold"
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex flex-col gap-3">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: `var(--chart-${(i % 5) + 1})` }}
            />
            <span className="flex-1">{item.name}</span>
            <span className="font-mono text-xs">
              {item.value} · {((item.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function RankingChart({
  data,
  unit = "GiB",
  valueLabel = "原始流量",
}: {
  data: { name: string; value: number }[];
  unit?: string;
  valueLabel?: string;
}) {
  if (!data.length) return <UsageEmpty />;
  return (
    <ChartContainer
      config={{ value: { label: valueLabel, color: "var(--chart-2)" } }}
      className="aspect-auto h-60 w-full"
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 0, right: 16 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          allowDecimals={unit !== "个"}
          minTickGap={24}
          tickFormatter={(value) => formatUsageValue(Number(value), unit)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            String(v).includes("@")
              ? String(v).split("@")[0]
              : String(v).length > 13
                ? String(v).slice(0, 11) + "…"
                : v
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-mono">
                  {formatUsageValue(Number(value), unit)}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 4, 4, 0]}
          barSize={22}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
