import { formatUsageValue } from "@/lib/traffic-format";
export const usagePreviewEnabled =
  import.meta.env.DEV && import.meta.env.VITE_USAGE_PREVIEW === "true";
export type UsageScope = {
  userId?: string;
  serverId?: string;
  nodeId?: string;
  deviceId?: string;
};
export type UsageRange = {
  preset: "24h" | "7d" | "1m" | "custom";
  from: string;
  to: string;
};
export type UsageDevice = {
  id: string;
  userId: string;
  user: string;
  platform: string;
  kind: "desktop" | "phone" | "router" | "unknown";
  client: string;
  ip: string;
  location: string;
  nodeId: string;
  node: string;
  serverId: string;
  server: string;
  identification: string;
  downloadRate: number | null;
  uploadRate: number | null;
  connectedAt: number;
  sampledAt: number;
  risk: string | null;
};
export type TrafficSample = {
  at: number;
  deviceId: string;
  deviceKnown: boolean;
  userId: string;
  serverId: string;
  nodeId: string;
  upload: number;
  download: number;
  billed: number;
};
export type UsageEvent = {
  id: string;
  at: number;
  kind: "panel" | "connection" | "subscription";
  deviceId: string;
  userId: string;
  user: string;
  serverId?: string;
  nodeId?: string;
  node?: string;
  platform: string;
  client: string;
  ip: string;
  location: string;
  result: string;
  risk: string | null;
  action?: string;
  path?: string;
  duration?: number;
};
export type UsageDataset = {
  reviewed?: string[];
  security?: {
    newIps: number;
    connectionIps: number;
    connections: number;
    failed: number;
    totalSignals: number;
    shownSignals: number;
  };
  subscriptionStats?: { pulls: number; ips: number };
  ranks?: Record<string, { name: string; value: number }[]>;
  enabled?: boolean;
  nodes?: typeof usageNodes;
  users?: { id: number; email: string }[];
  onlineHistory?: { bucket: number; users: number; devices: number }[];
  subscriptionDays?: { day: number; result: string; count: number }[];
  subscriptionPlatforms?: { platform: string; count: number }[];
  devices: UsageDevice[];
  traffic: TrafficSample[];
  events: UsageEvent[];
  sampledAt: number;
};
export const usageNodes = [
  { id: "101", name: "香港 · HKG 01", serverId: "1", server: "Hong Kong Edge" },
  { id: "102", name: "香港 · HKG 02", serverId: "1", server: "Hong Kong Edge" },
  { id: "201", name: "东京 · NRT 01", serverId: "2", server: "Tokyo Edge" },
  {
    id: "301",
    name: "洛杉矶 · LAX 01",
    serverId: "3",
    server: "Los Angeles Edge",
  },
];
export function dateInput(at: number) {
  return new Date(at + 8 * 3600000).toISOString().slice(0, 10);
}
export function defaultRange(now = Date.now()): UsageRange {
  return {
    preset: "7d",
    from: dateInput(now - 6 * 86400000),
    to: dateInput(now),
  };
}
export function rangeBounds(range: UsageRange, now: number): [number, number] {
  if (range.preset === "custom")
    return [
      Date.parse(range.from + "T00:00:00+08:00"),
      Math.min(now, Date.parse(range.to + "T23:59:59.999+08:00")),
    ];
  return [now - { "24h": 1, "7d": 7, "1m": 30 }[range.preset] * 86400000, now];
}
export function matchesScope(item: UsageScope, scope: UsageScope) {
  return (Object.keys(scope) as (keyof UsageScope)[]).every(
    (key) => !scope[key] || scope[key] === item[key],
  );
}
export function inRange(at: number, range: UsageRange, now: number) {
  const [from, to] = rangeBounds(range, now);
  return at >= from && at <= to;
}
export function formatGiB(value: number) {
  return formatUsageValue(value);
}
export function formatSpeed(value: number | null) {
  return value === null ? "—" : formatUsageValue(value, "MiB/s");
}
export function formatTime(at: number) {
  return new Date(at).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}
export function makeUsagePreview(
  selfOnly = false,
  now = Date.now(),
): UsageDataset {
  const users = selfOnly
    ? ["test@test.user"]
    : [
        "test@test.user",
        "alex@example.com",
        "chen@example.com",
        "lin@example.com",
        "river@example.com",
        "sky@example.com",
      ];
  const platforms = [
    ["Windows 11", "desktop", "Clash Verge Rev", "客户端上报"],
    ["iOS 18", "phone", "Shadowrocket", "客户端上报"],
    ["macOS", "desktop", "Surge", "客户端上报"],
    ["OpenWrt", "router", "Mihomo", "客户端上报"],
    ["Android", "phone", "FlClash", "客户端上报"],
    ["未识别", "unknown", "未识别客户端", "未提供设备标识"],
  ] as const;
  const devices: UsageDevice[] = users.flatMap((user, userIndex) =>
    Array.from({ length: userIndex === 0 ? 3 : 2 }, (_, index) => {
      const deviceIndex = userIndex * 2 + index;
      const [platform, kind, client, identification] =
        platforms[deviceIndex % platforms.length];
      const node = usageNodes[deviceIndex % usageNodes.length];
      return {
        id: `device-${userIndex}-${index}`,
        userId: String(userIndex + 1),
        user,
        platform,
        kind,
        client,
        identification,
        ip: `${deviceIndex % 2 ? "198.51.100" : "203.0.113"}.${20 + deviceIndex}`,
        location:
          deviceIndex === 5
            ? "荷兰 · 阿姆斯特丹"
            : deviceIndex % 3 === 0
              ? "中国 · 上海"
              : "中国 · 北京",
        nodeId: node.id,
        node: node.name,
        serverId: node.serverId,
        server: node.server,
        downloadRate: deviceIndex === 5 ? null : 0.8 + deviceIndex * 1.17,
        uploadRate: deviceIndex === 5 ? null : 0.06 + deviceIndex * 0.083,
        connectedAt: now - (index + 1) * 3120000,
        sampledAt: now - (deviceIndex === 5 ? 180000 : 4000),
        risk:
          deviceIndex === 5 ? "来源变化" : deviceIndex === 2 ? "新 IP" : null,
      };
    }),
  );
  const traffic: TrafficSample[] = [];
  const events: UsageEvent[] = [];
  const hour = Math.floor(now / 3600000) * 3600000;
  for (let h = 0; h < 45 * 24; h++) {
    for (let d = 0; d < devices.length; d++) {
      if (
        h > 0 &&
        ((h + d) % 5 === 0 || (Math.floor(h / 24) * 7 + d * 3) % 17 > 11)
      )
        continue;
      const device = devices[d];
      const at = hour - h * 3600000;
      if (at < now - (d + 1) * 3 * 86400000) continue;
      const wave =
        (Math.abs(Math.sin((h + d * 11) / 5)) * 0.38 + 0.07) *
        (0.65 + Math.abs(Math.sin(Math.floor(h / 24) * 0.8)) * 0.7);
      const upload = Number((wave * 0.14).toFixed(4));
      const download = Number((wave * (1 + d * 0.18)).toFixed(4));
      traffic.push({
        at,
        deviceId: device.id,
        deviceKnown: device.kind !== "unknown",
        userId: device.userId,
        serverId: device.serverId,
        nodeId: device.nodeId,
        upload,
        download,
        billed: (upload + download) * (device.nodeId === "201" ? 1.5 : 1),
      });
      if (h % 8 !== d % 8) continue;
      const kind = (["panel", "connection", "subscription"] as const)[
        Math.floor(h / 8 + d) % 3
      ];
      if (kind === "connection") continue;
      const action =
        kind === "panel" ? (h % 3 === 0 ? "登录" : "页面访问") : "订阅拉取";
      const risk =
        h < 24 && d === 2 ? "新 IP" : h < 48 && d === 5 ? "来源变化" : null;
      events.push({
        id: `${kind}-${h}-${d}`,
        at: at - 180000,
        kind,
        deviceId: device.id,
        userId: device.userId,
        user: device.user,
        action,
        ...(kind === "panel"
          ? {
              path:
                action === "登录"
                  ? "/login"
                  : ["/dashboard", "/clients", "/usage"][h % 3],
            }
          : {}),
        platform: device.platform,
        client:
          kind === "panel" ? (d % 2 ? "Safari" : "Chrome") : device.client,
        ip: device.ip,
        location: device.location,
        result:
          kind === "panel" && action === "登录" && h % 13 === 0
            ? "登录失败"
            : kind === "subscription" && h % 17 === 0
              ? "拉取失败"
              : "成功",
        risk,
      });
    }
  }
  const source = devices[2];
  for (let i = 0; i < 12; i++)
    events.push({
      id: "subscription-burst-" + i,
      at: now - (i + 1) * 60000,
      kind: "subscription",
      deviceId: source.id,
      userId: source.userId,
      user: source.user,
      platform: source.platform,
      client: source.client,
      ip: source.ip,
      location: source.location,
      result: "成功",
      risk: "订阅拉取突增",
    });
  // One observation per user/device/IP tuple; repeated proxy connections do not create audit rows.
  devices.forEach((device, index) =>
    events.push({
      id: "first-node-access-" + device.id,
      at: now - (index + 1) * 3 * 86400000,
      kind: "connection",
      deviceId: device.id,
      userId: device.userId,
      user: device.user,
      platform: device.platform,
      client: device.client,
      ip: device.ip,
      location: device.location,
      nodeId: device.nodeId,
      node: device.node,
      serverId: device.serverId,
      result: "首次出现",
      action: device.kind === "unknown" ? "新 IP" : "新设备与 IP",
      risk: device.risk,
    }),
  );
  return {
    devices,
    traffic,
    events: events.sort((a, b) => b.at - a.at),
    sampledAt: now,
  };
}
export function summarizeTraffic(samples: TrafficSample[]) {
  return samples.reduce(
    (sum, item) => ({
      upload: sum.upload + item.upload,
      download: sum.download + item.download,
      billed: sum.billed + item.billed,
    }),
    { upload: 0, download: 0, billed: 0 },
  );
}
export function trafficSeries(
  samples: TrafficSample[],
  range: UsageRange,
  now: number,
) {
  const [from, to] = rangeBounds(range, now);
  const hourly = to - from <= 86400000;
  const groups = new Map<
    string,
    {
      date: string;
      upload: number;
      download: number;
      billed: number;
      users: number;
      devices: number;
    }
  >();
  const hours = new Map<number, { users: Set<string>; devices: Set<string> }>();
  for (const item of samples) {
    const h = Math.floor(item.at / 3600000);
    const counts = hours.get(h) ?? {
      users: new Set<string>(),
      devices: new Set<string>(),
    };
    counts.users.add(item.userId);
    if (item.deviceKnown) counts.devices.add(item.deviceId);
    hours.set(h, counts);
  }
  for (const item of samples) {
    const date = hourly
      ? new Date(item.at).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false,
        }) + ":00"
      : dateInput(item.at);
    const group = groups.get(date) ?? {
      date,
      upload: 0,
      download: 0,
      billed: 0,
      users: 0,
      devices: 0,
    };
    group.upload += item.upload;
    group.download += item.download;
    group.billed += item.billed;
    const counts = hours.get(Math.floor(item.at / 3600000))!;
    group.users = Math.max(group.users, counts.users.size);
    group.devices = Math.max(group.devices, counts.devices.size);
    groups.set(date, group);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function onlineCounts(devices: UsageDevice[], now: number) {
  const fresh = devices.filter((device) => now - device.sampledAt <= 120000);
  return {
    users: new Set(fresh.map((d) => d.userId)).size,
    devices: new Set(
      fresh.map((d) => (d.kind === "unknown" ? d.userId + ":" + d.ip : d.id)),
    ).size,
    ips: new Set(fresh.map((d) => d.ip)).size,
    unknown: new Set(
      fresh
        .filter((d) => d.kind === "unknown")
        .map((d) => d.userId + ":" + d.ip),
    ).size,
  };
}
