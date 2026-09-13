import { useAdminApi } from "@/lib/auth";
import { useSyncExternalStore } from "react";
import type { AdminApiClient } from "@/lib/api";
import { usagePreviewEnabled } from "@/lib/usage-data";
export type OnlineCount = {
  users: number;
  devices: number;
  ips: number;
  sampled_at: number;
};
type OnlineData = {
  enabled: boolean;
  nodes: Record<string, OnlineCount>;
  machines: Record<string, OnlineCount>;
};
const stores = new WeakMap<AdminApiClient, ReturnType<typeof createStore>>();
function createStore(api: AdminApiClient) {
  let data: OnlineData | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const fetchData = (initial = false) => {
    if (usagePreviewEnabled || controller || (!initial && document.hidden))
      return;
    const request = new AbortController();
    controller = request;
    api
      .get<OnlineData>("usage/online", undefined, request.signal)
      .then((result) => {
        if (request.signal.aborted) return;
        data = result;
        listeners.forEach((listener) => listener());
      })
      .catch(() => {
        if (request.signal.aborted) return;
        data = null;
        listeners.forEach((listener) => listener());
      })
      .finally(() => {
        if (controller === request) controller = null;
      });
  };
  const visible = () => {
    if (!document.hidden) fetchData();
  };
  return {
    getSnapshot: () => data,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        fetchData(true);
        timer = setInterval(() => fetchData(), 15000);
        document.addEventListener("visibilitychange", visible);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(timer);
          controller?.abort();
          controller = null;
          document.removeEventListener("visibilitychange", visible);
        }
      };
    },
  };
}
export function useOnlineCounts() {
  const api = useAdminApi();
  let store = stores.get(api);
  if (!store) {
    store = createStore(api);
    stores.set(api, store);
  }
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}
export function useUsageApi() {
  return useAdminApi();
}
