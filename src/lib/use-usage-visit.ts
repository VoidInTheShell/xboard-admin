import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useUsageApi } from "@/lib/usage-api";
import { usagePreviewEnabled } from "@/lib/usage-data";

export function useUsageVisit() {
  const api = useUsageApi();
  const { pathname } = useLocation();
  const previous = useRef("");
  useEffect(() => {
    if (usagePreviewEnabled || previous.current === pathname) return;
    previous.current = pathname;
    // Browser UA/client hints accompany this request. Never send query strings.
    void api.post("usage/visit", { path: pathname }).catch(() => {});
  }, [api, pathname]);
}
