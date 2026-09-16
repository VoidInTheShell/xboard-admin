const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export function formatTrafficBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  let index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log2(bytes) / 10)));
  // Promote values that would otherwise round to 1,024 of the smaller unit.
  if (index < units.length - 1 && Math.round(bytes / 1024 ** index * 100) / 100 >= 1024) index++;
  const amount = bytes / 1024 ** index;
  return `${amount < 0.01 ? "<0.01" : numberFormat.format(amount)} ${units[index]}`;
}

/** Usage APIs store chart values in GiB and rates in MiB/s. */
export function formatUsageValue(value: number, unit = "GiB"): string {
  if (unit === "GiB") return formatTrafficBytes(value * 1024 ** 3);
  if (unit === "MiB/s") {
    const formatted = formatTrafficBytes(value * 1024 ** 2);
    return formatted === "—" ? formatted : `${formatted}/s`;
  }
  return `${numberFormat.format(value)}${unit ? ` ${unit}` : ""}`;
}
