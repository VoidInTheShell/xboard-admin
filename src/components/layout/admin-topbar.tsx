import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Check, Command as CommandIcon, Languages, Moon, Search, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { flatNavigation } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AdminTopbar() {
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const items = flatNavigation()

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const goTo = (path: string) => {
    navigate(path)
    setSearchOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-4">
        <SidebarTrigger className="-ml-1 md:hidden" />

        <Button
          variant="outline"
          className="min-w-0 flex-1 justify-start text-muted-foreground sm:max-w-sm"
          onClick={() => setSearchOpen(true)}
        >
          <Search data-icon="inline-start" aria-hidden="true" />
          <span className="truncate">搜索页面、服务器或配置</span>
          <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">Ctrl K</kbd>
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={resolvedTheme === "dark" ? "切换为浅色主题" : "切换为深色主题"}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="语言">
                <Languages aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Check aria-hidden="true" />简体中文
                </DropdownMenuItem>
                <DropdownMenuItem disabled>English</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="全局搜索" description="搜索管理页面并直接跳转">
        <CommandInput placeholder="输入页面或功能名称…" />
        <CommandList>
          <CommandEmpty>没有匹配的管理页面</CommandEmpty>
          <CommandGroup heading="管理页面">
            {items.map((item) => (
              <CommandItem key={item.path} value={`${item.title} ${(item.keywords ?? []).join(" ")}`} onSelect={() => goTo(item.path)}>
                <item.icon aria-hidden="true" />
                <span>{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="快捷入口">
            <CommandItem onSelect={() => goTo("/servers/us2/inbounds")}>
              <CommandIcon aria-hidden="true" />
              <span>打开 US2 服务器工作台</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
