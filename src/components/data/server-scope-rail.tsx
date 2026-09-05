import { Box, Clock3, MapPin, Server } from "lucide-react"
import type { ServerRecord } from "@/lib/mock-data"
import { StatusBadge } from "@/components/data/status-badge"
import { Separator } from "@/components/ui/separator"

export function ServerScopeRail({ server }: { server: ServerRecord }) {
  const tone = server.status === "在线" ? "success" : server.status === "维护" ? "warning" : "danger"

  return (
    <section aria-label={`${server.name} 服务器上下文`} className="mb-4 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 items-center gap-3 border-b bg-primary/[0.045] px-4 py-3 lg:min-w-60 lg:border-r lg:border-b-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Server aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <strong className="truncate text-base">{server.name}</strong>
              <StatusBadge label={server.status} tone={tone} />
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{server.role}</span>
          </span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-3 px-4 py-3 text-sm sm:grid-cols-3">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span><span className="block text-xs text-muted-foreground">区域</span><strong className="block truncate font-medium">{server.region}</strong></span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Box className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span><span className="block text-xs text-muted-foreground">运行内核</span><strong className="font-data block truncate text-xs font-medium">{server.kernel}</strong></span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Clock3 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span><span className="block text-xs text-muted-foreground">最后联系</span><strong className="block truncate font-medium">{server.lastSeen}</strong></span>
          </span>
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-3 divide-x text-center text-xs sm:max-w-md sm:text-left">
        <span className="px-4 py-2"><strong className="font-data mr-1 text-sm">{server.inbounds}</strong><span className="text-muted-foreground">入站</span></span>
        <span className="px-4 py-2"><strong className="font-data mr-1 text-sm">{server.nodes}</strong><span className="text-muted-foreground">节点</span></span>
        <span className="px-4 py-2"><strong className="font-data mr-1 text-sm">{server.hosts}</strong><span className="text-muted-foreground">主机</span></span>
      </div>
    </section>
  )
}
