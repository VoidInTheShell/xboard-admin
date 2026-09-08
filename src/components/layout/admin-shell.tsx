import { Outlet, useLocation } from "react-router-dom"
import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { AdminTopbar } from "@/components/layout/admin-topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AdminChangeSyncProvider, useAdminChangeSync } from "@/lib/admin-change-sync"

export function AdminShell() {
  return (
    <AdminChangeSyncProvider>
      <AdminShellContent />
    </AdminChangeSyncProvider>
  )
}

function AdminShellContent() {
  const location = useLocation()
  const { refreshToken } = useAdminChangeSync()

  return (
    <SidebarProvider>
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        跳到主要内容
      </a>
      <AdminSidebar />
      <SidebarInset className="min-w-0 overflow-x-clip">
        <AdminTopbar />
        <main id="admin-main" key={`${location.pathname}:${refreshToken}`} className="min-w-0 flex-1 px-4 py-4 md:px-5 md:py-5 lg:px-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
