import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  ChevronRight,
  ExternalLink,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react"
import { adminNavigation } from "@/lib/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { originalAdminFallbackUrl } from "@/lib/admin-entry"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

function isPathActive(pathname: string, path: string) {
  if (path === "/servers") return pathname === path || pathname.startsWith("/servers/")
  return pathname === path
}

export function AdminSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { state, isMobile } = useSidebar()
  const collapsed = !isMobile && state === "collapsed"
  const collapseLabel = isMobile ? "关闭侧栏" : "收起侧栏"
  const [openGroups, setOpenGroups] = React.useState<Record<string, { pathname: string; open: boolean }>>({})
  const { logout, session } = useAuth()
  const accountName = session?.email || "管理员"

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="relative h-16 shrink-0 overflow-hidden border-b border-sidebar-border p-2">
        <div
          data-slot="sidebar-brand-expanded"
          aria-hidden={collapsed}
          inert={collapsed ? true : undefined}
          className="absolute inset-2 flex items-center gap-1 transition-[opacity,transform] duration-200 ease-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-translate-x-2 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none"
        >
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" className="rounded-xl">
                <Link to="/dashboard">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Network aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">XBoard Admin</span>
                    <span className="block truncate text-xs text-muted-foreground">UEG infrastructure</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger aria-label={collapseLabel} className="size-8 shrink-0 rounded-lg">
                <PanelLeftClose aria-hidden="true" />
              </SidebarTrigger>
            </TooltipTrigger>
            {!isMobile ? <TooltipContent side="right">{collapseLabel}</TooltipContent> : null}
          </Tooltip>
        </div>

        <div
          data-slot="sidebar-brand-collapsed"
          aria-hidden={!collapsed}
          inert={collapsed ? undefined : true}
          className="pointer-events-none absolute inset-2 flex translate-x-2 items-center justify-center opacity-0 transition-[opacity,transform] duration-200 ease-out group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:translate-x-0 group-data-[collapsible=icon]:opacity-100 motion-reduce:transition-none"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger
                aria-label="展开侧栏"
                className="group/brand-toggle relative size-8 overflow-hidden rounded-lg p-0"
              >
                <span
                  data-slot="sidebar-brand-logo"
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[opacity,transform] duration-200 ease-out group-hover/brand-toggle:scale-90 group-hover/brand-toggle:opacity-0 group-focus-visible/brand-toggle:scale-90 group-focus-visible/brand-toggle:opacity-0 motion-reduce:transition-none"
                >
                  <Network aria-hidden="true" />
                </span>
                <span
                  data-slot="sidebar-brand-expand-icon"
                  className="absolute inset-0 flex -translate-x-1 items-center justify-center text-sidebar-foreground opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/brand-toggle:translate-x-0 group-hover/brand-toggle:opacity-100 group-focus-visible/brand-toggle:translate-x-0 group-focus-visible/brand-toggle:opacity-100 motion-reduce:transition-none"
                >
                  <PanelLeftOpen aria-hidden="true" />
                </span>
              </SidebarTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">展开侧栏</TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent className="[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-[collapsible=icon]:overflow-visible! py-2">
        {adminNavigation.map((group) => {
          const groupActive = group.items.some((item) => isPathActive(pathname, item.path))

          if (group.label === "总览") {
            const item = group.items[0]
            return (
              <SidebarGroup key={group.label} className="px-2 py-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={groupActive}
                      tooltip={item.title}
                      className="h-9 data-[active=true]:font-semibold"
                    >
                      <Link to={item.path} aria-current={groupActive ? "page" : undefined}>
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )
          }

          if (collapsed) {
            return (
              <SidebarGroup key={group.label} className="px-2 py-1">
                <SidebarMenu>
                  <SidebarMenuItem className="group/nav-category">
                    <SidebarMenuButton
                      type="button"
                      aria-label={`打开${group.label}菜单`}
                      isActive={groupActive}
                      className="h-9 data-[active=true]:font-semibold"
                    >
                      <group.icon aria-hidden="true" />
                      <span className="sr-only">{group.label}</span>
                    </SidebarMenuButton>

                    <div
                      className="pointer-events-none invisible absolute top-0 left-[calc(100%+1rem)] z-50 w-60 translate-x-1 opacity-0 transition-[opacity,transform,visibility] duration-150 ease-out group-focus-within/nav-category:pointer-events-auto group-focus-within/nav-category:visible group-focus-within/nav-category:translate-x-0 group-focus-within/nav-category:opacity-100 group-hover/nav-category:pointer-events-auto group-hover/nav-category:visible group-hover/nav-category:translate-x-0 group-hover/nav-category:opacity-100 motion-reduce:transition-none"
                    >
                      <span className="absolute top-0 -left-4 h-full w-4" aria-hidden="true" />
                      <nav aria-label={`${group.label}子菜单`} className="rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lg">
                        <div className="px-2.5 py-2 text-xs font-semibold text-muted-foreground">{group.label}</div>
                        <div className="flex flex-col gap-1">
                          {group.items.map((item) => {
                            const active = isPathActive(pathname, item.path)
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex min-h-9 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-[color,background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-accent hover:text-accent-foreground hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none",
                                  active && "bg-accent font-semibold text-accent-foreground",
                                )}
                              >
                                <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span>{item.title}</span>
                              </Link>
                            )
                          })}
                        </div>
                      </nav>
                    </div>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )
          }

          const savedState = openGroups[group.label]
          const open = savedState?.pathname === pathname ? savedState.open : groupActive
          return (
            <Collapsible
              key={group.label}
              open={open}
              onOpenChange={(nextOpen) => setOpenGroups((current) => ({
                ...current,
                [group.label]: { pathname, open: nextOpen },
              }))}
              className="group/nav-section"
            >
              <SidebarGroup className="px-2 py-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        type="button"
                        isActive={groupActive}
                        aria-expanded={open}
                        className="h-9 data-[active=true]:font-semibold"
                      >
                        <group.icon aria-hidden="true" />
                        <span>{group.label}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 ease-out group-data-[state=open]/nav-section:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent
                      forceMount
                      aria-hidden={!open}
                      inert={open ? undefined : true}
                      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out data-[state=closed]:grid-rows-[0fr] data-[state=closed]:opacity-0 data-[state=open]:grid-rows-[1fr] data-[state=open]:opacity-100 motion-reduce:transition-none"
                    >
                      <div className="min-h-0 overflow-hidden">
                        <SidebarMenuSub className="mt-1">
                          {group.items.map((item) => {
                            const active = isPathActive(pathname, item.path)
                            return (
                              <SidebarMenuSubItem key={item.path}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={active}
                                  className="h-8 rounded-xl transition-[color,background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:scale-[0.98] data-[active=true]:font-semibold motion-reduce:transition-none"
                                >
                                  <Link to={item.path} aria-current={active ? "page" : undefined}>
                                    <item.icon aria-hidden="true" />
                                    <span>{item.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                        </SidebarMenuSub>
                      </div>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              title={accountName}
              aria-label={`打开 ${accountName} 的账户菜单`}
              className="w-full justify-start gap-2 rounded-xl px-2 group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <Avatar>
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                  {accountName.slice(0, 1).toUpperCase() || "管"}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left text-sm group-data-[collapsible=icon]:hidden">
                {accountName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate text-sm" title={accountName}>
                {accountName}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <Settings aria-hidden="true" />
                系统配置
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href={originalAdminFallbackUrl()} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  打开原版管理面板
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={logout}>
                <LogOut aria-hidden="true" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
