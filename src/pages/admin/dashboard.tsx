import { Link } from "react-router-dom"
import { ArrowRight, ClipboardList, Home, PawPrint, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeading } from "@/components/layout/admin-layout"
import { ApplicationStatusBadge, PetImage, PetStatusBadge } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatDate, formatNumber, plural } from "@/lib/format"

export default function DashboardPage() {
  const { user, can } = useAuth()
  const data = useAsync(async () => {
    const [stats, apps, pets] = await Promise.all([api.getStats(), api.listApplications(), api.listAllPets()])
    return { stats, apps, pets }
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
  const daysWaiting = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

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

      <div className="grid gap-6 xl:grid-cols-2">
        {can("applications.view") && (
          <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-4 ring-1 ring-foreground/5 md:p-6" aria-labelledby="recent-title">
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

        <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-4 ring-1 ring-foreground/5 md:p-6" aria-labelledby="longest-title">
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
              : longest.map((p) => {
                  const days = daysWaiting(p.addedAt)
                  return (
                    <li key={p.id} className="flex items-center gap-4 py-4">
                      <PetImage src={p.photos[0]} alt="" width={96} ratio={1} className="size-10 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm text-muted-foreground">
                          В приюте {days} {plural(days, ["день", "дня", "дней"])}
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
