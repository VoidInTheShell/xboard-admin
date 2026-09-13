import { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { formatTime, type UsageEvent } from "@/lib/usage-data";

export function AccessHistoryTable({
  events,
  selfOnly,
  kind,
  onDetail,
}: {
  events: UsageEvent[];
  selfOnly: boolean;
  kind: string;
  onDetail: (event: UsageEvent) => void;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const columns = [
    {
      key: "time",
      label: kind === "connection" ? "首次发现时间" : "访问时间",
      required: true,
    },
    ...(!selfOnly ? [{ key: "user", label: "用户", required: false }] : []),
    { key: "ip", label: "来源 IP", required: true },
    { key: "location", label: "位置", required: false },
    { key: "platform", label: "设备 / 客户端", required: false },
    {
      key: "target",
      label:
        kind === "connection"
          ? "首次访问节点"
          : kind === "panel"
            ? "访问页面"
            : "请求类型",
      required: false,
    },
    {
      key: "action",
      label: kind === "connection" ? "发现原因" : "访问行为",
      required: false,
    },
    { key: "result", label: "结果", required: false },
  ];
  const shown = columns.filter((column) => !hidden.includes(column.key));
  function cell(event: UsageEvent, key: string) {
    if (key === "time")
      return <span className="font-mono text-xs">{formatTime(event.at)}</span>;
    if (key === "user") return event.user;
    if (key === "ip")
      return <span className="font-mono text-xs">{event.ip}</span>;
    if (key === "location") return event.location;
    if (key === "platform")
      return (
        <>
          {event.platform}
          <div className="mt-1 text-xs text-muted-foreground">
            {event.client}
          </div>
        </>
      );
    if (key === "target")
      return event.kind === "connection" ? (
        event.node
      ) : event.kind === "panel" ? (
        <span className="font-mono text-xs">{event.path}</span>
      ) : (
        "订阅"
      );
    if (key === "action") return event.action ?? "订阅拉取";
    return (
      <>
        <Badge
          variant={event.result.includes("失败") ? "destructive" : "secondary"}
        >
          {event.result}
        </Badge>
        {event.risk && (
          <div className="mt-1 text-xs text-muted-foreground">{event.risk}</div>
        )}
      </>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {kind === "connection"
            ? "同一用户的设备与 IP 组合仅记录首次出现，重复代理连接不新增记录。"
            : kind === "panel"
              ? "保留每次用户后台访问，包括登录与页面访问。"
              : "记录每次订阅拉取及其来源平台。"}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="设置访问历史显示列">
              <Columns3 data-icon="inline-start" />
              显示列 {shown.length}/{columns.length}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>展示列</DropdownMenuLabel>
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={!hidden.includes(column.key)}
                  disabled={column.required}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    setHidden((previous) =>
                      checked
                        ? previous.filter((key) => key !== column.key)
                        : [...previous, column.key],
                    )
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setHidden([])}>
                恢复默认列
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {shown.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              {shown.map((column) => (
                <TableCell key={column.key}>
                  {cell(event, column.key)}
                </TableCell>
              ))}
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDetail(event)}
                >
                  详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
