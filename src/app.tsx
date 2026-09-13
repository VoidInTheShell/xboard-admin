import { lazy, Suspense } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { AdminShell } from "@/components/layout/admin-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { useAuth } from "@/lib/auth"

const DashboardPage = lazy(() =>
  import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
)
const UsagePage = lazy(() => import('@/pages/usage-page').then(module => ({ default: module.UsagePage })))
const LeaderboardPage = lazy(() => import('@/pages/leaderboard-page').then(module => ({ default: module.LeaderboardPage })))
const ServersPage = lazy(() =>
  import("@/pages/servers-page").then((module) => ({ default: module.ServersPage })),
)
const ServerWorkspacePage = lazy(() =>
  import("@/pages/server-workspace-page").then((module) => ({ default: module.ServerWorkspacePage })),
)
const OutboundsPage = lazy(() =>
  import("@/pages/outbounds-page").then((module) => ({ default: module.OutboundsPage })),
)
const NodesPage = lazy(() =>
  import("@/pages/nodes-page").then((module) => ({ default: module.NodesPage })),
)
const PermissionGroupsPage = lazy(() =>
  import("@/pages/permission-groups-page").then((module) => ({ default: module.PermissionGroupsPage })),
)
const SubscriptionManagementPage = lazy(() =>
  import("@/pages/subscription-management-page").then((module) => ({ default: module.SubscriptionManagementPage })),
)
const SettingsPage = lazy(() =>
  import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })),
)
const PlansPage = lazy(() =>
  import("@/pages/plans-page").then((module) => ({ default: module.PlansPage })),
)
const NoticesPage = lazy(() =>
  import("@/pages/notices-page").then((module) => ({ default: module.NoticesPage })),
)
const KnowledgePage = lazy(() =>
  import("@/pages/knowledge-page").then((module) => ({ default: module.KnowledgePage })),
)
const AuditLogsPage = lazy(() =>
  import("@/pages/audit-logs-page").then((module) => ({ default: module.AuditLogsPage })),
)
const TrafficResetLogsPage = lazy(() =>
  import("@/pages/traffic-reset-logs-page").then((module) => ({ default: module.TrafficResetLogsPage })),
)
const UsersPage = lazy(() =>
  import("@/pages/users-page").then((module) => ({ default: module.UsersPage })),
)
const OrdersPage = lazy(() =>
  import("@/pages/orders-page").then((module) => ({ default: module.OrdersPage })),
)
const CommissionsPage = lazy(() =>
  import("@/pages/orders-page").then((module) => ({ default: module.CommissionsPage })),
)
const CouponsPage = lazy(() =>
  import("@/pages/coupons-page").then((module) => ({ default: module.CouponsPage })),
)
const TicketsPage = lazy(() =>
  import("@/pages/tickets-page").then((module) => ({ default: module.TicketsPage })),
)
const GiftCardsPage = lazy(() =>
  import("@/pages/gift-cards-page").then((module) => ({ default: module.GiftCardsPage })),
)
const ClientsPage = lazy(() =>
  import("@/pages/clients-page").then((module) => ({ default: module.ClientsPage })),
)
const MailPage = lazy(() =>
  import("@/pages/mail-page").then((module) => ({ default: module.MailPage })),
)
const PaymentsPage = lazy(() =>
  import("@/pages/payments-page").then((module) => ({ default: module.PaymentsPage })),
)
const ExtensionsPage = lazy(() =>
  import("@/pages/extensions-page").then((module) => ({ default: module.ExtensionsPage })),
)
const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({ default: module.LoginPage })),
)

export function App() {
  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="servers" element={<ServersPage />} />
              <Route path="servers/:serverId/outbounds" element={<Navigate to="/outbounds" replace />} />
              <Route path="servers/:serverId/:section" element={<ServerWorkspacePage />} />
              <Route path="outbounds" element={<OutboundsPage />} />
              <Route path="nodes" element={<NodesPage />} />
              <Route path="permission-groups" element={<PermissionGroupsPage />} />
              <Route path="subscriptions" element={<SubscriptionManagementPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="traffic-reset-logs" element={<TrafficResetLogsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="commissions" element={<CommissionsPage />} />
              <Route path="coupons" element={<CouponsPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="gift-cards" element={<GiftCardsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="mail" element={<MailPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="extensions" element={<ExtensionsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </>
  )
}

function RequireAdmin() {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: { pathname: location.pathname } }} />
  return <Outlet />
}

function PageFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6" role="status" aria-label="正在加载页面">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
