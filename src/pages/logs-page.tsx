import {
  FileClock,
  Mail,
  RotateCcw,
  Settings2,
  Terminal,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AuditLogsPage } from "@/pages/audit-logs-page";
import { TrafficResetLogsPage } from "@/pages/traffic-reset-logs-page";
import { LogSettings } from "@/components/logs/log-settings";
import { LogRecords } from "@/components/logs/log-records";
import { PageHeader } from "@/components/layout/page-header";
import { useEffect, useRef } from "react";

const sections = [
  {
    id: "audit",
    title: "审计日志",
    description: "管理员与 MCP 操作",
    icon: FileClock,
  },
  {
    id: "reset",
    title: "流量重置日志",
    description: "重置原因与清除量",
    icon: RotateCcw,
  },
  {
    id: "mail",
    title: "邮件发送日志",
    description: "发送结果与错误",
    icon: Mail,
  },
  {
    id: "runtime",
    title: "面板运行日志",
    description: "应用、备份与队列",
    icon: Terminal,
  },
  {
    id: "settings",
    title: "日志配置",
    description: "采集与存储策略",
    icon: Settings2,
  },
];

export function LogsPage() {
  const navigationRef = useRef<HTMLElement>(null);
  const [params, setParams] = useSearchParams();
  const section = sections.some((item) => item.id === params.get("section"))
    ? params.get("section")!
    : "audit";
  useEffect(() => {
    const nav = navigationRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft +=
        active.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    }
  }, [section]);
  function navigate(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", value);
      return next;
    });
  }
  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="日志"
        description="查询操作和运行记录，管理日志采集与保留。"
      />
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <aside
          aria-label="日志菜单"
          className="min-w-0 rounded-2xl border bg-card p-2 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="flex justify-between px-2.5 pt-1 pb-2 text-xs text-muted-foreground">
            <span>日志</span>
            <span className="lg:hidden">左右滑动切换分类</span>
          </div>
          <nav
            aria-label="日志分类"
            ref={navigationRef}
            className="flex gap-1.5 overflow-x-auto lg:grid lg:grid-cols-1 lg:overflow-visible"
          >
            {sections.map(({ id, title, description, icon: Icon }) => (
              <div key={id} className="w-44 shrink-0 lg:w-auto">
                {id === "settings" && (
                  <Separator className="my-2 hidden lg:block" />
                )}
                <Button
                  variant="ghost"
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                  className={cn(
                    "group/log-nav h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-xl border px-2.5 py-2 text-left",
                    section === id
                      ? "border-border bg-background shadow-sm"
                      : "border-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl",
                      section === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">
                      {description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "hidden size-1.5 shrink-0 rounded-full lg:block",
                      section === id ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                </Button>
              </div>
            ))}
          </nav>
        </aside>
        <section
          aria-label={sections.find((item) => item.id === section)?.title}
          className="min-w-0"
        >
          {section === "audit" && <AuditLogsPage embedded />}
          {section === "reset" && <TrafficResetLogsPage embedded />}
          {(section === "mail" || section === "runtime") && (
            <LogRecords key={section} kind={section} />
          )}
          {/* Keep the draft mounted across log categories so unsaved edits are preserved. */}
          <div hidden={section !== "settings"}>
            <LogSettings />
          </div>
        </section>
      </div>
    </div>
  );
}
