import { DatabaseZap } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ApiError } from "@/lib/api"

/**
 * The backend rejects usage queries with HTTP 503 while collection is off;
 * surface that case as a configuration prompt instead of a raw error.
 */
export function isUsageDisabledError(error: unknown) {
  return error instanceof ApiError && error.status === 503 && /disabled/i.test(error.message)
}

export function UsageDisabledNotice({ compact = false }: { compact?: boolean }) {
  return (
    <Empty className={compact ? "min-h-32 border bg-card" : "min-h-48 border bg-card"}>
      <EmptyHeader>
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <DatabaseZap className="size-5" aria-hidden="true" />
        </span>
        <EmptyTitle>使用记录采集未启用</EmptyTitle>
        <EmptyDescription>
          流量明细、在线设备、访问记录、排行榜和服务器历史都依赖使用记录采集。
          请前往「日志与存储 → 日志配置 → 流量与在线」打开「启用使用记录采集」后刷新查看。
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link to="/logs?section=settings">前往启用使用记录采集</Link>
      </Button>
    </Empty>
  )
}
