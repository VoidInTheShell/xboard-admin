import {
  dateInput,
  rangeBounds,
  usageNodes,
  type UsageRange,
} from "@/lib/usage-data";

export type IpSample = {
  at: number;
  userId: string;
  user: string;
  ip: string;
  nodeId: string;
  node: string;
  serverId: string;
  upload: number | null;
  download: number | null;
};
export type IpRow = {
  key: string;
  userId: string;
  user: string;
  ip: string;
  nodes: string[];
  nodeIds: string[];
  upload: number;
  download: number;
  total: number;
  first: number;
  last: number;
  measured: number;
  missing: number;
};
export type IpGrouping = "connection" | "source";
export const ipPreviewUsers = [
  { id: "1", email: "test@test.user" },
  { id: "2", email: "alex@example.com" },
  { id: "3", email: "chen@example.com" },
  { id: "4", email: "lin@example.com" },
  { id: "5", email: "river@example.com" },
  { id: "6", email: "sky@example.com" },
];
/** Independent synthetic per-source observations. Never apportion user totals. */
export function makeIpPreview(now: number, selfOnly: boolean): IpSample[] {
  const result: IpSample[] = [];
  for (const [u, user] of ipPreviewUsers.entries()) {
    if (selfOnly && user.id !== "1") continue;
    const ips = [
      "203.0.113.18",
      `198.51.100.${31 + u}`,
      `2001:db8:${u + 1}::8`,
      `192.0.2.${70 + u}`,
    ];
    for (let hour = 0; hour < 32 * 24; hour++) {
      for (let source = 0; source < ips.length; source++) {
        // A historical source stopped appearing two days ago.
        if (source === 3 && hour < 48) continue;
        if ((hour + source + u) % 5 === 0) continue;
        const node =
          usageNodes[(Math.floor(hour / 9) + source + u) % usageNodes.length];
        const missing = source === 2 && hour % 9 === 0;
        const scale = (1 + u * 0.4) * (4 - source);
        result.push({
          at: now - hour * 3600000,
          userId: user.id,
          user: user.email,
          ip: ips[source],
          nodeId: node.id,
          node: node.name,
          serverId: node.serverId,
          upload: missing
            ? null
            : Math.round(
                (0.012 + ((hour * 7 + source) % 17) / 300) * scale * 10000,
              ) / 10000,
          download: missing
            ? null
            : Math.round(
                (0.1 + ((hour * 11 + source) % 29) / 40) * scale * 10000,
              ) / 10000,
        });
      }
    }
  }
  return result;
}
export function summarizeIps(
  samples: IpSample[],
  grouping: IpGrouping,
): IpRow[] {
  const rows = new Map<string, IpRow>();
  for (const s of samples) {
    const key = JSON.stringify([
      s.userId,
      s.ip,
      grouping === "connection" ? s.nodeId : "",
    ]);
    const row = rows.get(key) ?? {
      key,
      userId: s.userId,
      user: s.user,
      ip: s.ip,
      nodes: [],
      nodeIds: [],
      upload: 0,
      download: 0,
      total: 0,
      first: s.at,
      last: s.at,
      measured: 0,
      missing: 0,
    };
    if (!row.nodeIds.includes(s.nodeId)) {
      row.nodeIds.push(s.nodeId);
      row.nodes.push(s.node);
    }
    row.first = Math.min(row.first, s.at);
    row.last = Math.max(row.last, s.at);
    if (s.upload === null || s.download === null) row.missing++;
    else {
      row.upload += s.upload;
      row.download += s.download;
      row.measured++;
    }
    row.total = row.upload + row.download;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.total - a.total || a.key.localeCompare(b.key),
  );
}
export function ipTimeSeries(
  samples: IpSample[],
  range: UsageRange,
  now: number,
) {
  const [from, to] = rangeBounds(range, now);
  const hourly = range.preset === "24h" && to - from <= 86400000;
  const rows = new Map<
    string,
    { date: string; upload: number; download: number; measured: number }
  >();
  for (const sample of samples) {
    const date = hourly
      ? new Date(sample.at).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false,
        })
      : dateInput(sample.at);
    const row = rows.get(date) ?? { date, upload: 0, download: 0, measured: 0 };
    if (sample.upload !== null && sample.download !== null) {
      row.upload += sample.upload;
      row.download += sample.download;
      row.measured++;
    }
    rows.set(date, row);
  }
  return [...rows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      upload: r.measured ? r.upload : null,
      download: r.measured ? r.download : null,
    }));
}
