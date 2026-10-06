import { Suspense, useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { ClipboardList, ExternalLink, LayoutDashboard, Menu, PawPrint, RotateCcw, Users } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DemoBanner } from "@/components/demo-banner"
import { Logo } from "@/components/logo"
import { SkipLink, UserMenu } from "@/components/layout/site-layout"
import { useAuth, type Permission } from "@/context/auth"
import * as api from "@/lib/api"
import { roleLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const items: { to: string; label: string; icon: typeof PawPrint; end?: boolean; permission?: Permission }[] = [
  { to: "/admin", label: "Дашборд", icon: LayoutDashboard, end: true },
  { to: "/admin/pets", label: "Питомцы", icon: PawPrint },
  { to: "/admin/applications", label: "Заявки", icon: ClipboardList, permission: "applications.view" },
  { to: "/admin/volunteers", label: "Волонтёры и роли", icon: Users, permission: "volunteers.manage" },
]

function SideNav({ pending }: { pending: number | null }) {
  const { can, user } = useAuth()
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo to="/admin" className="px-2" />
      <nav aria-label="Разделы кабинета" className="flex flex-col gap-1">
        {items
          .filter((i) => !i.permission || can(i.permission))
          .map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  "flex h-12 items-center gap-4 rounded-xl px-4 font-semibold transition hover:bg-card/60",
                  isActive ? "bg-card text-foreground shadow-sm" : "text-secondary-foreground",
                )
              }
            >
              <i.icon className="size-5" aria-hidden="true" />
              <span className="flex-1">{i.label}</span>
              {i.to === "/admin/applications" && !!pending && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary-foreground px-2 text-xs text-white">
                  {pending}
                  <span className="sr-only"> на рассмотрении</span>
                </span>
              )}
            </NavLink>
          ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <div className="rounded-xl bg-card/60 p-4 text-sm">
          <p className="font-bold">{user?.name}</p>
          <p className="text-secondary-foreground">{user && roleLabel[user.role]}</p>
          {user?.role === "volunteer" && (
            <p className="mt-2 text-xs text-foreground/80">Волонтёр видит питомцев и заявки и меняет статусы питомцев.</p>
          )}
        </div>
        <Button asChild variant="ghost" className="justify-start text-secondary-foreground">
          <Link to="/">
            <ExternalLink /> На сайт
          </Link>
        </Button>
        {can("users.manage") && <ResetDemoButton />}
      </div>
    </div>
  )
}

/** Сброс стирает все заявки, правки и пользователей — только с подтверждением */
function ResetDemoButton() {
  const [busy, setBusy] = useState(false)
  const reset = async () => {
    setBusy(true)
    try {
      await api.resetDemoData()
      toast.success("Демо-данные восстановлены")
      setTimeout(() => window.location.reload(), 400)
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="justify-start text-secondary-foreground" disabled={busy}>
          <RotateCcw /> Сбросить демо-данные
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Сбросить демо-данные?</AlertDialogTitle>
          <AlertDialogDescription>
            Питомцы, заявки, расписание и пользователи вернутся к исходному состоянию. Все изменения пропадут.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={reset}>
            Сбросить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AdminLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    api.getStats().then((s) => setPending(s.pendingApplications))
  }, [pathname])

  return (
    <div className="flex min-h-svh">
      <SkipLink />
      <aside className="sticky top-0 hidden h-svh w-72 shrink-0 bg-secondary lg:block">
        <SideNav pending={pending} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/90 px-4 backdrop-blur md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-12 lg:hidden" aria-label="Открыть меню кабинета">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-secondary p-0">
              <SheetTitle className="sr-only">Меню кабинета</SheetTitle>
              <SheetDescription className="sr-only">Разделы кабинета сотрудника</SheetDescription>
              <SideNav pending={pending} />
            </SheetContent>
          </Sheet>
          <p className="font-bold">Кабинет сотрудника</p>
          {user && (
            <Badge variant={user.role === "admin" ? "secondary" : "outline"} className="hidden sm:inline-flex">
              {roleLabel[user.role]}
            </Badge>
          )}
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 outline-none md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-8">
            <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <DemoBanner />
    </div>
  )
}

export function AdminHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl leading-10">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
