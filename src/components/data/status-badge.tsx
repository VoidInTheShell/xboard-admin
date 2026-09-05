import { CircleAlert, CircleCheck, CircleMinus, Clock3, Info } from "lucide-react"
import type { StatusTone } from "@/lib/mock-data"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const toneConfig = {
  success: { icon: CircleCheck, className: "border-emerald-600/25 bg-emerald-600/8 text-emerald-700 dark:text-emerald-300" },
  warning: { icon: Clock3, className: "border-amber-600/25 bg-amber-600/8 text-amber-700 dark:text-amber-300" },
  danger: { icon: CircleAlert, className: "border-destructive/25 bg-destructive/8 text-destructive" },
  info: { icon: Info, className: "border-primary/25 bg-primary/8 text-primary" },
  neutral: { icon: CircleMinus, className: "text-muted-foreground" },
} as const

export function StatusBadge({ label, tone = "neutral", className }: { label: string; tone?: StatusTone; className?: string }) {
  const config = toneConfig[tone]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", config.className, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  )
}
