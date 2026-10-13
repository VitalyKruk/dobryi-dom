import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Home,
  Info,
  PawPrint,
  Percent,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeading } from "@/components/layout/admin-layout"
import { HBars, StackedBars } from "@/components/charts"
import { ApplicationStatusBadge, PetImage, PetStatusBadge } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatDate, formatNumber, plural } from "@/lib/format"
import type { FakeDoorStat } from "@/lib/fake-door"
import type { Analytics, Insight } from "@/lib/types"
import { cn } from "@/lib/utils"

const card = "flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-4 ring-1 ring-foreground/5 md:p-6"

function Panel({ title, id, children, className }: { title: string; id: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn(card, className)} aria-labelledby={id}>
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

const toneStyle: Record<Insight["tone"], { icon: typeof Info; className: string }> = {
  warning: { icon: AlertTriangle, className: "bg-warning text-warning-foreground" },
  info: { icon: Info, className: "bg-secondary text-secondary-foreground" },
  success: { icon: CheckCircle2, className: "bg-success text-success-foreground" },
}

/** Подсказки команде: сервер находит, где проседает работа, и предлагает, что сделать */
function Insights({ items }: { items: Insight[] }) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-4" aria-labelledby="insights-title">
      <h2 id="insights-title" className="text-xl">
        Что сделать на этой неделе
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((it) => {
          const t = toneStyle[it.tone]
          const body = (
            <>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.className)}>
                <t.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-bold">{it.title}</span>
                <span className="text-sm text-muted-foreground">{it.text}</span>
              </span>
            </>
          )
          return (
            <li key={it.title}>
              {it.link ? (
                <Link
                  to={it.link}
                  className="flex h-full gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/5 transition hover:ring-secondary-border"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex h-full gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Фейкдоры: сколько раз нажимали кнопки функций, которых ещё нет, — спрос до разработки */
function FakeDoors({ items }: { items: FakeDoorStat[] }) {
  const total = items.reduce((s, x) => s + x.count, 0)
  const last = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё не нажимали"
  return (
    <Panel title="Кнопки в разработке" id="fake-doors-title">
      <p className="text-sm text-muted-foreground">
        Оплата доната и соцсети пока ведут на страницу «Раздел в разработке». Переходы показывают, на что есть спрос:
        {total ? ` всего ${formatNumber(total)} ${plural(total, ["переход", "перехода", "переходов"])}.` : " переходов пока не было."}
      </p>
      <HBars
        items={items.map((x) => ({ label: x.label, value: x.count, hint: last(x.lastAt) }))}
        max={Math.max(1, ...items.map((x) => x.count))}
        format={(n) => `${formatNumber(n)} ${plural(n, ["переход", "перехода", "переходов"])}`}
      />
    </Panel>
  )
}

const days = (n: number | null) => (n === null ? "—" : `${formatNumber(n)} ${plural(Math.round(n), ["день", "дня", "дней"])}`)

function AnalyticsBlock({ a }: { a: Analytics }) {
  const t = a.totals
  const change = t.prev4 ? Math.round(((t.last4 - t.prev4) / t.prev4) * 100) : null
  const kpis = [
    {
      icon: change !== null && change < 0 ? TrendingDown : TrendingUp,
      label: "Заявок за 4 недели",
      value: formatNumber(t.last4),
      hint: change === null ? undefined : `${change > 0 ? "+" : ""}${change}% к прошлым 4 неделям`,
    },
    { icon: Percent, label: "Одобряем заявок", value: `${t.approvalRate}%`, hint: "из рассмотренных за 12 недель" },
    { icon: Clock, label: "Решение по заявке", value: days(t.avgDecisionDays), hint: "в среднем от подачи" },
    { icon: Home, label: "От приюта до дома", value: days(t.avgDaysToHome), hint: "в среднем у пристроенных" },
  ]
  const weeks = a.weeks.map((w) => ({
    ...w,
    label: new Date(w.start).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
  }))
  const funnelTop = a.funnel[0]?.value ?? 0
  const perPet = (x: Analytics["species"][number]) => (x.waiting ? x.applications / x.waiting : 0).toFixed(1).replace(".", ",")

  return (
    <>
      <Insights items={a.insights} />

      <dl className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
        {kpis.map((m) => (
          <div key={m.label} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/5 md:p-6">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <m.icon className="size-4 shrink-0" aria-hidden="true" />
              {m.label}
            </dt>
            <dd className="flex flex-col">
              <span className="text-2xl leading-8 font-extrabold md:text-3xl md:leading-10">{m.value}</span>
              {m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Заявки по неделям" id="weeks-title" className="xl:col-span-2">
          <StackedBars
            data={weeks}
            caption="Заявки по неделям за 12 недель, по статусам"
            series={[
              { key: "approved", label: "Одобрены", className: "bg-success-dot" },
              { key: "pending", label: "На рассмотрении", className: "bg-secondary-foreground" },
              { key: "rejected", label: "Отклонены", className: "bg-warning-dot" },
              { key: "cancelled", label: "Отозваны", className: "bg-muted-foreground/40" },
            ]}
            marker={(w) =>
              w.adopted ? (
                <span title={`Уехали домой: ${w.adopted}`}>
                  🏠<span className="sr-only">Уехали домой: {w.adopted}</span>
                </span>
              ) : null
            }
          />
          <p className="text-sm text-muted-foreground">🏠 — неделя, когда кто-то из питомцев уехал домой.</p>
        </Panel>

        <Panel title="Воронка за 12 недель" id="funnel-title">
          <HBars
            items={a.funnel.map((f, i) => ({
              label: f.label,
              value: f.value,
              hint: i > 0 && funnelTop ? `${Math.round((f.value / funnelTop) * 100)}%` : undefined,
              className: i === a.funnel.length - 1 ? "bg-success-dot" : undefined,
            }))}
            max={funnelTop}
            format={formatNumber}
          />
          <p className="text-sm text-muted-foreground">
            На одного питомца обычно приходит несколько заявок, а домой он уезжает с одной семьёй — поэтому воронка узкая.
          </p>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Спрос: кошки и собаки" id="species-title">
          <HBars
            items={a.species.map((x) => ({
              label: x.species === "cat" ? "🐱 Кошки" : "🐶 Собаки",
              value: x.applications,
              hint: `на ${x.waiting} в приюте`,
              className: x.species === "cat" ? "bg-primary" : "bg-secondary-foreground",
            }))}
            format={(n) => `${formatNumber(n)} ${plural(n, ["заявка", "заявки", "заявок"])}`}
          />
          <p className="text-sm text-muted-foreground">
            В среднем {a.species.map((x) => `${perPet(x)} на ${x.species === "cat" ? "кошку" : "собаку"}`).join(" и ")} за 12 недель.
          </p>
        </Panel>

        <Panel title="Почему отказываем" id="reasons-title">
          {a.rejectReasons.length === 0 ? (
            <p className="text-muted-foreground">Отказов за 12 недель не было.</p>
          ) : (
            <HBars
              items={a.rejectReasons.map((r) => ({
                label: r.reason,
                value: r.count,
                hint: t.rejected ? `${Math.round((r.count / t.rejected) * 100)}%` : undefined,
              }))}
              barClassName="bg-warning-dot"
            />
          )}
        </Panel>

        <Panel title="Больше всего заявок" id="top-title">
          {a.topPets.length === 0 ? (
            <p className="text-muted-foreground">Заявок за 12 недель не было.</p>
          ) : (
            <ol className="flex flex-col divide-y">
              {a.topPets.map((p, i) => (
                <li key={p.id} className="flex items-center gap-4 py-2">
                  <span className="w-4 text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                  <PetImage src={p.photo} alt="" width={96} ratio={1} className="size-10 shrink-0 rounded-lg" />
                  <Link to={`/pet/${p.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {p.value} {plural(p.value, ["заявка", "заявки", "заявок"])}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  )
}

export default function DashboardPage() {
  const { user, can } = useAuth()
  const data = useAsync(async () => {
    const [stats, apps, pets, analytics, fakeDoors] = await Promise.all([
      api.getStats(),
      api.listApplications(),
      api.listAllPets(),
      can("applications.view") ? api.getAnalytics() : Promise.resolve(null),
      // Переходы по кнопкам в разработке — только администраторам
      can("users.manage") ? api.getFakeDoorStats() : Promise.resolve(null),
    ])
    return { stats, apps, pets, analytics, fakeDoors, now: Date.now() }
  }, [])

  if (data.status === "error") return <ErrorState onRetry={data.reload} />
  const d = data.data

  const metrics = [
    { icon: ClipboardList, label: "Новых заявок за 7 дней", value: d?.stats.newApplications },
    { icon: PawPrint, label: "Всего в приюте", value: d?.stats.waiting },
    { icon: Home, label: "Свободно", value: d?.stats.available },
    { icon: Timer, label: "Забронировано", value: d?.stats.reserved },
  ]
  const longest = d?.pets
    .filter((p) => p.status === "available")
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .slice(0, 5)
  const daysWaiting = (iso: string) => Math.floor(((d?.now ?? 0) - new Date(iso).getTime()) / 86_400_000)

  return (
    <>
      <AdminHeading title={`Добрый день, ${user?.name.split(" ")[0]}!`} subtitle="Что происходит в приюте прямо сейчас." />
      <dl className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <m.icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <dt className="order-2 text-sm text-muted-foreground">{m.label}</dt>
              <dd className="order-1 text-3xl leading-10 font-extrabold">
                {m.value === undefined ? <Skeleton className="h-10 w-16" /> : formatNumber(m.value)}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {d?.analytics ? (
        <AnalyticsBlock a={d.analytics} />
      ) : (
        !d &&
        can("applications.view") && (
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-80 rounded-3xl xl:col-span-2" />
            <Skeleton className="h-80 rounded-3xl" />
          </div>
        )
      )}

      {d?.fakeDoors && <FakeDoors items={d.fakeDoors} />}

      <div className="grid gap-6 xl:grid-cols-2">
        {can("applications.view") && (
          <section className={card} aria-labelledby="recent-title">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recent-title" className="text-xl">
                Последние заявки
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/applications">
                  Все <ArrowRight />
                </Link>
              </Button>
            </div>
            <ul className="flex flex-col divide-y">
              {!d
                ? Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="py-4">
                      <Skeleton className="h-10 w-full" />
                    </li>
                  ))
                : d.apps.length === 0
                  ? [
                      <li key="empty" className="py-4 text-muted-foreground">
                        Заявок пока нет — как только кто-то откликнется, они появятся здесь.
                      </li>,
                    ]
                  : d.apps.slice(0, 5).map((a) => {
                      const pet = d.pets.find((p) => p.id === a.petId)
                      return (
                        <li key={a.id}>
                          <Link
                            to={`/admin/applications?id=${a.id}`}
                            className="flex items-center gap-4 rounded-lg py-4 transition hover:bg-muted/50"
                          >
                            <PetImage src={pet?.photos[0]} alt="" width={96} ratio={1} className="size-10 shrink-0 rounded-lg" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">
                                {a.name} → {pet?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">{formatDate(a.createdAt)}</p>
                            </div>
                            <ApplicationStatusBadge status={a.status} />
                          </Link>
                        </li>
                      )
                    })}
            </ul>
          </section>
        )}

        <section className={card} aria-labelledby="longest-title">
          <div className="flex items-center justify-between gap-4">
            <h2 id="longest-title" className="text-xl">
              Дольше всех ждут дом
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pets">
                Все <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="flex flex-col divide-y">
            {!longest
              ? Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="py-4">
                    <Skeleton className="h-10 w-full" />
                  </li>
                ))
              : longest.length === 0
                ? [
                    <li key="empty" className="py-4 text-muted-foreground">
                      Свободных питомцев нет — все хвосты дома или забронированы 🎉
                    </li>,
                  ]
                : longest.map((p) => {
                    const n = daysWaiting(p.addedAt)
                    return (
                      <li key={p.id} className="flex items-center gap-4 py-4">
                        <PetImage src={p.photos[0]} alt="" width={96} ratio={1} className="size-10 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-sm text-muted-foreground">
                            В приюте {n} {plural(n, ["день", "дня", "дней"])}
                          </p>
                        </div>
                        <PetStatusBadge status={p.status} sex={p.sex} />
                      </li>
                    )
                  })}
          </ul>
          <p className="text-sm text-muted-foreground">Идея: сделайте им новые фото и расскажите о них в соцсетях 📸</p>
        </section>
      </div>
    </>
  )
}
