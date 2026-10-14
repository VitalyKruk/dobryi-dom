import { useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, LayoutDashboard, Loader2, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Field } from "@/components/field"
import { Logo } from "@/components/logo"
import { useAuth } from "@/context/auth"
import { DEMO_PASSWORD, seedUsers } from "@/lib/seed"
import { roleLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <section className="container-page flex flex-1 items-start justify-center py-12 md:py-24">
      <div className="flex w-full max-w-[440px] flex-col gap-6 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-foreground/5 md:p-8">
        <Logo className="self-center" />
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl leading-8">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={show}
        className="absolute top-0 right-0"
      >
        {show ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

function useRedirectTarget() {
  const location = useLocation()
  return (location.state as { from?: string } | null)?.from ?? "/account"
}

function ForgotPassword() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="link" size="sm" className="self-end">
          Забыли пароль?
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!/^\S+@\S+\.\S+$/.test(email)) {
              setError("Проверьте адрес — похоже, в нём опечатка")
              return
            }
            setOpen(false)
            setEmail("")
            setError("")
            toast.success("Если такой адрес зарегистрирован, мы отправили ссылку для сброса пароля 📬")
          }}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle>Восстановление пароля</DialogTitle>
            <DialogDescription>Пришлём ссылку для сброса на почту, указанную при регистрации.</DialogDescription>
          </DialogHeader>
          <Field label="Email" error={error}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit">Отправить ссылку</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const loginSchema = z.object({
  email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
  password: z.string().min(1, { error: "Введите пароль" }),
})

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const target = useRedirectTarget()
  const [serverError, setServerError] = useState("")
  const [demoBusy, setDemoBusy] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
  })

  const done = (name: string, role: string) => {
    toast.success(`С возвращением, ${name.split(" ")[0]}! 🐾`)
    navigate(role === "user" ? target : target === "/account" ? "/admin" : target, { replace: true })
  }

  const onSubmit = handleSubmit(async (v) => {
    setServerError("")
    try {
      const u = await login(v.email, v.password)
      done(u.name, u.role)
    } catch (e) {
      setServerError((e as Error).message)
    }
  })

  async function demo(email: string) {
    setDemoBusy(email)
    setServerError("")
    try {
      const u = await login(email, DEMO_PASSWORD)
      done(u.name, u.role)
    } catch (e) {
      setServerError((e as Error).message)
      setDemoBusy(null)
    }
  }

  const demoIcons = { user: UserRound, volunteer: LayoutDashboard, admin: ShieldCheck }
  // На проде (сборка с VITE_DEMO_LOGIN=0) демо-входа нет: демо-пароль там не принимается
  const demoLogin = import.meta.env.VITE_DEMO_LOGIN !== "0"

  return (
    <AuthCard
      title="Вход"
      subtitle={
        <>
          Нет аккаунта?{" "}
          <Link to="/register" state={{ from: target }} className="font-semibold text-secondary-foreground underline">
            Зарегистрируйтесь
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} />
        </Field>
        <div className="flex flex-col gap-1">
          <Field label="Пароль" error={formState.errors.password?.message}>
            <PasswordInput autoComplete="current-password" {...register("password")} />
          </Field>
          <ForgotPassword />
        </div>
        {serverError && (
          <p role="alert" className="rounded-xl bg-warning p-4 text-sm text-warning-foreground">
            {serverError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Войти
        </Button>
      </form>
      {demoLogin && (
        <>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Separator className="flex-1" /> или демо-вход как <Separator className="flex-1" />
          </div>
          <div className="flex flex-col gap-2">
            {seedUsers.map((u) => {
              const Icon = demoIcons[u.role]
              return (
                <Button
                  key={u.id}
                  variant="outline"
                  size="lg"
                  disabled={!!demoBusy}
                  onClick={() => demo(u.email)}
                  className="justify-start"
                >
                  {demoBusy === u.email ? <Loader2 className="animate-spin" /> : <Icon />}
                  <span className="flex-1 text-left">{roleLabel[u.role]}</span>
                  <span className="text-xs font-normal text-muted-foreground">{u.name.split(" ")[0]}</span>
                </Button>
              )
            })}
          </div>
        </>
      )}
    </AuthCard>
  )
}

const registerSchema = z
  .object({
    name: z.string().trim().min(2, { error: "Как к вам обращаться? Нужно хотя бы 2 буквы" }),
    email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
    password: z.string().min(8, { error: "Пароль — минимум 8 символов" }),
    confirm: z.string(),
    consent: z.boolean().refine((v) => v, { error: "Нужно согласие на обработку данных" }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], error: "Пароли не совпадают" })

function passwordStrength(p: string) {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-ZА-Я]/.test(p) && /[a-zа-я]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^\w\sА-Яа-я]/.test(p)) s++
  return Math.min(4, s)
}
const strengthLabel = ["Слишком короткий", "Слабый", "Нормальный", "Хороший", "Отличный"]

export function RegisterPage() {
  const { register: signUp } = useAuth()
  const navigate = useNavigate()
  const target = useRedirectTarget()
  const [serverError, setServerError] = useState("")
  const { register, handleSubmit, formState, watch, setValue } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: { consent: false },
  })
  const password = watch("password") ?? ""
  const consent = watch("consent")
  const strength = passwordStrength(password)

  const onSubmit = handleSubmit(async (v) => {
    setServerError("")
    try {
      const u = await signUp({ name: v.name, email: v.email, password: v.password })
      toast.success(`Добро пожаловать, ${u.name.split(" ")[0]}! 🐾`)
      navigate(target, { replace: true })
    } catch (e) {
      setServerError((e as Error).message)
    }
  })

  return (
    <AuthCard
      title="Регистрация"
      subtitle={
        <>
          Уже есть аккаунт?{" "}
          <Link to="/login" state={{ from: target }} className="font-semibold text-secondary-foreground underline">
            Войдите
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Имя" error={formState.errors.name?.message}>
          <Input autoComplete="name" {...register("name")} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Пароль" error={formState.errors.password?.message} hint="Минимум 8 символов">
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        {password && (
          <div className="flex items-center gap-4" aria-live="polite">
            <Progress
              value={(strength / 4) * 100}
              aria-label="Надёжность пароля"
              className={cn("h-2 flex-1 bg-muted", strength >= 3 && "[&>*]:bg-success-dot")}
            />
            <span className="w-32 text-right text-sm text-muted-foreground">{strengthLabel[strength]}</span>
          </div>
        )}
        <Field label="Повторите пароль" error={formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...register("confirm")} />
        </Field>
        <div className="flex flex-col gap-2">
          <label htmlFor="reg-consent" className="flex cursor-pointer items-start gap-4 text-sm leading-6">
            <Checkbox
              id="reg-consent"
              checked={consent}
              onCheckedChange={(c) => setValue("consent", c === true, { shouldValidate: true })}
              aria-invalid={!!formState.errors.consent}
              className="mt-0.5"
            />
            <span>
              Согласен(на) с{" "}
              <Link to="/privacy" target="_blank" className="font-semibold text-secondary-foreground underline">
                политикой конфиденциальности
              </Link>
            </span>
          </label>
          {formState.errors.consent && (
            <p role="alert" className="text-sm text-destructive">
              {formState.errors.consent.message}
            </p>
          )}
        </div>
        {serverError && (
          <p role="alert" className="rounded-xl bg-warning p-4 text-sm text-warning-foreground">
            {serverError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Зарегистрироваться
        </Button>
      </form>
    </AuthCard>
  )
}
