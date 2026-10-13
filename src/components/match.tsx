import { useState } from "react"
import { Link } from "react-router-dom"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FavoriteButton, PetCardSkeleton, PetImage, petMeta } from "@/components/pet"
import { EmptyState, ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { speciesLabelBySex } from "@/lib/format"
import type { Match, MatchProfile } from "@/lib/match"
import type { Experience, Housing, Species } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Процент совпадения: чем выше, тем насыщеннее плашка */
function ScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold shadow-sm",
        score >= 80 ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
        className,
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
      {score}% <span className="sr-only">совпадения</span>
    </span>
  )
}

export function MatchCard({ match }: { match: Match }) {
  const { pet, score, reasons } = match
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/5 transition hover:-translate-y-1 hover:shadow-lg hover:ring-secondary-border has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <div className="relative">
        <PetImage src={pet.photos[0]} alt={`${speciesLabelBySex(pet.species, pet.sex)} ${pet.name}`} width={480} />
        <ScoreBadge score={score} className="absolute top-4 left-4" />
        <FavoriteButton pet={pet} className="absolute top-2 right-2" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 md:p-6">
        <h3 className="text-xl leading-7">
          <Link to={`/pet/${pet.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
            {pet.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">{petMeta(pet)}</p>
        {reasons.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Почему подходит">
            {reasons.map((r) => (
              <li
                key={r}
                className="inline-flex items-center gap-1 rounded-lg bg-success px-2 py-1 text-xs font-semibold text-success-foreground"
              >
                <Check className="size-3.5" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export function MatchGrid({ items, loading, count = 3 }: { items?: Match[]; loading?: boolean; count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {loading || !items
        ? Array.from({ length: count }, (_, i) => <PetCardSkeleton key={i} />)
        : items.map((m) => <MatchCard key={m.pet.id} match={m} />)}
    </div>
  )
}

// ——— Подбор: пять быстрых вопросов + карточки ———

type Answers = {
  species: "any" | Species
  housing: "any" | Housing
  kids: "any" | "yes" | "no"
  other: "any" | "none" | "cat" | "dog" | "both"
  experience: "any" | Experience
}

const questions: { key: keyof Answers; label: string; options: [string, string][] }[] = [
  {
    key: "species",
    label: "Кого ищете",
    options: [
      ["any", "Не важно"],
      ["cat", "Кошку"],
      ["dog", "Собаку"],
    ],
  },
  {
    key: "housing",
    label: "Где живёте",
    options: [
      ["any", "Не важно"],
      ["apartment", "Квартира"],
      ["house", "Частный дом"],
      ["other", "Другое"],
    ],
  },
  {
    key: "kids",
    label: "Дети до 10 лет",
    options: [
      ["any", "Не важно"],
      ["yes", "Есть"],
      ["no", "Нет"],
    ],
  },
  {
    key: "other",
    label: "Кто уже живёт дома",
    options: [
      ["any", "Не важно"],
      ["none", "Никого"],
      ["cat", "Кошка"],
      ["dog", "Собака"],
      ["both", "Кошка и собака"],
    ],
  },
  {
    key: "experience",
    label: "Опыт",
    options: [
      ["any", "Не важно"],
      ["none", "Первый питомец"],
      ["some", "Были раньше"],
      ["experienced", "Большой опыт"],
    ],
  },
]

function answersFromProfile(p: MatchProfile): Answers {
  const other = p.otherPets
  return {
    species: p.species?.length === 1 ? p.species[0] : "any",
    housing: p.housing ?? "any",
    kids: p.hasKids === undefined ? "any" : p.hasKids ? "yes" : "no",
    other: !other ? "any" : other.length === 0 ? "none" : other.length === 2 ? "both" : other[0],
    experience: p.experience ?? "any",
  }
}

function queryFromAnswers(a: Answers): api.MatchQuery {
  return {
    species: a.species === "any" ? undefined : [a.species],
    housing: a.housing === "any" ? undefined : a.housing,
    kids: a.kids === "any" ? undefined : a.kids === "yes",
    other: a.other === "any" ? undefined : a.other === "none" ? [] : a.other === "both" ? ["cat", "dog"] : [a.other],
    experience: a.experience === "any" ? undefined : a.experience,
  }
}

function describeBasis(basedOn: string[]) {
  if (basedOn.length === 0) return null
  return `Подобрали по ${basedOn.join(" и ")}. Меняйте ответы — подборка обновится сразу.`
}

/**
 * Без ответов вошедшему пользователю подбираем по его последней анкете и избранному;
 * как только человек меняет любой ответ, считаем по ответам.
 */
export function MatchFinder({ limit = 6 }: { limit?: number }) {
  const [answers, setAnswers] = useState<Answers | null>(null)
  const query = answers ? queryFromAnswers(answers) : undefined
  const key = JSON.stringify(query ?? "auto")
  const data = useAsync(() => api.getRecommendations({ ...query, limit }), [key])
  const shown = answers ?? (data.data ? answersFromProfile(data.data.profile) : null)
  const set = (k: keyof Answers, v: string) => setAnswers({ ...(shown ?? answersFromProfile({})), [k]: v } as Answers)
  const nothingAsked = !data.data || (data.data.items.length === 0 && data.data.basedOn.length === 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-3xl bg-secondary p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-5">
        {questions.map((q) => (
          <div key={q.key} className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={`match-${q.key}`} className="text-sm font-semibold text-secondary-foreground">
              {q.label}
            </Label>
            <Select value={shown?.[q.key] ?? "any"} onValueChange={(v) => set(q.key, v)}>
              <SelectTrigger id={`match-${q.key}`} className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {q.options.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {data.status === "error" ? (
        <ErrorState onRetry={data.reload} />
      ) : data.status === "success" && data.data.items.length === 0 ? (
        nothingAsked ? (
          <EmptyState
            title="Расскажите немного о себе"
            text="Ответьте на вопросы выше — и мы покажем питомцев, которым у вас будет хорошо, с объяснением, почему."
          />
        ) : (
          <EmptyState
            title="Под такие условия сейчас никого нет"
            text="Попробуйте поменять пару ответов или загляните позже — новенькие появляются каждую неделю."
            action={
              <Button asChild variant="outline">
                <Link to="/catalog">Открыть каталог</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {data.data && describeBasis(data.data.basedOn) && (
            <p className="text-muted-foreground" aria-live="polite">
              {describeBasis(data.data.basedOn)}
            </p>
          )}
          <MatchGrid items={data.status === "success" ? data.data.items : undefined} loading={data.status === "loading"} />
        </>
      )}
    </div>
  )
}
