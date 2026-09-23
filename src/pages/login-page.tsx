import * as React from "react"
import { useSiteBranding } from "@/lib/site-branding"
import { AlertCircle, ArrowRight, Network } from "lucide-react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type LoginLocationState = { from?: { pathname?: string } }

export function LoginPage() {
  const brand = useSiteBranding()
  const { login, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      await login(email.trim(), password)
      const state = location.state as LoginLocationState | null
      navigate(state?.from?.pathname || "/dashboard", { replace: true })
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "无法连接管理后端，请检查网络和 API 地址。")
    } finally {
      setSubmitting(false)
    }
  }

  const glassAlpha = brand.adminLoginGlassOpacity
  const maskAlpha = brand.adminLoginMaskOpacity / 100

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#0b0e14]">
      {/* 背景层：自定义背景图（可调暗色遮罩）或默认深色底 */}
      <div aria-hidden="true" className="absolute inset-0">
        {brand.adminLoginBackground ? (
          <>
            <img
              src={brand.adminLoginBackground}
              alt=""
              className="size-full object-cover"
              onError={(event) => { event.currentTarget.style.display = "none" }}
            />
            <div className="absolute inset-0 bg-black" style={{ opacity: maskAlpha }} />
          </>
        ) : (
          <div className="size-full bg-[radial-gradient(120%_90%_at_15%_10%,#2a303c_0%,#171b24_45%,#0b0e14_100%)] dark:bg-[radial-gradient(120%_90%_at_15%_10%,#313846_0%,#1a1f2a_45%,#10131b_100%)]" />
        )}
        {!brand.adminLoginBackground ? (
          <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_78%_18%,rgba(148,163,184,0.16)_0%,transparent_70%),radial-gradient(45%_40%_at_12%_85%,rgba(100,116,139,0.14)_0%,transparent_75%)]" />
        ) : null}
      </div>

      <div className="relative z-20 flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 lg:p-0">
        {/* 登录面板：移动端居中卡片；桌面端为左侧悬浮全高瀑布毛玻璃面板（左侧留 10% 空隙，覆盖至页面顶端） */}
        <section
          className="relative w-full max-w-[26.5rem] overflow-hidden rounded-3xl border border-white/25 shadow-[0_24px_70px_-20px_rgba(2,6,17,0.65)] backdrop-blur-2xl dark:border-white/12 lg:absolute lg:inset-y-0 lg:left-[10%] lg:z-10 lg:my-0 lg:w-[30rem] lg:max-w-none lg:rounded-none"
          style={{ backgroundColor: `color-mix(in srgb, var(--card) ${glassAlpha}%, transparent)` }}
          aria-label="管理员登录"
        >
          <div
            aria-hidden="true"
            className="login-waterfall-sheen pointer-events-none absolute inset-x-[-40%] top-0 h-1/3"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl border-t border-white/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] lg:rounded-none"
          />

          <div className="relative flex h-full flex-col px-6 py-6 sm:px-8 sm:py-8 lg:px-11 lg:pb-[10vh] lg:pt-0">
            {/* 站点品牌：仅保留图标，放大后居中于登录表单上方的毛玻璃区域 */}
            <header className="flex flex-1 items-center justify-center pb-8 lg:pb-10">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt={brand.appName}
                  className="size-40 shrink-0 object-contain drop-shadow-[0_10px_36px_rgba(2,6,17,0.55)] lg:size-[200px]"
                />
              ) : (
                <span className="flex size-40 shrink-0 items-center justify-center rounded-3xl border border-white/25 bg-white/10 text-white shadow-sm lg:size-[200px]">
                  <Network className="size-16 lg:size-24" aria-hidden="true" />
                </span>
              )}
            </header>

            <form onSubmit={submit} className="flex w-full flex-col gap-5 lg:mx-auto lg:max-w-sm">
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>登录失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-email">管理员邮箱</FieldLabel>
                    <Input
                      id="admin-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-invalid={Boolean(error) || undefined}
                      required
                    />
                  </Field>
                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="admin-password">密码</FieldLabel>
                    <Input
                      id="admin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-invalid={Boolean(error) || undefined}
                      required
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" size="lg" className="w-full" disabled={submitting || !email.trim() || !password}>
                  {submitting ? "正在验证…" : "登录管理后台"}
                  {!submitting ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
                </Button>
              </form>
          </div>
        </section>
      </div>
    </main>
  )
}
