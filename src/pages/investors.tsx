/*
 * Раздел для инвесторов и партнёров. Все цифры — из базы сайта (/api/investors считает их той же
 * функцией, что и дашборд сотрудников) или из тех же констант, что на остальных страницах.
 * Финансовых данных в проекте нет, поэтому раздел их не показывает и прямо об этом говорит.
 */
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock,
  HandCoins,
  Home,
  Info,
  Package,
  Percent,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { HBars, StackedBars } from "@/components/charts"
import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatDate, formatNumber, plural } from "@/lib/format"
import { FOUNDED_YEAR, needs, partners, team } from "@/lib/seed"
import type { InvestorReport } from "@/lib/types"
import { cn } from "@/lib/utils"

const card = "flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5"

const days = (n: number | null) => (n === null ? "—" : `${formatNumber(n)} ${plural(Math.round(n), ["день", "дня", "дней"])}`)

function Section({ id, title, lead, children, className }: { id: string; title: string; lead?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("container-page pb-12 md:pb-16 lg:pb-24", className)} aria-labelledby={id}>
      <div className="mb-8 flex max-w-3xl flex-col gap-2 md:mb-12">
        <h2 id={id} className="text-3xl leading-10">
          {title}
        </h2>
        {lead && <p className="text-lg leading-7 text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Home; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/5 md:p-6">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="flex flex-col">
        <span className="text-3xl leading-10 font-extrabold text-secondary-foreground">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  )
}

function Metrics({ r }: { r: InvestorReport }) {
  const t = r.totals
  const change = t.prev4 ? Math.round(((t.last4 - t.prev4) / t.prev4) * 100) : null
  const adoptedTotal = r.adoptedBeforeSite + r.pets.adoptedOnSite
  const weeks = r.weeks.map((w) => ({
    ...w,
    label: new Date(w.start).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
  }))
  const funnelTop = r.funnel[0]?.value ?? 0
  const perPet = (x: InvestorReport["species"][number]) => (x.waiting ? x.applications / x.waiting : 0).toFixed(1).replace(".", ",")

  return (
    <>
      <Section
        id="impact-title"
        title="Результат"
        lead="Главный показатель приюта — сколько животных уехали в семьи и как быстро это происходит."
      >
        <dl className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-3">
          <Kpi
            icon={Home}
            label="Нашли дом за всё время"
            value={formatNumber(adoptedTotal)}
            hint={`${formatNumber(r.adoptedBeforeSite)} до запуска сайта + ${formatNumber(r.pets.adoptedOnSite)} через сайт`}
          />
          <Kpi
            icon={Users}
            label="Ждут дома сейчас"
            value={formatNumber(r.pets.waiting)}
            hint={`${formatNumber(r.pets.available)} свободны, ${formatNumber(r.pets.reserved)} забронированы`}
          />
          <Kpi
            icon={change !== null && change < 0 ? TrendingDown : TrendingUp}
            label="Заявок за 4 недели"
            value={formatNumber(t.last4)}
            hint={change === null ? undefined : `${change > 0 ? "+" : ""}${change}% к предыдущим 4 неделям`}
          />
          <Kpi icon={Percent} label="Одобряем заявок" value={`${t.approvalRate}%`} hint="из рассмотренных за 12 недель" />
          <Kpi icon={Clock} label="Решение по заявке" value={days(t.avgDecisionDays)} hint="в среднем от подачи" />
          <Kpi icon={CalendarDays} label="От приюта до дома" value={days(t.avgDaysToHome)} hint="в среднем у пристроенных через сайт" />
        </dl>
      </Section>

      <Section
        id="dynamics-title"
        title="Динамика за 12 недель"
        lead={`Заявки на знакомство по неделям и их итог. Всего за период — ${formatNumber(t.applications)}, домой уехали ${formatNumber(t.adopted)} ${plural(t.adopted, ["питомец", "питомца", "питомцев"])}.`}
      >
        <div className="grid gap-6 xl:grid-cols-3">
          {/* min-w-0: иначе 12 столбиков с подписями распирают ячейку сетки на телефоне */}
          <div className={cn(card, "min-w-0 xl:col-span-2")}>
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
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <div className={card}>
              <h3 className="text-xl">Воронка пристройства</h3>
              <HBars
                items={r.funnel.map((f, i) => ({
                  label: f.label,
                  value: f.value,
                  hint: i > 0 && funnelTop ? `${Math.round((f.value / funnelTop) * 100)}%` : undefined,
                  className: i === r.funnel.length - 1 ? "bg-success-dot" : undefined,
                }))}
              />
            </div>
            <div className={card}>
              <h3 className="text-xl">Спрос: кошки и собаки</h3>
              <HBars
                items={r.species.map((x) => ({
                  label: x.species === "cat" ? "🐱 Кошки" : "🐶 Собаки",
                  value: x.applications,
                  hint: `${perPet(x)} на одного из ${x.waiting} в приюте`,
                  className: x.species === "cat" ? "bg-primary" : "bg-secondary-foreground",
                }))}
              />
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}

function MetricsSkeleton() {
  return (
    <section className="container-page pb-12 md:pb-16 lg:pb-24" aria-busy="true" aria-label="Загружаем показатели">
      <Skeleton className="mb-8 h-10 w-48" />
      <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-12 h-72 rounded-2xl" />
    </section>
  )
}

const platform = [
  { title: "Каталог и подбор", text: "Фильтры по характеру и условиям, подбор «Подходят вам» с процентом совпадения и причинами." },
  { title: "Заявка в 4 шага", text: "Анкета с проверкой полей, черновиком и сводкой; повторная заявка на того же питомца не создаётся." },
  { title: "Кабинет сотрудника", text: "Дашборд с воронкой и подсказками, заявки со статусами и комментариями, расписание волонтёров." },
  { title: "Права и безопасность", text: "Роли пользователь / волонтёр / администратор проверяются на сервере, пароли хранятся как хеш scrypt." },
  { title: "Качество", text: "Интеграционные тесты API, линтер и проверка типов в CI на GitHub Actions, автопроверка уязвимостей (npm audit, Trivy)." },
  { title: "Развёртывание", text: "Docker-образы сайта (nginx) и API (Node 24), публикация в GitHub Container Registry." },
]

export default function InvestorsPage() {
  const report = useAsync(() => api.getInvestorReport(), [])
  const r = report.data
  const years = new Date().getFullYear() - FOUNDED_YEAR

  return (
    <>
      <PageHeader
        title="Инвесторам и партнёрам"
        subtitle="Открытые данные приюта «Добрый дом»: сколько животных нашли семью, как работает пристройство и где нужна помощь. Цифры считаются по базе сайта в момент открытия страницы."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Инвесторам" }]}
      />

      <section className="container-page section-y" aria-labelledby="profile-title">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-4 text-lg leading-7">
            <h2 id="profile-title" className="text-3xl leading-10">
              О проекте
            </h2>
            <p>
              АНО «Добрый дом» — приют для кошек и собак в Санкт-Петербурге. Работаем с {FOUNDED_YEAR} года: начинали с
              гаража и трёх вольеров, сегодня у приюта тёплые вольеры, кошачьи комнаты и собственный медблок.
            </p>
            <p>
              Миссия — чтобы каждое животное получило помощь, а каждая встреча с новой семьёй была осознанной: без спешки и с
              поддержкой после переезда. Сайт ведёт весь путь — от каталога до решения по заявке.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 self-start">
            {[
              { label: plural(years, ["год работы", "года работы", "лет работы"]), value: formatNumber(years) },
              { label: "человек в команде приюта", value: formatNumber(team.length) },
              { label: "волонтёров в расписании", value: r ? formatNumber(r.volunteers) : null },
              { label: "компаний-партнёров", value: formatNumber(partners.length) },
            ].map((n) => (
              <div key={n.label} className="flex flex-col gap-1 rounded-2xl bg-secondary p-6">
                <dt className="order-2 text-sm text-foreground/80">{n.label}</dt>
                <dd className="order-1 text-4xl leading-12 font-extrabold text-secondary-foreground">
                  {n.value ?? (report.status === "error" ? "—" : <Skeleton className="h-12 w-16" />)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {report.status === "error" ? (
        <div className="container-page pb-12 md:pb-16">
          <ErrorState onRetry={report.reload} />
        </div>
      ) : r ? (
        <Metrics r={r} />
      ) : (
        <MetricsSkeleton />
      )}

      <Section
        id="needs-title"
        title="Куда направить помощь"
        lead="Текущие потребности приюта — те же, что на странице «Как помочь». Денежное пожертвование 500 ₽ — это неделя корма для кошки, от 1 000 ₽ — месяц корма для щенка."
      >
        <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {needs.map((n) => {
            const pct = Math.round((n.have / n.goal) * 100)
            return (
              <li key={n.title} className={card}>
                <div className="flex items-start gap-4">
                  <Package className="mt-1 size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <h3 className="text-lg leading-7">{n.title}</h3>
                </div>
                <Progress value={pct} aria-label={`${n.title}: собрано ${pct}%`} className="h-2 bg-secondary" />
                <p className="text-sm text-muted-foreground">
                  Собрано {formatNumber(n.have)} из {formatNumber(n.goal)} {n.unit}
                </p>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        id="platform-title"
        title="Цифровая платформа"
        lead="Сайт приюта — рабочий продукт, а не визитка: через него проходят заявки, решения и учёт волонтёров."
      >
        <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {platform.map((p) => (
            <li key={p.title} className={card}>
              <h3 className="flex items-center gap-2 text-lg leading-7">
                <ClipboardCheck className="size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
                {p.title}
              </h3>
              <p className="text-muted-foreground">{p.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="team-title" title="Команда и партнёры">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <ul className="grid gap-4 sm:grid-cols-2">
            {team.map((t) => (
              <li key={t.name} className={card}>
                <div>
                  <h3 className="text-lg">{t.name}</h3>
                  <p className="text-sm font-semibold text-secondary-foreground">{t.role}</p>
                </div>
                <p className="text-muted-foreground">{t.about}</p>
              </li>
            ))}
          </ul>
          <div className={card}>
            <h3 className="text-lg">Партнёры</h3>
            <ul className="flex flex-col gap-2">
              {partners.map((p) => (
                <li key={p} className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-secondary-foreground" aria-hidden="true" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="method-title" title="Откуда цифры">
        <div className={cn(card, "max-w-3xl")}>
          <ul className="flex flex-col gap-3 text-muted-foreground">
            <li className="flex gap-3">
              <Info className="mt-1 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <span>
                Показатели считаются по базе сайта при каждом открытии страницы — теми же формулами, что на дашборде сотрудников.
                {r && <> Обновлено: {formatDate(r.generatedAt)}.</>}
              </span>
            </li>
            <li className="flex gap-3">
              <Info className="mt-1 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <span>
                Динамика, воронка и доля одобрений — за последние 12 недель.
                {r?.dataSince && (
                  <>
                    {" "}
                    В базе {formatNumber(r.applicationsAllTime)} {plural(r.applicationsAllTime, ["заявка", "заявки", "заявок"])}, самая ранняя —{" "}
                    {formatDate(r.dataSince)}.
                  </>
                )}
              </span>
            </li>
            <li className="flex gap-3">
              <Info className="mt-1 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <span>
                {r ? formatNumber(r.adoptedBeforeSite) : "…"} пристройств до запуска сайта взяты из архива приюта — в базе сайта
                этих питомцев нет.
              </span>
            </li>
            <li className="flex gap-3">
              <Info className="mt-1 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
              <span>
                Финансовой отчётности на сайте пока нет, поэтому здесь нет денежных показателей. Запросить её можно через
                страницу «Контакты».
              </span>
            </li>
          </ul>
        </div>
      </Section>

      <section className="bg-secondary section-y" aria-labelledby="cta-title">
        <div className="container-page flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="cta-title" className="text-3xl leading-10">
              Обсудим партнёрство?
            </h2>
            <p className="text-lg leading-7 text-foreground/80">
              Напишите нам — ответим на вопросы о приюте и сотрудничестве.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link to="/contacts">
                Написать нам <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/help#donate">
                <HandCoins /> Помочь сейчас
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
