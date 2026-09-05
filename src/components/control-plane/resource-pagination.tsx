import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ResourcePagination({
  page,
  pageSize,
  total,
  disabled = false,
  loading = false,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  disabled?: boolean
  loading?: boolean
  onPageChange: (page: number) => void
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(total, page * pageSize)

  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span className="font-data" aria-live="polite">{loading ? "正在读取…" : total ? `${start}–${end} / ${total}` : "0 条记录"}</span>
      <div className="flex items-center gap-2">
        <span className="font-data">{loading ? "分页待更新" : `第 ${page} / ${lastPage} 页`}</span>
        <Button variant="outline" size="icon-sm" aria-label="上一页" disabled={disabled || loading || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="下一页" disabled={disabled || loading || page >= lastPage} onClick={() => onPageChange(page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
