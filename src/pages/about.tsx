import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, FileText, MapPin } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/page-header"
import { PetImage } from "@/components/pet"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatNumber, initials } from "@/lib/format"
import { seedPets, team } from "@/lib/seed"

const gallery = seedPets.filter((p) => ["charli", "leva", "nika", "bonya", "sonya", "keks", "alma", "tuchka"].includes(p.id))

export const MAP_SRC = "https://www.openstreetmap.org/export/embed.html?bbox=30.28%2C59.92%2C30.36%2C59.95&layer=mapnik&marker=59.935%2C30.32"

export function MapEmbed() {
  return (
    <div className="overflow-hidden rounded-3xl bg-secondary ring-1 ring-foreground/5">
      <iframe
        title="Карта: как добраться до приюта"
        src={MAP_SRC}
        loading="lazy"
        className="aspect-[4/3] w-full border-0 md:aspect-[16/9]"
      />
    </div>
  )
}

export default function AboutPage() {
  const stats = useAsync(() => api.getStats(), [])
  const [photo, setPhoto] = useState<number | null>(null)
  const numbers = [
    { value: stats.data?.adopted, label: "питомцев нашли дом" },
    { value: stats.data?.waiting, label: "ждут сейчас" },
    { value: 10, label: "лет работы" },
    { value: 85, label: "волонтёров в команде" },
  ]
  return (
    <>
      <PageHeader
        title="О приюте «Добрый дом»"
        subtitle="Мы маленький приют с большими сердцами: помогаем кошкам и собакам вылечиться, отогреться и найти свою семью."
        crumbs={[{ label: "Главная", to: "/" }, { label: "О приюте" }]}
      />

      <section className="container-page section-y grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-4 text-lg leading-7">
          <h2 className="text-3xl leading-10">Наша история</h2>
          <p>
            В 2016 году Ольга забрала с трассы двух щенков и поняла, что остановиться уже не сможет. Сначала был гараж
            и три вольера, потом — первый волонтёр, первый ветеринар и первое «спасибо» от новых хозяев.
          </p>
          <p>
            Сегодня у нас тёплые вольеры, кошачьи комнаты, собственный медблок и десятки людей, которые приходят
            гулять, лечить, фотографировать и просто гладить.
          </p>
          <h2 className="mt-4 text-3xl leading-10">Миссия</h2>
          <p>
            Чтобы каждое животное, попавшее к нам, получило помощь, а каждая встреча с новой семьёй была осознанной — без
            спешки и с поддержкой после переезда.
          </p>
        </div>
        <PetImage
          src="https://images.unsplash.com/photo-1415369629372-26f2fe60c467?crop=entropy"
          alt="Кошка даёт лапу волонтёру"
          width={720}
          className="rounded-3xl"
        />
      </section>

      <section className="bg-secondary section-y" aria-labelledby="numbers-title">
        <div className="container-page">
          <h2 id="numbers-title" className="sr-only">
            Приют в цифрах
          </h2>
          <dl className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
            {numbers.map((n) => (
              <div key={n.label} className="flex flex-col gap-1 rounded-2xl bg-card p-6">
                <dt className="order-2 text-muted-foreground">{n.label}</dt>
                <dd className="order-1 text-4xl leading-12 font-extrabold text-secondary-foreground">
                  {n.value !== undefined ? formatNumber(n.value) : stats.status === "error" ? "—" : <Skeleton className="h-12 w-20" />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-page section-y" aria-labelledby="team-title">
        <h2 id="team-title" className="mb-8 text-3xl leading-10 md:mb-12">
          Команда
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {team.map((t) => (
            <li key={t.name} className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
              <Avatar className="size-16">
                <AvatarFallback className="bg-secondary text-xl font-bold text-secondary-foreground">{initials(t.name)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg">{t.name}</h3>
                <p className="text-sm font-semibold text-secondary-foreground">{t.role}</p>
              </div>
              <p className="text-muted-foreground">{t.about}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page pb-12 md:pb-16 lg:pb-24" aria-labelledby="gallery-title">
        <h2 id="gallery-title" className="mb-8 text-3xl leading-10 md:mb-12">
          Фотоотчёт: они уже дома
        </h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {gallery.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPhoto(i)}
                className="block w-full overflow-hidden rounded-2xl transition hover:opacity-90"
                aria-label={`Открыть фото: ${p.name}`}
              >
                <PetImage src={p.photos[0]} alt="" width={400} ratio={1} />
              </button>
            </li>
          ))}
        </ul>
        <Dialog open={photo !== null} onOpenChange={(o) => !o && setPhoto(null)}>
          <DialogContent className="sm:max-w-3xl">
            {photo !== null && (
              <>
                <DialogTitle>{gallery[photo].name}</DialogTitle>
                <DialogDescription>{gallery[photo].story}</DialogDescription>
                <PetImage src={gallery[photo].photos[0]} alt={gallery[photo].name} width={960} className="rounded-2xl" />
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>

      <section className="container-page pb-12 md:pb-16 lg:pb-24" aria-labelledby="where-title">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <div className="flex flex-col gap-4">
            <h2 id="where-title" className="text-3xl leading-10">
              Как нас найти
            </h2>
            <p className="flex gap-2 text-lg">
              <MapPin className="mt-1 size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
              Санкт-Петербург, ул. Солнечная, 12. Ежедневно 11:00–19:00.
            </p>
            <p className="text-muted-foreground">Пожалуйста, предупредите о визите заранее — так мы подготовим нужных хвостов.</p>
            <div id="docs" className="flex scroll-mt-24 flex-col gap-2 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
              <h3 className="text-lg">Отчёты и документы</h3>
              {["Отчёт за 2025 год", "Устав АНО «Добрый дом»", "Реквизиты"].map((d) => (
                <a
                  key={d}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center gap-2 rounded text-secondary-foreground hover:underline"
                >
                  <FileText className="size-4" aria-hidden="true" /> {d}
                </a>
              ))}
            </div>
            <Button asChild size="lg" className="self-start">
              <Link to="/catalog">
                Познакомиться с питомцами <ArrowRight />
              </Link>
            </Button>
          </div>
          <MapEmbed />
        </div>
      </section>
    </>
  )
}
