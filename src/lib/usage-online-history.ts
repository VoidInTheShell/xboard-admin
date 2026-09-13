import {
  dateInput,
  rangeBounds,
  type UsageDataset,
  type UsageRange,
} from "@/lib/usage-data";

export function onlineHistorySeries(
  rows: NonNullable<UsageDataset["onlineHistory"]>,
  range: UsageRange,
  now: number,
) {
  const [from, to] = rangeBounds(range, now);
  const hourly = to - from <= 86400000;
  const result = new Map<
    string,
    {
      date: string;
      users: number;
      devices: number;
      upload: number;
      download: number;
      billed: number;
    }
  >();
  for (const row of rows) {
    const date = hourly
      ? new Date(row.bucket * 1000).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false,
        }) + ":00"
      : dateInput(row.bucket * 1000);
    const old = result.get(date);
    result.set(date, {
      date,
      users: Math.max(old?.users ?? 0, Number(row.users)),
      devices: Math.max(old?.devices ?? 0, Number(row.devices)),
      upload: 0,
      download: 0,
      billed: 0,
    });
  }
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date));
}
