import type { ReactNode } from "react"
import { ChevronRight, House } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  parent,
  embedded = false,
}: {
  title: string
  description?: string
  action?: ReactNode
  eyebrow?: string
  parent?: { label: string; path: string }
  embedded?: boolean
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      {!embedded && <nav aria-label="面包屑" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
          <House className="size-3.5" aria-hidden="true" />
          管理后台
        </Link>
        {parent ? (
          <>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <Link to={parent.path} className="hover:text-foreground">{parent.label}</Link>
          </>
        ) : null}
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">{title}</span>
      </nav>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <Badge variant="outline" className="mb-2">{eyebrow}</Badge> : null}
          {embedded ? <h2 className="text-xl font-semibold tracking-tight">{title}</h2> : <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}
