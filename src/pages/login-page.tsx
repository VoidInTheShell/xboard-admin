import * as React from "react"
import { AlertCircle, ArrowRight, Network } from "lucide-react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type LoginLocationState = { from?: { pathname?: string } }
const welcomeMessage = "欢迎使用UEG-NET管理面板"

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function LoginPage() {
  const { login, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [welcomeText, setWelcomeText] = React.useState(() =>
    prefersReducedMotion() ? welcomeMessage : "",
  )
  const [typingWelcome, setTypingWelcome] = React.useState(
    () => !prefersReducedMotion(),
  )

  React.useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) return

    let characterIndex = 0
    let timer: number | undefined
    const showNextCharacter = () => {
      characterIndex += 1
      setWelcomeText(welcomeMessage.slice(0, characterIndex))
      if (characterIndex >= welcomeMessage.length) {
        setTypingWelcome(false)
        return
      }
      timer = window.setTimeout(showNextCharacter, 75)
    }
    const showCompleteMessage = (event: MediaQueryListEvent) => {
      if (!event.matches) return
      if (timer) window.clearTimeout(timer)
      setWelcomeText(welcomeMessage)
      setTypingWelcome(false)
    }

    timer = window.setTimeout(showNextCharacter, 75)
    reducedMotion.addEventListener("change", showCompleteMessage)
    return () => {
      if (timer) window.clearTimeout(timer)
      reducedMotion.removeEventListener("change", showCompleteMessage)
    }
  }, [])

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
      <section className="flex min-h-[240px] flex-col border-b bg-muted/30 p-5 sm:min-h-[320px] sm:p-6 lg:min-h-dvh lg:border-r lg:border-b-0 lg:p-10">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Network aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold">XBoard Admin</div>
            <div className="text-xs text-muted-foreground">UEG infrastructure</div>
          </div>
        </div>

        <div className="flex flex-1 items-center py-6 sm:py-10">
          <h1
            aria-label={welcomeMessage}
            className="max-w-lg text-2xl font-semibold tracking-tight sm:text-[28px]"
          >
            <span aria-hidden="true">{welcomeText}</span>
            {typingWelcome ? (
              <span
                aria-hidden="true"
                className="ml-1 inline-block h-[0.9em] w-px animate-pulse bg-current align-[-0.08em] motion-reduce:hidden"
              />
            ) : null}
          </h1>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
        <Card className="w-full max-w-md shadow-none">
          <form onSubmit={submit}>
            <CardHeader>
              <CardTitle>管理员登录</CardTitle>
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
            <CardFooter className="mt-6 flex-col items-stretch">
              <Button type="submit" disabled={submitting || !email.trim() || !password}>
                {submitting ? "正在验证…" : "登录管理后台"}
                {!submitting ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </section>
    </main>
  )
}
