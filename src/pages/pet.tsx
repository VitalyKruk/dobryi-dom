import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowRight, Check, ChevronLeft, ChevronRight, Info, Share2, X } from "lucide-react"
import { toast } from "sonner"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Crumbs } from "@/components/page-header"
import { FavoriteButton, NewBadge, PetCard, PetCardSkeleton, PetImage, PetStatusBadge } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import {
  coatLabel,
  compatLabel,
  formatAge,
  g,
  isNew,
  sexLabel,
  sizeLabel,
  speciesLabelBySex,
} from "@/lib/format"
import type { Compat, Pet } from "@/lib/types"
import { cn } from "@/lib/utils"
import NotFoundPage from "./not-found"

function Gallery({ pet }: { pet: Pet }) {
  const [index, setIndex] = useState(0)
  const touchX = useRef<number | null>(null)
  const n = pet.photos.length
  const go = (i: number) => setIndex((i + n) % n)
  const alt = (i: number) => `${speciesLabelBySex(pet.species, pet.sex)} ${pet.name}, фото ${i + 1} из ${n}`

  return (
    <div className="flex flex-col gap-4">
      <div
        role="region"
        aria-roledescription="галерея"
        aria-label={`Фотографии: ${pet.name}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(index - 1)
          if (e.key === "ArrowRight") go(index + 1)
        }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
          touchX.current = null
        }}
        className="group relative overflow-hidden rounded-3xl"
      >
        <PetImage src={pet.photos[index]} alt={alt(index)} width={960} eager className="rounded-3xl" />
        {n > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => go(index - 1)}
              aria-label="Предыдущее фото"
              className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full border-transparent bg-card/90 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => go(index + 1)}
              aria-label="Следующее фото"
              className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full border-transparent bg-card/90 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronRight />
            </Button>
            <p className="sr-only" aria-live="polite">
              Фото {index + 1} из {n}
            </p>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex gap-2" role="group" aria-label="Миниатюры">
          {pet.photos.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Показать фото ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "w-24 overflow-hidden rounded-xl ring-2 ring-transparent transition md:w-28",
                i === index ? "ring-secondary-foreground" : "opacity-70 hover:opacity-100",
              )}
            >
              <PetImage src={src} alt="" width={160} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HealthItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full",
          ok ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {ok ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
      <span>
        {label}
        <span className="sr-only">: {ok ? "да" : "нет"}</span>
        {!ok && <span className="text-muted-foreground"> — пока нет</span>}
      </span>
    </li>
  )
}

function CompatRow({ label, value }: { label: string; value: Compat }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span>{label}</span>
      <Badge variant={value === "yes" ? "success" : value === "no" ? "warning" : "muted"}>{compatLabel[value]}</Badge>
    </div>
  )
}

async function share(pet: Pet) {
  const url = window.location.href
  const data = { title: `${pet.name} ищет дом`, text: `Познакомьтесь: ${pet.name} из приюта «Добрый дом» 🐾`, url }
  try {
    if (navigator.share) {
      await navigator.share(data)
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success("Ссылка скопирована — поделитесь ею с друзьями!")
  } catch (e) {
    if ((e as Error).name !== "AbortError") toast.error("Не получилось поделиться. Скопируйте адрес из строки браузера.")
  }
}

function PetSkeleton() {
  return (
    <div className="container-page grid gap-8 py-8 md:py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

function Similar({ pet }: { pet: Pet }) {
  const { status, data, reload } = useAsync(() => api.getSimilarPets(pet, 4), [pet.id])
  if (status === "success" && data.length === 0) return null
  return (
    <section className="container-page section-y" aria-labelledby="similar-title">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h2 id="similar-title" className="text-3xl leading-10">
          Похожие {pet.species === "cat" ? "котики" : "пёсели"}
        </h2>
        <Button asChild variant="outline">
          <Link to={`/catalog?species=${pet.species}`}>
            Смотреть всех <ArrowRight />
          </Link>
        </Button>
      </div>
      {status === "error" ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {status === "loading"
            ? Array.from({ length: 4 }, (_, i) => <PetCardSkeleton key={i} />)
            : data.map((p) => <PetCard key={p.id} pet={p} />)}
        </div>
      )}
    </section>
  )
}

export default function PetPage() {
  const { id = "" } = useParams()
  const { status, data: pet, reload } = useAsync(() => api.getPet(id), [id])
  const ctaRef = useRef<HTMLDivElement>(null)
  const [ctaVisible, setCtaVisible] = useState(true)

  useEffect(() => {
    const el = ctaRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCtaVisible(e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [pet])

  useEffect(() => {
    if (pet) document.title = `${pet.name} — Добрый дом`
    return () => {
      document.title = "Добрый дом — приют для кошек и собак"
    }
  }, [pet])

  if (status === "loading") return <PetSkeleton />
  if (status === "error")
    return (
      <div className="container-page section-y">
        <ErrorState onRetry={reload} />
      </div>
    )
  if (!pet)
    return (
      <NotFoundPage
        title="Такого питомца мы не нашли 🐾"
        text="Возможно, он уже нашёл дом — это хорошая новость! Загляните в каталог: там ждут другие."
      />
    )

  const adopted = pet.status === "adopted"
  const facts = [
    { label: "Возраст", value: formatAge(pet.birthDate) },
    { label: "Пол", value: sexLabel[pet.sex] },
    { label: "Порода", value: pet.breed },
    { label: "Вес", value: `${pet.weightKg.toLocaleString("ru-RU")} кг` },
    { label: "Размер", value: sizeLabel[pet.size] },
    { label: "Шерсть", value: coatLabel[pet.coat] },
  ]

  return (
    <>
      <div className="container-page flex flex-col gap-6 pt-6 pb-12 md:pt-8 lg:pb-16">
        <Crumbs items={[{ label: "Главная", to: "/" }, { label: "Каталог", to: "/catalog" }, { label: pet.name }]} />
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Gallery pet={pet} />
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <PetStatusBadge status={pet.status} sex={pet.sex} />
                {isNew(pet) && !adopted && <NewBadge sex={pet.sex} />}
              </div>
              <h1 className="text-4xl leading-12">{pet.name}</h1>
              <p className="text-lg leading-7 text-muted-foreground">
                {speciesLabelBySex(pet.species, pet.sex)} · {formatAge(pet.birthDate)} · {pet.breed}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-secondary p-6 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-col">
                  <dt className="text-sm text-secondary-foreground">{f.label}</dt>
                  <dd className="font-bold">{f.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg">Характер</h2>
              <ul className="flex flex-wrap gap-2">
                {pet.traits.map((t) => (
                  <li key={t}>
                    <Badge variant="outline" className="h-8 px-3 text-sm">
                      {t}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg">Здоровье</h2>
              <ul className="grid gap-2 sm:grid-cols-3">
                <HealthItem ok={pet.vaccinated} label={g(pet.sex, "Привит", "Привита")} />
                <HealthItem ok={pet.sterilized} label={pet.sex === "male" ? "Кастрирован" : "Стерилизована"} />
                <HealthItem ok={pet.chipped} label={g(pet.sex, "Чипирован", "Чипирована")} />
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg">История</h2>
              <p className="leading-7">{pet.story}</p>
            </div>

            {adopted ? (
              <div className="flex flex-col gap-4 rounded-2xl bg-success p-6 text-success-foreground">
                <p className="text-xl font-bold">{g(pet.sex, "Этот друг", "Эта подруга")} уже дома 💛</p>
                <p>Спасибо всем, кто помог! Посмотрите похожих питомцев — они тоже ждут.</p>
              </div>
            ) : (
              <div ref={ctaRef} className="flex flex-col gap-4">
                {pet.status === "reserved" && (
                  <p className="flex gap-2 rounded-2xl bg-warning p-4 text-sm text-warning-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {g(pet.sex, "Его", "Её")} уже забронировали, но заявку оставить можно: если знакомство не сложится, мы
                    позвоним вам первыми.
                  </p>
                )}
                <Button asChild size="lg" className="h-14 text-lg">
                  <Link to={`/apply/${pet.id}`}>{pet.status === "reserved" ? "Встать в очередь" : "Оставить заявку"}</Link>
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <FavoriteButton pet={pet} variant="outline" />
                  <Button variant="ghost" size="lg" onClick={() => share(pet)}>
                    <Share2 /> Поделиться
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="bg-secondary section-y" aria-labelledby="care-title">
        <div className="container-page grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div className="flex flex-col gap-2">
            <h2 id="care-title" className="text-3xl leading-10">
              Об уходе
            </h2>
            <p className="text-lg leading-7 text-foreground/80">
              Всё, что кураторы знают о характере и привычках. Остались вопросы — спросите при знакомстве или по телефону.
            </p>
          </div>
          <Accordion type="multiple" defaultValue={["kids"]} className="rounded-2xl bg-card px-6">
            <AccordionItem value="kids">
              <AccordionTrigger className="py-4 text-base font-bold">Совместимость с детьми</AccordionTrigger>
              <AccordionContent>
                <CompatRow label="Дети" value={pet.goodWithKids} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="pets">
              <AccordionTrigger className="py-4 text-base font-bold">Совместимость с животными</AccordionTrigger>
              <AccordionContent>
                <CompatRow label="Кошки" value={pet.goodWithCats} />
                <CompatRow label="Собаки" value={pet.goodWithDogs} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="needs">
              <AccordionTrigger className="py-4 text-base font-bold">Особые потребности</AccordionTrigger>
              <AccordionContent className="leading-7">
                {pet.specialNeeds ?? "Особых потребностей нет — обычный уход, любовь и вкусняшки."}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="care" className="border-b-0">
              <AccordionTrigger className="py-4 text-base font-bold">Уход и питание</AccordionTrigger>
              <AccordionContent className="leading-7">{pet.careNotes || "Без особенностей."}</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <Similar pet={pet} />

      {/* Мобильная sticky-CTA заменяет основную кнопку, когда та ушла из вида */}
      {!adopted && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-4 backdrop-blur transition-transform lg:hidden",
            ctaVisible ? "translate-y-full" : "translate-y-0",
          )}
          aria-hidden={ctaVisible}
          inert={ctaVisible}
        >
          <div className="flex items-center gap-4">
            <PetImage src={pet.photos[0]} alt="" width={96} ratio={1} className="size-12 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{pet.name}</p>
              <p className="truncate text-sm text-muted-foreground">{formatAge(pet.birthDate)}</p>
            </div>
            <Button asChild size="lg">
              <Link to={`/apply/${pet.id}`}>{pet.status === "reserved" ? "В очередь" : "Оставить заявку"}</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
