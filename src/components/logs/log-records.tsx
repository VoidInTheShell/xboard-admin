import { useState, useCallback } from "react";
import { Eye, Info, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChoiceField } from "@/components/logs/log-settings";

import { useAdminApi } from "@/lib/auth";
import { useAdminQuery } from "@/hooks/use-admin-query";
import { ResourcePagination } from "@/components/control-plane/resource-pagination";
type Entry = {
  id: string;
  time: string;
  source: string;
  target: string;
  title: string;
  status: string;
  detail: string;
};
export function LogRecords({ kind }: { kind: "mail" | "runtime" }) {
  const api = useAdminApi();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const mail = kind === "mail";
  const sourceOptions = [
    ["all", mail ? "全部模板" : "全部来源"],
    ...(mail ? ["verify","notify","remindExpire","remindTraffic","mailLogin"] : ["应用","队列","备份","弃用警告"]).map(
      (value) => [value, value],
    ),
  ];
  const statusOptions = [
    ["all", mail ? "全部结果" : "全部级别"],
    ...(mail ? ["成功", "失败"] : ["Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Info", "Debug"]).map(
      (value) => [value, value],
    ),
  ];
  const invalidRange = Boolean(from && to && from > to);
  const query = useAdminQuery(useCallback((signal: AbortSignal) => api.get<{data: Entry[]; total: number; notice?: string}>(`logs/${kind}`, {page, per_page: 20, keyword, source, status, from: from || undefined, to: to || undefined}, signal), [api, kind, page, keyword, source, status, from, to]));
  const entries = invalidRange || query.error ? [] : query.data?.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {mail ? "邮件发送日志" : "面板运行日志"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mail
              ? "查询收件人、模板与发送结果。"
              : "查询应用错误、备份结果和失败队列任务。"}
          </p>
        </div>
        <Button variant="outline" onClick={query.reload} disabled={query.loading || query.refreshing}>刷新</Button>
      </div>
      {query.error && <Alert variant="destructive"><Info /><AlertDescription>{query.error}</AlertDescription></Alert>}
      {query.data?.notice && <Alert><Info /><AlertDescription>{query.data.notice}</AlertDescription></Alert>}
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle>筛选日志</CardTitle>
          <CardDescription>
            时间范围：{from || "不限起始"} 至 {to || "不限结束"} · UTC+8
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="log-keyword">
                {mail ? "收件人 / 主题" : "日志内容"}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="log-keyword"
                  value={keyword}
                  onChange={(event) => { setPage(1); setKeyword(event.target.value); }}
                  placeholder={mail ? "输入邮箱或主题" : "搜索错误或任务"}
                />
              </InputGroup>
            </Field>
            <ChoiceField
              id="log-source"
              label={mail ? "邮件模板" : "日志来源"}
              value={source}
              onChange={(value) => { setPage(1); setSource(value); }}
              options={sourceOptions}
            />
            <ChoiceField
              id="log-status"
              label={mail ? "发送结果" : "日志级别"}
              value={status}
              onChange={(value) => { setPage(1); setStatus(value); }}
              options={statusOptions}
            />
            <Field>
              <FieldLabel htmlFor="log-from">开始日期</FieldLabel>
              <Input
                id="log-from"
                type="date"
                value={from}
                onChange={(event) => { setPage(1); setFrom(event.target.value); }}
              />
            </Field>
            <Field data-invalid={invalidRange}>
              <FieldLabel htmlFor="log-to">结束日期</FieldLabel>
              <Input
                id="log-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => { setPage(1); setTo(event.target.value); }}
                aria-invalid={invalidRange}
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setPage(1);
                  setKeyword("");
                  setSource("all");
                  setStatus("all");
                  setFrom("");
                  setTo("");
                }}
              >
                重置筛选
              </Button>
            </div>
          </FieldGroup>
          {invalidRange && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              结束日期不能早于开始日期。
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>{mail ? "收件人" : "来源 / 存储位置"}</TableHead>
              <TableHead>{mail ? "主题 / 模板" : "日志摘要"}</TableHead>
              <TableHead>{mail ? "结果" : "级别"}</TableHead>
              <TableHead className="text-right">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap font-data text-xs">
                  {entry.time}
                  <div className="mt-1 text-muted-foreground">{entry.id}</div>
                </TableCell>
                <TableCell>
                  {mail ? (
                    entry.target
                  ) : (
                    <>
                      {entry.source}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {entry.target}
                      </div>
                    </>
                  )}
                </TableCell>
                <TableCell className="min-w-40">
                  {entry.title}
                  {mail && (
                    <div className="mt-1 font-data text-xs text-muted-foreground">
                      {entry.source}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      entry.status === "失败" || entry.status === "Error"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`查看 ${entry.id} 详情`}
                    onClick={() => setSelected(entry)}
                  >
                    <Eye />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-36 text-center text-muted-foreground"
                >
                  {query.loading ? "正在读取日志…" : query.error ? "日志读取失败，请重试。" : "没有符合条件的记录。"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {query.loading ? "正在读取…" : `共 ${query.data?.total ?? 0} 条记录`}
        </div>
      </Card>
      <ResourcePagination page={page} pageSize={20} total={query.data?.total ?? 0} onPageChange={setPage} />
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.id} · UTC+8
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm sm:grid-cols-[6rem_1fr]">
            <dt className="text-muted-foreground">时间</dt>
            <dd>{selected?.time}</dd>
            <dt className="text-muted-foreground">
              {mail ? "收件人" : "存储位置"}
            </dt>
            <dd className="min-w-0 break-all">{selected?.target}</dd>
            <dt className="text-muted-foreground">{mail ? "模板" : "来源"}</dt>
            <dd>{selected?.source}</dd>
            <dt className="text-muted-foreground">
              {mail ? "发送结果" : "日志级别"}
            </dt>
            <dd>{selected?.status}</dd>
            <dt className="text-muted-foreground">说明</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-all leading-relaxed">{selected?.detail}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
