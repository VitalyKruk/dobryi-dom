import { Link } from "react-router-dom"
import { ArrowRight, ClipboardList, HandCoins, HandHeart, Home as HomeIcon, Quote, Search, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Skeleton } from "@/components/ui/skeleton"
import { PawIcon } from "@/components/illustrations"
import { PetCard, PetCardSkeleton, PetImage } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatNumber, plural } from "@/lib/format"
import { partners, reviews, seedPets } from "@/lib/seed"

function Hero() {
  const stats = useAsync(() => api.getStats(), [])
  const collage = ["persik", "bublik", "musya"].map((id) => seedPets.find((p) => p.id === id)!)
  return (
    <section className="container-page grid items-center gap-12 pt-8 pb-12 md:pt-16 md:pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24">
      <div className="flex flex-col items-start gap-6">
        <p className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">
          <PawIcon className="size-4" /> Приют для кошек и собак
        </p>
        <h1 className="text-4xl leading-12 md:text-5xl md:leading-14">
          Найди друга, который уже ждёт тебя&nbsp;🐾
        </h1>
        <p className="max-w-xl text-lg leading-7 text-muted-foreground">
          Здесь живут кошки и собаки, которым очень нужен дом. Познакомьтесь с ними онлайн, приезжайте в гости — а
          дальше мы поможем на каждом шаге.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/catalog">
              Смотреть питомцев <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a href="#how">Как это работает</a>
          </Button>
        </div>
        <dl className="mt-4 grid w-full max-w-md grid-cols-2 gap-4">
          {[
            { value: stats.data?.adopted, label: (n: number) => `${plural(n, ["питомец нашёл", "питомца нашли", "питомцев нашли"])} дом` },
            { value: stats.data?.waiting, label: (n: number) => `${plural(n, ["ждёт", "ждут", "ждут"])} сейчас` },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/5">
              <dt className="sr-only">{i === 0 ? "Нашли дом" : "Ждут сейчас"}</dt>
              <dd className="flex flex-col gap-1">
                {s.value === undefined ? (
                  <>
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-28" />
                  </>
                ) : (
                  <>
                    <span className="text-3xl leading-10 font-extrabold text-secondary-foreground">{formatNumber(s.value)}</span>
                    <span className="text-sm text-muted-foreground">{s.label(s.value)}</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative grid grid-cols-2 gap-4" aria-hidden="true">
        <div className="absolute -inset-4 -z-10 rounded-[48px] bg-secondary lg:-inset-8" />
        <PetImage src={collage[0].photos[0]} alt="" width={560} ratio={4 / 5} eager className="row-span-2 self-center rounded-3xl" />
        <PetImage src={collage[1].photos[0]} alt="" width={400} ratio={1} eager className="rounded-3xl" />
        <PetImage src={collage[2].photos[0]} alt="" width={400} ratio={1} eager className="rounded-3xl" />
      </div>
    </section>
  )
}

const steps = [
  { icon: Search, title: "Выбери", text: "Листайте каталог, фильтруйте по характеру и условиям — ищите того, кто подойдёт именно вам." },
  { icon: Users, title: "Познакомься", text: "Приезжайте в гости: погуляйте, поиграйте, задайте кураторам любые вопросы." },
  { icon: ClipboardList, title: "Оставь заявку", text: "Короткая анкета на 3 минуты. Мы перезвоним в течение 1–2 дней." },
  { icon: HomeIcon, title: "Забери домой", text: "Подписываем договор, выдаём памятку и остаёмся на связи после переезда." },
]

function HowItWorks() {
  return (
    <section id="how" className="container-page section-y scroll-mt-20">
      <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
        <h2 className="text-3xl leading-10">Как это работает</h2>
        <p className="text-lg leading-7 text-muted-foreground">Четыре шага от «ой, какой хороший» до «спим вместе на диване».</p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
            <div className="flex items-center justify-between">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                <s.icon className="size-6" aria-hidden="true" />
              </span>
              <span className="text-4xl font-extrabold text-secondary-border" aria-hidden="true">
                {i + 1}
              </span>
            </div>
            <h3 className="text-xl leading-7">
              <span className="sr-only">Шаг {i + 1}. </span>
              {s.title}
            </h3>
            <p className="text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function PetsOfWeek() {
  const { status, data, reload } = useAsync(() => api.getFeaturedPets(6), [])
  return (
    <section className="container-page pb-12 md:pb-16 lg:pb-24" aria-labelledby="week-title">
      <Carousel opts={{ align: "start" }}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-12">
          <div className="flex flex-col gap-2">
            <h2 id="week-title" className="text-3xl leading-10">
              Питомцы недели
            </h2>
            <p className="text-lg leading-7 text-muted-foreground">Те, кто ждёт дольше всех. Может, именно вас?</p>
          </div>
          <div className="flex items-center gap-2">
            <CarouselPrevious size="icon" className="static my-0 hidden md:inline-flex" />
            <CarouselNext size="icon" className="static my-0 hidden md:inline-flex" />
            <Button asChild variant="outline">
              <Link to="/catalog">
                Весь каталог <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        {status === "error" ? (
          <ErrorState onRetry={reload} />
        ) : (
          <CarouselContent className="-ml-4 md:-ml-6">
            {(status === "loading" ? Array.from({ length: 4 }, () => null) : data!).map((pet, i) => (
              <CarouselItem key={pet?.id ?? i} className="basis-[85%] pl-4 sm:basis-1/2 md:pl-6 lg:basis-1/3 xl:basis-1/4">
                {pet ? <PetCard pet={pet} /> : <PetCardSkeleton />}
              </CarouselItem>
            ))}
          </CarouselContent>
        )}
      </Carousel>
    </section>
  )
}

function Reviews() {
  return (
    <section className="bg-secondary section-y" aria-labelledby="reviews-title">
      <div className="container-page">
        <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
          <h2 id="reviews-title" className="text-3xl leading-10">
            Они уже дома 💛
          </h2>
          <p className="text-lg leading-7 text-foreground/80">Истории от тех, кто однажды тоже просто зашёл «посмотреть».</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {reviews.map((r) => {
            const pet = seedPets.find((p) => p.id === r.petId)!
            return (
              <figure key={r.name} className="flex flex-col gap-4 rounded-2xl bg-card p-6">
                <Quote className="size-8 text-secondary-border" aria-hidden="true" />
                <blockquote className="flex-1 leading-7">{r.text}</blockquote>
                <figcaption className="flex items-center gap-4">
                  <PetImage src={pet.photos[0]} alt={pet.name} width={96} ratio={1} className="size-12 shrink-0 rounded-full" />
                  <div>
                    <p className="font-bold">{r.name}</p>
                    <p className="text-sm text-muted-foreground">Забрали {pet.name}</p>
                  </div>
                </figcaption>
              </figure>
            )
          })}
        </div>
        <div className="mt-12 flex flex-col gap-4 md:mt-16">
          <p className="text-sm font-semibold text-secondary-foreground">Нам помогают</p>
          <ul className="flex flex-wrap gap-2">
            {partners.map((p) => (
              <li key={p} className="rounded-lg bg-card/70 px-4 py-2 text-sm font-semibold text-foreground/80">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

const helpCards = [
  { icon: HandHeart, title: "Стать волонтёром", text: "Выгул, уход, фото, автопомощь — найдём дело по душе и по графику.", to: "/help#volunteer", cta: "Стать волонтёром" },
  { icon: HandCoins, title: "Сделать донат", text: "Даже 300 ₽ — это неделя корма для кошки. Отчитываемся за каждый рубль.", to: "/help#donate", cta: "Помочь деньгами" },
  { icon: HomeIcon, title: "Забрать питомца", text: "Самая большая помощь — подарить кому-то из хвостов свой дом.", to: "/catalog", cta: "Выбрать друга" },
]

function HowToHelp() {
  return (
    <section className="container-page section-y" aria-labelledby="help-title">
      <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
        <h2 id="help-title" className="text-3xl leading-10">
          Как помочь
        </h2>
        <p className="text-lg leading-7 text-muted-foreground">Не обязательно забирать питомца, чтобы изменить его жизнь.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 md:gap-6">
        {helpCards.map((c) => (
          <div key={c.title} className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              <c.icon className="size-6" aria-hidden="true" />
            </span>
            <h3 className="text-xl leading-7">{c.title}</h3>
            <p className="flex-1 text-muted-foreground">{c.text}</p>
            <Button asChild variant="outline" className="self-start">
              <Link to={c.to}>
                {c.cta} <ArrowRight />
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <PetsOfWeek />
      <Reviews />
      <HowToHelp />
    </>
  )
}
