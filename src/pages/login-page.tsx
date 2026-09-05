import * as React from "react"
import { AlertCircle, ArrowRight, KeyRound, Network, ShieldCheck } from "lucide-react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { adminApiPath, ApiError } from "@/lib/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type LoginLocationState = { from?: { pathname?: string } }

export function LoginPage() {
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

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(440px,0.7fr)]">
      <section className="flex min-h-[240px] flex-col justify-between border-b bg-muted/30 p-5 sm:min-h-[320px] sm:p-6 lg:min-h-dvh lg:border-r lg:border-b-0 lg:p-10">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Network aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold">XBoard Admin</div>
            <div className="text-xs text-muted-foreground">UEG infrastructure</div>
          </div>
        </div>

        <div className="max-w-xl py-6 sm:py-10">
          <Badge variant="outline" className="mb-4">真实管理 API</Badge>
          <h1 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">从同一控制面管理用户、订单、内容与运行设置。</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">
            登录后只展示后端实际返回的数据。权限失败、空数据和接口异常会分别呈现，不再用本地示例记录代替。
          </p>
        </div>

        <div className="hidden gap-3 text-sm sm:grid sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl border bg-background/70 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div><div className="font-medium">Sanctum 管理权限</div><div className="mt-1 text-xs leading-5 text-muted-foreground">使用后端签发的 Bearer 会话，不保存账号密码。</div></div>
          </div>
          <div className="flex gap-3 rounded-xl border bg-background/70 p-3">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div><div className="font-medium">可配置安全路径</div><div className="mt-1 font-data text-xs leading-5 text-muted-foreground">/api/v2/{adminApiPath}</div></div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
        <Card className="w-full max-w-md shadow-none">
          <form onSubmit={submit}>
            <CardHeader>
              <CardTitle>管理员登录</CardTitle>
              <CardDescription>使用测试 XBoard 后端中的管理员账号。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>登录失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
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
                  <FieldDescription>账号仅用于向当前配置的 XBoard 后端发起登录。</FieldDescription>
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
            </CardContent>
            <CardFooter className="mt-6 flex-col items-stretch gap-3">
              <Button type="submit" disabled={submitting || !email.trim() || !password}>
                {submitting ? "正在验证…" : "登录管理后台"}
                {!submitting ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">会话仅保存在当前浏览器标签会话中；退出后立即清除。</p>
            </CardFooter>
          </form>
        </Card>
      </section>
    </main>
  )
}
