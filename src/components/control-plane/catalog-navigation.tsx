import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Shared sidebar navigation for catalog forms and categorized management pages. */
export function CatalogNavigation({
  items,
  label,
  stickyScope = "page",
}: {
  items: { id: string; title: string; icon?: LucideIcon; hasError?: boolean }[];
  label: string;
  stickyScope?: "page" | "container";
}) {
  return (
    <aside
      data-sticky-scope={stickyScope}
      aria-label={label}
      className={cn(
        "max-w-full self-start overflow-hidden rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur lg:sticky lg:z-20 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]",
        stickyScope === "page"
          ? "lg:top-16 lg:max-h-[calc(100dvh-5rem)]"
          : "lg:top-0 lg:max-h-[calc(92dvh-12rem)]",
      )}
    >
      <div className="hidden px-2.5 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground lg:block">
        {label}
      </div>
      <div className="px-2.5 pb-2 text-xs text-muted-foreground lg:hidden">
        左右滑动切换分类
      </div>
      <TabsList className="h-auto w-full max-lg:!flex-row max-lg:justify-start max-lg:overflow-x-auto max-lg:overflow-y-hidden lg:flex-col lg:items-stretch lg:justify-start gap-1 rounded-xl bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="group/catalog-step min-h-11 max-lg:!w-auto max-lg:!min-w-36 flex-none justify-start rounded-xl border border-transparent px-2.5 py-2 text-left shadow-none after:hidden hover:-translate-y-px hover:bg-background/75 hover:shadow-sm active:translate-y-0 active:scale-[0.98] data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm lg:w-full lg:min-w-0"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-background font-data text-[10px] font-semibold text-muted-foreground transition-colors duration-200 group-data-[state=active]/catalog-step:bg-primary group-data-[state=active]/catalog-step:text-primary-foreground">
                {Icon ? (
                  <Icon className="size-4" aria-hidden="true" />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <span className="min-w-0 truncate">{item.title}</span>
              {item.hasError && (
                <CircleAlert
                  className="ml-auto size-4 shrink-0 text-destructive"
                  aria-label="有配置错误"
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </aside>
  );
}
