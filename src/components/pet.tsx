import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PawIcon } from "@/components/illustrations"
import { useAuth } from "@/context/auth"
import { formatAge, g, isNew, petStatusLabel, sexLabel, sizeLabel, sizedPhoto, speciesLabelBySex } from "@/lib/format"
import type { ApplicationStatus, Pet, PetStatus, Sex } from "@/lib/types"
import { applicationStatusLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Фото с фиксированным соотношением и заглушкой, если картинка не загрузилась */
export function PetImage({
  src,
  alt,
  width = 640,
  ratio = 4 / 3,
  className,
  eager,
}: {
  src?: string
  alt: string
  width?: number
  ratio?: number
  className?: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)} style={{ aspectRatio: ratio }}>
      {src && !failed ? (
        <img
          src={sizedPhoto(src, width, Math.round(width / ratio))}
          srcSet={
            src.includes("unsplash")
              ? `${sizedPhoto(src, width, Math.round(width / ratio))} 1x, ${sizedPhoto(src, width * 2, Math.round((width * 2) / ratio))} 2x`
              : undefined
          }
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          // Фото с Unsplash уже обрезаны по мордочке; для загруженных смещаем кадр чуть вверх — морды обычно там
          className="size-full object-cover object-[50%_35%]"
        />
      ) : (
        <div role="img" aria-label={alt} className="flex size-full items-center justify-center text-secondary-border">
          <PawIcon className="size-1/3" />
        </div>
      )}
    </div>
  )
}

export function PetStatusBadge({ status, sex, className }: { status: PetStatus; sex: Sex; className?: string }) {
  const variant = status === "available" ? "success" : status === "reserved" ? "warning" : "secondary"
  const dot = status === "available" ? "bg-success-dot" : status === "reserved" ? "bg-warning-dot" : "bg-secondary-foreground"
  return (
    <Badge variant={variant} className={className}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
      {petStatusLabel(status, sex)}
    </Badge>
  )
}

export function NewBadge({ sex, className }: { sex: Sex; className?: string }) {
  return (
    <Badge variant="default" className={className}>
      {g(sex, "Новенький", "Новенькая")}
    </Badge>
  )
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const map = {
    pending: { variant: "secondary", dot: "bg-secondary-foreground" },
    approved: { variant: "success", dot: "bg-success-dot" },
    rejected: { variant: "warning", dot: "bg-warning-dot" },
    cancelled: { variant: "muted", dot: "bg-muted-foreground" },
  } as const
  return (
    <Badge variant={map[status].variant}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", map[status].dot)} />
      {applicationStatusLabel[status]}
    </Badge>
  )
}

/**
 * Сердечко «В избранное». Активное — жёлтая заливка с тёмной обводкой:
 * так его видно и на фото, и на белом (жёлтый сам по себе даёт 1.5:1).
 */
export function FavoriteButton({
  pet,
  variant = "overlay",
  className,
}: {
  pet: Pick<Pet, "id" | "name">
  variant?: "overlay" | "outline"
  className?: string
}) {
  const { isFavorite, toggleFavorite } = useAuth()
  const active = isFavorite(pet.id)
  const icon = <Heart className={cn("transition-colors", active ? "fill-primary stroke-primary-foreground" : "")} strokeWidth={2.25} />
  if (variant === "outline") {
    return (
      <Button variant="outline" size="lg" aria-pressed={active} onClick={() => toggleFavorite(pet.id, pet.name)} className={className}>
        {icon}
        {active ? "В избранном" : "В избранное"}
      </Button>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Убрать из избранного: ${pet.name}` : `Добавить в избранное: ${pet.name}`}
      onClick={(e) => {
        e.preventDefault()
        toggleFavorite(pet.id, pet.name)
      }}
      className={cn(
        "relative z-10 inline-flex size-12 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur transition hover:bg-card hover:scale-105 active:scale-95 md:size-10 [&_svg]:size-5",
        className,
      )}
    >
      {icon}
    </button>
  )
}

export function petMeta(pet: Pet) {
  return `${speciesLabelBySex(pet.species, pet.sex)} · ${formatAge(pet.birthDate)} · ${sexLabel[pet.sex].toLowerCase()}`
}

export function PetCard({ pet, layout = "grid", eager }: { pet: Pet; layout?: "grid" | "list"; eager?: boolean }) {
  const href = `/pet/${pet.id}`
  const fresh = isNew(pet)
  const alt = `${speciesLabelBySex(pet.species, pet.sex)} ${pet.name}`

  if (layout === "list") {
    return (
      <article className="group relative flex gap-4 overflow-hidden rounded-2xl bg-card p-2 ring-1 ring-foreground/5 transition hover:shadow-lg hover:ring-secondary-border sm:gap-6 sm:p-4 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
        <div className="relative w-32 shrink-0 sm:w-56">
          <PetImage src={pet.photos[0]} alt={alt} width={320} className="rounded-xl" eager={eager} />
          {fresh && <NewBadge sex={pet.sex} className="absolute top-2 left-2" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-2 pr-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg leading-7 sm:text-xl">
              <Link to={href} className="outline-none after:absolute after:inset-0 after:content-['']">
                {pet.name}
              </Link>
            </h3>
            <FavoriteButton pet={pet} className="-mt-2 -mr-2 bg-muted shadow-none" />
          </div>
          <p className="text-sm text-muted-foreground">{petMeta(pet)}</p>
          <p className="hidden text-sm sm:line-clamp-2">{pet.story}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <PetStatusBadge status={pet.status} sex={pet.sex} />
            <Badge variant="muted">{pet.breed}</Badge>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/5 transition hover:-translate-y-1 hover:shadow-lg hover:ring-secondary-border has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <div className="relative">
        <PetImage src={pet.photos[0]} alt={alt} width={480} eager={eager} className="transition group-hover:brightness-105" />
        {fresh && <NewBadge sex={pet.sex} className="absolute top-4 left-4" />}
        <FavoriteButton pet={pet} className="absolute top-2 right-2" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl leading-7">
            <Link to={href} className="outline-none after:absolute after:inset-0 after:content-['']">
              {pet.name}
            </Link>
          </h3>
          <PetStatusBadge status={pet.status} sex={pet.sex} />
        </div>
        <p className="text-sm text-muted-foreground">{petMeta(pet)}</p>
        <p className="text-sm text-muted-foreground">
          {pet.breed}, {sizeLabel[pet.size].toLowerCase()} размер
        </p>
        {/* Декоративная «кнопка»: вся карточка — ссылка, отдельный tab-stop не нужен.
            mt-auto прижимает её к низу, чтобы в ряду карточек кнопки стояли на одном уровне */}
        <div className="mt-auto pt-2">
          <span
            aria-hidden="true"
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-secondary-foreground text-sm font-semibold text-secondary-foreground transition group-hover:bg-accent"
          >
            Подробнее <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  )
}

export function PetCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  if (layout === "list") {
    return (
      <div className="flex gap-4 rounded-2xl bg-card p-2 sm:gap-6 sm:p-4">
        <Skeleton className="aspect-[4/3] w-32 rounded-xl sm:w-56" />
        <div className="flex flex-1 flex-col gap-2 py-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-auto h-6 w-24" />
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4 md:p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    </div>
  )
}
