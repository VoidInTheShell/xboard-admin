import {
  dateInput,
  usagePreviewEnabled,
  type UsageRange,
} from "@/lib/usage-data";

// Separate collection contracts: host NIC counters are not user/proxy counters.
// Values in this explicit DEV preview are GiB deltas, never cumulative counters.
export type ServerTrafficSample = {
  at: number;
  serverId: string;
  resourceId: string;
  incoming: number;
  outgoing: number;
};
export const trafficInterfaces = [
  { id: "1:eth0", serverId: "1", name: "eth0", server: "Hong Kong Edge" },
  { id: "2:ens3", serverId: "2", name: "ens3", server: "Tokyo Edge" },
  { id: "3:eth0", serverId: "3", name: "eth0", server: "Los Angeles Edge" },
];
export const trafficInstances = [
  {
    id: "hkg-xray",
    serverId: "1",
    name: "hkg-xray",
    runtime: "Xray",
    nodeIds: ["101"],
    server: "Hong Kong Edge",
  },
  {
    id: "hkg-sing-box",
    serverId: "1",
    name: "hkg-sing-box",
    runtime: "sing-box",
    nodeIds: ["102"],
    server: "Hong Kong Edge",
  },
  {
    id: "nrt-xray",
    serverId: "2",
    name: "nrt-xray",
    runtime: "Xray",
    nodeIds: ["201"],
    server: "Tokyo Edge",
  },
  {
    id: "lax-sing-box",
    serverId: "3",
    name: "lax-sing-box",
    runtime: "sing-box",
    nodeIds: ["301"],
    server: "Los Angeles Edge",
  },
];
export function makeServerTrafficPreview(now: number) {
  const nic: ServerTrafficSample[] = [],
    instances: ServerTrafficSample[] = [];
  if (!usagePreviewEnabled) return { nic, instances };
  const hour = Math.floor(now / 3600000) * 3600000;
  for (let h = 0; h < 45 * 24; h++) {
    const at = hour - h * 3600000;
    trafficInterfaces.forEach((resource, i) => {
      const wave = 0.65 + Math.abs(Math.sin(h / 7 + i)) * 1.5;
      nic.push({
        at,
        serverId: resource.serverId,
        resourceId: resource.id,
        incoming: wave * (1.4 + i * 0.3),
        outgoing: wave * (1.7 + i * 0.5),
      });
    });
    trafficInstances.forEach((resource, i) => {
      const wave = 0.18 + Math.abs(Math.sin(h / 5 + i)) * 0.8;
      instances.push({
        at,
        serverId: resource.serverId,
        resourceId: resource.id,
        incoming: wave * (0.07 + i * 0.02),
        outgoing: wave * (0.85 + i * 0.25),
      });
    });
  }
  return { nic, instances };
}
export function sumServerTraffic(samples: ServerTrafficSample[]) {
  return samples.reduce(
    (sum, row) => ({
      incoming: sum.incoming + row.incoming,
      outgoing: sum.outgoing + row.outgoing,
      total: sum.total + row.incoming + row.outgoing,
    }),
    { incoming: 0, outgoing: 0, total: 0 },
  );
}
export function serverTrafficSeries(
  samples: ServerTrafficSample[],
  range: UsageRange,
) {
  const buckets = new Map<
    string,
    { date: string; upload: number; download: number }
  >();
  for (const row of samples) {
    const date =
      dateInput(row.at) +
      (range.preset === "24h"
        ? " " + new Date(row.at + 8 * 3600000).toISOString().slice(11, 16)
        : "");
    const bucket = buckets.get(date) ?? { date, upload: 0, download: 0 };
    bucket.upload += row.incoming;
    bucket.download += row.outgoing;
    buckets.set(date, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}
