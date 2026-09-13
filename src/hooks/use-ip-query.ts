import { useEffect, useState } from "react";
import { useUsageApi } from "@/lib/usage-api";
import { usagePreviewEnabled } from "@/lib/usage-data";
import type { IpRow, IpSample } from "@/lib/ip-traffic-data";

export type IpResponse = {
  collection_complete: boolean;
  rows: IpRow[];
  sources: IpRow[];
  trend: IpSample[];
  total_rows: number;
  page: number;
  per_page: number;
  summary: {
    completeSamples: number;
    totalSamples: number;
    total: number;
    measured: number;
    missing: number;
    ips: number;
    users: number;
    nodes: number;
    sources: number;
  };
};
export function useIpQuery(
  query: Record<string, string | number | boolean | undefined>,
  enabled = true,
) {
  const api = useUsageApi();
  const key = JSON.stringify(query);
  const [result, setResult] = useState<{
    key: string;
    data: IpResponse | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  useEffect(() => {
    if (usagePreviewEnabled || !enabled) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async (initial = false) => {
      if (busy || (!initial && document.hidden)) return;
      busy = true;
      try {
        const data = await api.get<IpResponse>(
          "usage/ip",
          JSON.parse(key),
          controller.signal,
        );
        if (!controller.signal.aborted) setResult({ key, data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error: error instanceof Error ? error.message : "IP 流量查询失败",
          });
      } finally {
        busy = false;
      }
    };
    const timer = setTimeout(() => refresh(true), 250);
    const interval = setInterval(() => refresh(), 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [api, key, enabled]);
  return result.key === key && enabled
    ? result
    : { key, data: null, error: "" };
}
