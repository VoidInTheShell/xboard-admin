const fallbackAdminPath = normalizeAdminPath(import.meta.env.VITE_ADMIN_API_PATH) ?? "unitedearthgov"
const adminPathPattern = /^[A-Za-z0-9_-]{8,}$/

export function isAdminEntryPath(value: string): boolean {
  return adminPathPattern.test(value) && value !== "passport"
}

export function activeAdminPath(pathname = browserPathname()): string {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? ""
  return isAdminEntryPath(firstSegment) ? firstSegment : fallbackAdminPath
}

export function adminRouterBase(): string {
  const firstSegment = browserPathname().split("/").filter(Boolean)[0] ?? ""
  if (isAdminEntryPath(firstSegment)) return `/${firstSegment}`

  const configuredBase = import.meta.env.BASE_URL ?? "/"
  if (configuredBase === "/" || configuredBase === "./") return "/"

  const normalized = configuredBase.replace(/^\.?(?:\/+)/, "").replace(/\/+$/, "")
  return normalized ? `/${normalized}` : "/"
}

export function standaloneAdminUrl(path = activeAdminPath()): string {
  const normalized = normalizeAdminPath(path)
  if (!normalized || !isAdminEntryPath(normalized)) return "/"
  return `/${normalized}/`
}

export function originalAdminFallbackUrl(): string {
  return `${standaloneAdminUrl().replace(/\/$/, "")}/original`
}

export async function waitForStandaloneAdmin(path: string, timeoutMs = 12_000): Promise<boolean> {
  const url = standaloneAdminUrl(path)
  if (url === "/") return false

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}?xboard_admin_probe=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      const page = await response.text()
      if (response.ok && page.includes('data-xboard-admin-shell="standalone"')) return true
    } catch {
      // The route synchronizer may still be applying the new backend setting.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350))
  }

  return false
}

function browserPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname
}

function normalizeAdminPath(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, "")
  return normalized || null
}
