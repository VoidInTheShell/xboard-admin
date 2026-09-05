import type { CatalogTab } from "@/lib/control-plane/catalog-types"
import { CatalogForm } from "@/components/control-plane/catalog-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function CatalogDialog({
  open,
  onOpenChange,
  title,
  description,
  tabs,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  tabs: CatalogTab[]
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <CatalogForm
          tabs={tabs}
          ariaLabel={`${title}配置分组`}
          navigationStyle="sidebar"
          sidebarStickyOffset="container"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSave}>保存到本地原型</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
