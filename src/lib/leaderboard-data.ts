import {
  inRange,
  makeUsagePreview,
  usageNodes,
  usagePreviewEnabled,
  type UsageRange,
} from "@/lib/usage-data";

export type DeviceObservation = {
  userId: string;
  deviceId?: string | null;
  ip: string;
  firstSeenAt: number;
};
export type RankEntry = {
  id: string;
  label: string;
  value: number;
  rank: number;
  upload: number;
  download: number;
  identified: number;
  ipFallback: number;
  isSelf?: boolean;
  hint: string;
};

/** A stable device ID wins over IP; unidentified sources fall back to an IP key. */
export function countRecordedDevices(observations: DeviceObservation[]) {
  const perUser = new Map<string, { devices: Set<string>; ips: Set<string> }>();
  for (const item of observations) {
    const group = perUser.get(item.userId) ?? {
      devices: new Set<string>(),
      ips: new Set<string>(),
    };
    if (item.deviceId?.trim()) group.devices.add(item.deviceId.trim());
    else if (item.ip.trim()) group.ips.add(item.ip.trim().toLowerCase());
    perUser.set(item.userId, group);
  }
  return new Map(
    [...perUser].map(([id, value]) => [
      id,
      {
        identified: value.devices.size,
        ipFallback: value.ips.size,
        total: value.devices.size + value.ips.size,
      },
    ]),
  );
}
export function maskRankingEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "匿名用户";
  const local = email.slice(0, at);
  return (
    local.slice(0, Math.min(2, Math.max(1, local.length - 1))) +
    "***" +
    (local.length > 3 ? local.slice(-1) : "") +
    email.slice(at)
  );
}
export function orderRanking(rows: Omit<RankEntry, "rank">[]): RankEntry[] {
  const sorted = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.value !== sorted[index - 1].value) rank = index + 1;
    return { ...row, rank };
  });
}

/** User preview masks emails; admin preview permits full emails. Neither includes raw IP/device IDs. */
export function makeLeaderboardPreview(
  range: UsageRange,
  now: number,
  devicePeriodOnly = false,
  admin = false,
) {
  if (!usagePreviewEnabled)
    return { users: [], nodes: [], devices: [], sampledAt: now };
  const data = makeUsagePreview(false, now);
  const users = [
    ...new Map(data.devices.map((item) => [item.userId, item.user])).entries(),
  ];
  const traffic = data.traffic.filter((item) => inRange(item.at, range, now));
  const observations: DeviceObservation[] = data.events
    .filter((item) => item.kind === "connection")
    .map((item) => ({
      userId: item.userId,
      deviceId:
        data.devices.find((device) => device.id === item.deviceId)?.kind ===
        "unknown"
          ? null
          : item.deviceId,
      ip: item.ip,
      firstSeenAt: item.at,
    }));
  // Retired/offline identities remain in the cumulative history leaderboard.
  users.forEach(([userId], index) => {
    for (let n = 0; n < 2 + (index % 4); n++) {
      const firstSeenAt = now - (n + 1) * 8 * 86400000;
      const deviceId = n % 3 === 0 ? null : "retired-" + userId + "-" + n;
      const ip = "192.0.2." + (40 + index * 10 + n);
      observations.push({ userId, deviceId, ip, firstSeenAt });
      observations.push({
        userId,
        deviceId,
        ip: deviceId ? "198.51.100." + (60 + index * 10 + n) : ip,
        firstSeenAt,
      });
    }
  });
  // A device may first appear on several nodes/IPs; date filtering uses its
  // earliest appearance across the complete retained history, not each event.
  const firstObservations = new Map<string, DeviceObservation>();
  for (const item of observations) {
    const identity = item.deviceId?.trim()
      ? "device:" + item.deviceId.trim()
      : "ip:" + item.ip.trim().toLowerCase();
    const key = JSON.stringify([item.userId, identity]);
    const previous = firstObservations.get(key);
    if (!previous || item.firstSeenAt < previous.firstSeenAt)
      firstObservations.set(key, item);
  }
  const deviceCounts = countRecordedDevices(
    [...firstObservations.values()].filter(
      (item) => !devicePeriodOnly || inRange(item.firstSeenAt, range, now),
    ),
  );
  const empty = { upload: 0, download: 0, identified: 0, ipFallback: 0 };
  const totals = (rows: typeof traffic) =>
    rows.reduce(
      (sum, row) => ({
        upload: sum.upload + row.upload,
        download: sum.download + row.download,
      }),
      { upload: 0, download: 0 },
    );
  return {
    users: orderRanking(
      users.map(([id, email]) => {
        const values = totals(traffic.filter((row) => row.userId === id));
        return {
          ...empty,
          ...values,
          id,
          label: admin ? email : maskRankingEmail(email),
          value: values.upload + values.download,
          isSelf: id === "1",
          hint: "原始代理流量",
        };
      }),
    ),
    nodes: orderRanking(
      usageNodes.map((node) => {
        const values = totals(traffic.filter((row) => row.nodeId === node.id));
        return {
          ...empty,
          ...values,
          id: node.id,
          label: node.name,
          value: values.upload + values.download,
          hint: "节点原始代理流量",
        };
      }),
    ),
    devices: orderRanking(
      users.map(([id, email]) => {
        const values = deviceCounts.get(id) ?? {
          total: 0,
          identified: 0,
          ipFallback: 0,
        };
        return {
          ...empty,
          id,
          label: admin ? email : maskRankingEmail(email),
          value: values.total,
          identified: values.identified,
          ipFallback: values.ipFallback,
          isSelf: id === "1",
          hint: devicePeriodOnly
            ? "所选日期首次记录"
            : "累计记录，包含离线设备",
        };
      }),
    ),
    sampledAt: now,
  };
}
