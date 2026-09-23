import { useSyncExternalStore } from 'react'
import { apiRequest } from '@/lib/api'

type SiteBranding = {
  appName: string
  logo: string
  description: string
  loginTitle: string
  loginDescription: string
  adminLoginBackground: string
  adminLoginGlassOpacity: number
  adminLoginMaskOpacity: number
  selfUseMode: boolean
  hiddenMenus: string[]
}
const defaults: SiteBranding = { appName: 'XBoard Admin', logo: '', description: '', loginTitle: '', loginDescription: '', adminLoginBackground: '', adminLoginGlassOpacity: 60, adminLoginMaskOpacity: 40, selfUseMode: false, hiddenMenus: [] }
let current = defaults
let started = false
const listeners = new Set<() => void>()
function text(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback }
function flag(value: unknown) { return value === true || value === 1 || value === '1' }
function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
function imageUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, window.location.origin)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}
export async function refreshSiteBranding() {
  try {
    const data = await apiRequest<Record<string, unknown>>('/api/v1/guest/comm/config')
    current = {
      appName: text(data.app_name, defaults.appName) || defaults.appName,
      logo: imageUrl(data.logo),
      description: text(data.app_description),
      loginTitle: text(data.user_login_title),
      loginDescription: text(data.user_login_description),
      adminLoginBackground: imageUrl(data.admin_login_background),
      adminLoginGlassOpacity: integer(data.admin_login_glass_opacity, 60, 0, 95),
      adminLoginMaskOpacity: integer(data.admin_login_mask_opacity, 40, 0, 90),
      selfUseMode: flag(data.self_use_mode),
      hiddenMenus: Array.isArray(data.admin_hidden_menus) ? data.admin_hidden_menus.filter((item): item is string => typeof item === 'string') : [],
    }
    document.title = current.appName
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) { description = document.createElement('meta'); description.name = 'description'; document.head.append(description) }
    description.content = current.description
    applyFavicon(current.logo)
    listeners.forEach(listener => listener())
  } catch { /* Keep the existing brand usable while the public configuration is unavailable. */ }
}

/**
 * Swap the favicon link node (instead of mutating href) so the stale
 * type="image/svg+xml" from the bundled favicon never mismatches a configured
 * PNG/other logo and browsers reliably pick up the change.
 */
function applyFavicon(logo: string) {
  if (!logo) return
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.href = logo
  if (existing) existing.replaceWith(icon)
  else document.head.append(icon)
}

let focusSyncStarted = false
function startFocusSync() {
  if (focusSyncStarted) return
  focusSyncStarted = true
  // Branding (name/logo/favicon) can change from MCP or another session;
  // re-read it when the operator returns to this tab so the sidebar, title
  // and favicon stay current without a manual reload.
  window.addEventListener('focus', () => { void refreshSiteBranding() })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshSiteBranding()
  })
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) { started = true; startFocusSync(); void refreshSiteBranding() }
  return () => listeners.delete(listener)
}
export function useSiteBranding() { return useSyncExternalStore(subscribe, () => current, () => defaults) }
