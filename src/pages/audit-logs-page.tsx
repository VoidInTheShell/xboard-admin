import * as React from "react";
import { Eye, RefreshCw, Search } from "lucide-react";
import {
  ResourceError,
  ResourceTableLoading,
} from "@/components/control-plane/resource-states";
import { ResourcePagination } from "@/components/control-plane/resource-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChoiceField } from "@/components/logs/log-settings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminApi } from "@/lib/auth";
import { useAdminQuery } from "@/hooks/use-admin-query";

type AuditEntry = {
  id: number;
  admin_id?: number;
  actor_type?: "admin" | "mcp";
  mcp_key_id?: number | null;
  request_id?: string | null;
  client_id?: string | null;
  action?: string;
  status_code?: number;
  method?: string;
  uri?: string;
  request_data?: unknown;
  ip?: string;
  created_at?: number | string;
  admin?: { id?: number; email?: string } | null;
  mcp_key?: { id?: number; name?: string; token_suffix?: string } | null;
};

type AuditResponse = { data: AuditEntry[]; total: number };

export function AuditLogsPage({ embedded = false }: { embedded?: boolean }) {
  const api = useAdminApi();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const emptyFilters = { actor: "all", executor: "", action: "", from: "", to: "" };
  const [draftFilters, setDraftFilters] = React.useState(emptyFilters);
  const [filters, setFilters] = React.useState(emptyFilters);
  const [selected, setSelected] = React.useState<AuditEntry | null>(null);
  const pageSize = 20;
  const query = React.useCallback(
    (signal: AbortSignal) =>
      api.get<AuditResponse>(
        "system/getAuditLog",
        {
          current: page,
          page_size: pageSize,
          keyword,
          actor_type: filters.actor === "all" ? undefined : filters.actor,
          admin_id:
            filters.actor !== "mcp" ? filters.executor || undefined : undefined,
          mcp_key_id:
            filters.actor === "mcp" ? filters.executor || undefined : undefined,
          action: filters.action || undefined,
          from: filters.from ? Math.floor(new Date(`${filters.from}T00:00:00+08:00`).getTime()/1000) : undefined,
          to: filters.to ? Math.floor(new Date(`${filters.to}T23:59:59+08:00`).getTime()/1000) : undefined,
        },
        signal,
      ),
    [api, keyword, page, filters],
  );
  const logs = useAdminQuery(query);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    if (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) return;
    setPage(1);
    setKeyword(search.trim());
    setFilters({ ...draftFilters, action: draftFilters.action.trim() });
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        embedded={embedded}
        title="审计日志"
        description="查看管理员和 MCP 的执行者、动作、来源与时间。"
        action={
          <Button
            variant="outline"
            disabled={logs.refreshing}
            onClick={logs.reload}
          >
            <RefreshCw
              className={
                logs.refreshing
                  ? "animate-spin motion-reduce:animate-none"
                  : undefined
              }
              data-icon="inline-start"
              aria-hidden="true"
            />
            刷新
          </Button>
        }
      />
      {logs.error ? (
        <ResourceError
          title="审计日志读取失败"
          message={logs.error}
          onRetry={logs.reload}
        />
      ) : null}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <form
          className="flex flex-col gap-4 border-b p-4"
          onSubmit={applySearch}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ChoiceField
              id="audit-actor"
              label="执行者类型"
              value={draftFilters.actor}
              onChange={(actor) =>
                setDraftFilters({ ...draftFilters, actor, executor: "" })
              }
              options={[
                ["all", "全部执行者"],
                ["admin", "管理员"],
                ["mcp", "MCP Agent"],
              ]}
            />
            <Field>
              <FieldLabel htmlFor="audit-executor">
                {draftFilters.actor === "mcp" ? "MCP 密钥 ID" : "管理员 ID"}
              </FieldLabel>
              <Input
                id="audit-executor"
                type="number"
                min={1}
                step={1}
                placeholder="全部"
                value={draftFilters.executor}
                onChange={(event) =>
                  setDraftFilters({
                    ...draftFilters,
                    executor: event.target.value,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-action">动作</FieldLabel>
              <Input
                id="audit-action"
                placeholder="全部；或输入完整动作名称"
                value={draftFilters.action}
                onChange={(event) =>
                  setDraftFilters({
                    ...draftFilters,
                    action: event.target.value,
                  })
                }
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="audit-log-search">请求搜索</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="audit-log-search"
                  name="audit-log-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索 URI 或请求字段…"
                />
              </InputGroup>
            </Field>
            <div className="flex items-end gap-2">
              <Button variant="outline" type="submit">
                筛选
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setSearch("");
                  setKeyword("");
                  setDraftFilters(emptyFilters);
                  setFilters(emptyFilters);
                  setPage(1);
                }}
              >
                重置
              </Button>
            </div>
            <Field><FieldLabel htmlFor="audit-from">开始日期</FieldLabel><Input id="audit-from" type="date" value={draftFilters.from} onChange={e => setDraftFilters({...draftFilters, from: e.target.value})} /></Field>
            <Field><FieldLabel htmlFor="audit-to">结束日期</FieldLabel><Input id="audit-to" type="date" value={draftFilters.to} min={draftFilters.from || undefined} onChange={e => setDraftFilters({...draftFilters, to: e.target.value})} aria-invalid={Boolean(draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to)} /></Field>
          </FieldGroup>
          {draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to && <p role="alert" className="text-sm text-destructive">结束日期不能早于开始日期。</p>}
          <p className="text-xs text-muted-foreground">
            本页展示时间：
            {logs.loading
              ? "加载中"
              : logs.data?.data.length
                ? `${formatTime(logs.data.data[logs.data.data.length - 1].created_at)} 至 ${formatTime(logs.data.data[0].created_at)} · UTC+8`
                : "暂无记录"}
          </p>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">执行者</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>请求</TableHead>
              <TableHead>来源 IP</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">详情</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.loading ? (
              <ResourceTableLoading columns={6} />
            ) : logs.data?.data.length ? (
              logs.data.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-1.5 font-medium">
                      {entry.actor_type === "mcp" ? (
                        <Badge variant="outline">Agent</Badge>
                      ) : null}
                      {entry.actor_type === "mcp"
                        ? `MCP · ${entry.mcp_key?.name ?? `Key #${entry.mcp_key_id ?? "—"}`}`
                        : (entry.admin?.email ??
                          `管理员 #${entry.admin_id ?? "—"}`)}
                    </div>
                    <span className="font-data text-[11px] text-muted-foreground">
                      {entry.actor_type === "mcp" && entry.mcp_key?.token_suffix
                        ? `xbmcp_••••${entry.mcp_key.token_suffix} · `
                        : ""}
                      日志 #{entry.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {entry.action || "管理操作"}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{(entry.status_code ?? 200) >= 400 ? `失败 · ${entry.status_code}` : "成功"}</div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="mr-2 font-data text-[11px] font-semibold">
                      {entry.method || "—"}
                    </span>
                    <span className="font-data text-xs text-muted-foreground">
                      {entry.uri || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    {entry.ip || "—"}
                  </TableCell>
                  <TableCell className="font-data text-xs text-muted-foreground">
                    {formatTime(entry.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`查看日志 ${entry.id}`}
                      onClick={() => setSelected(entry)}
                    >
                      <Eye aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-40 text-center text-sm text-muted-foreground"
                >
                  没有符合条件的审计记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ResourcePagination
          page={page}
          pageSize={pageSize}
          total={logs.data?.total ?? 0}
          disabled={logs.loading || logs.refreshing}
          loading={logs.loading}
          onPageChange={setPage}
        />
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>审计日志 #{selected?.id}</DialogTitle>
            <DialogDescription>
              请求数据只显示字段路径，不展示原始值。
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">执行者</dt>
            <dd>
              {selected?.actor_type === "mcp"
                ? `MCP · ${selected.mcp_key?.name ?? `Key #${selected.mcp_key_id ?? "—"}`}`
                : (selected?.admin?.email ?? "—")}
            </dd>
            <dt className="text-muted-foreground">所属管理员</dt>
            <dd>{selected?.admin?.email ?? "—"}</dd>
            <dt className="text-muted-foreground">动作</dt>
            <dd>{selected?.action ?? "—"}</dd>
            <dt className="text-muted-foreground">请求</dt>
            <dd className="break-all font-data text-xs">
              {selected?.method ?? "—"} {selected?.uri ?? "—"}
            </dd>
            <dt className="text-muted-foreground">请求 ID</dt>
            <dd className="break-all font-data text-xs">
              {selected?.request_id ?? "—"}
            </dd>
            <dt className="text-muted-foreground">来源 IP</dt>
            <dd className="font-data">{selected?.ip ?? "—"}</dd>
            <dt className="text-muted-foreground">请求字段</dt>
            <dd className="flex flex-wrap gap-1">
              {requestKeys(selected?.request_data).length
                ? requestKeys(selected?.request_data).map((key) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="font-data text-[10px]"
                    >
                      {key}
                    </Badge>
                  ))
                : "无可展示字段"}
            </dd>
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function requestKeys(value: unknown) {
  if (!value) return [];
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return ["非结构化内容（已隐藏）"];
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return [];
  return Object.keys(parsed as Record<string, unknown>);
}

function formatTime(value: AuditEntry["created_at"]) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Shanghai",
      }).format(date);
}
