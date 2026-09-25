import { useEffect, useState, type FormEvent } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Heart, LayoutDashboard, LogOut, Mail, MapPin, Menu, Phone, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DemoBanner } from "@/components/demo-banner"
import { Logo } from "@/components/logo"
import { useAuth } from "@/context/auth"
import * as api from "@/lib/api"
import { initials, roleLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

export const navItems = [
  { to: "/catalog", label: "Питомцы" },
  { to: "/about", label: "О приюте" },
  { to: "/help", label: "Как помочь" },
  { to: "/faq", label: "Вопросы" },
  { to: "/contacts", label: "Контакты" },
]

/** Прокрутка вверх при смене страницы; якоря (#donate) — к нужному блоку */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ block: "start" }))
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-100 rounded-lg bg-card px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      К содержимому
    </a>
  )
}

export function UserMenu() {
  const { user, logout, can } = useAuth()
  const navigate = useNavigate()
  if (!user) {
    return (
      <Button asChild variant="ghost" className="hidden md:inline-flex">
        <Link to="/login">
          <UserRound /> Войти
        </Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Меню пользователя ${user.name}`} className="rounded-full">
          <Avatar className="size-10">
            <AvatarFallback className="bg-secondary font-bold text-secondary-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-bold text-foreground">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleLabel[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/account")}>
          <UserRound /> Личный кабинет
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/account?tab=favorites")}>
          <Heart /> Избранное
        </DropdownMenuItem>
        {can("admin.access") && (
          <DropdownMenuItem onSelect={() => navigate("/admin")}>
            <LayoutDashboard /> Кабинет сотрудника
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            logout()
            navigate("/")
          }}
        >
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Header() {
  const { favorites, user, can, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex h-10 items-center rounded-lg px-3 text-[15px] font-semibold transition-colors hover:bg-accent hover:text-secondary-foreground",
      isActive && "bg-secondary text-secondary-foreground",
    )

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container-page flex h-16 items-center gap-4 md:h-20">
        <Logo />
        <nav aria-label="Основная навигация" className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {navItems.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className={linkClass}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="relative size-12 md:size-10">
            <Link to={user ? "/account?tab=favorites" : "/favorites"} aria-label={`Избранное: ${favorites.length}`}>
              <Heart />
              {favorites.length > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary-foreground px-1 text-[10px] font-bold text-white"
                >
                  {favorites.length}
                </span>
              )}
            </Link>
          </Button>
          <UserMenu />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-12 lg:hidden" aria-label="Открыть меню">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs bg-background p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
                <SheetDescription className="sr-only">Навигация по сайту</SheetDescription>
              </SheetHeader>
              <nav aria-label="Мобильная навигация" className="flex flex-col gap-1 px-4">
                {navItems.map((n) => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => cn(linkClass({ isActive }), "h-12 text-base")}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t p-4">
                {user ? (
                  <>
                    <Button asChild variant="secondary" size="lg">
                      <Link to="/account">
                        <UserRound /> Личный кабинет
                      </Link>
                    </Button>
                    {can("admin.access") && (
                      <Button asChild variant="outline" size="lg">
                        <Link to="/admin">
                          <LayoutDashboard /> Кабинет сотрудника
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="lg" onClick={logout}>
                      <LogOut /> Выйти
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="secondary" size="lg">
                      <Link to="/login">Войти</Link>
                    </Button>
                    <Button asChild variant="ghost" size="lg">
                      <Link to="/register">Зарегистрироваться</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

function SubscribeForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Кажется, в адресе опечатка")
      return
    }
    setError("")
    setBusy(true)
    try {
      await api.subscribe(email)
      setEmail("")
      toast.success("Подписка оформлена! Расскажем о новых хвостах первыми 🐾")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="subscribe-email" className="font-bold">
        Новые питомцы — на почту
      </label>
      <p className="text-sm text-foreground/80">Раз в неделю, без спама. Только хвосты.</p>
      <div className="flex gap-2">
        <Input
          id="subscribe-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "subscribe-error" : undefined}
        />
        {/* Не жёлтая: в футере рядом может быть CTA страницы */}
        <Button type="submit" variant="outline" disabled={busy}>
          Подписаться
        </Button>
      </div>
      {error && (
        <p id="subscribe-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

function Footer() {
  return (
    <footer className="mt-auto bg-secondary">
      <div className="container-page grid gap-8 py-12 md:grid-cols-2 md:py-16 lg:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="text-sm text-foreground/80">
            Приют для кошек и собак в Санкт-Петербурге. С 2016 года помогаем хвостам найти свой дом.
          </p>
          <div className="flex gap-2">
            {[
              { label: "ВКонтакте", short: "VK" },
              { label: "Telegram", short: "TG" },
              { label: "YouTube", short: "YT" },
            ].map((s) => (
              <a
                key={s.short}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-label={`Мы в ${s.label}`}
                className="flex size-10 items-center justify-center rounded-lg bg-card text-xs font-bold text-secondary-foreground transition hover:bg-accent"
              >
                {s.short}
              </a>
            ))}
          </div>
        </div>
        <nav aria-label="Навигация в подвале">
          <h2 className="mb-4 text-base">Разделы</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {[...navItems, { to: "/account", label: "Личный кабинет" }].map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="rounded hover:text-secondary-foreground hover:underline">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-4 text-base">Контакты</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              СПб, ул. Солнечная, 12
            </li>
            <li className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <a href="tel:+78121234567" className="hover:underline">
                +7 (812) 123-45-67
              </a>
            </li>
            <li className="flex gap-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <a href="mailto:hello@dobryi-dom.ru" className="hover:underline">
                hello@dobryi-dom.ru
              </a>
            </li>
            <li className="text-foreground/80">Ежедневно 11:00–19:00</li>
          </ul>
        </div>
        <SubscribeForm />
      </div>
      <div className="border-t border-secondary-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-foreground/80 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} АНО «Добрый дом». Сделано с любовью к хвостам.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:underline">
              Политика конфиденциальности
            </Link>
            <Link to="/about#docs" className="hover:underline">
              Отчёты и документы
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <Header />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <Footer />
      <DemoBanner />
    </div>
  )
}
