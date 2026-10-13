/*
 * Логика выборки питомцев. Общая для сервера (server/) и клиента,
 * поэтому без зависимостей от браузера и с явными расширениями импортов (их требует Node).
 */
import { ageInMonths } from "./format.ts"
import type { Pet, PetFilters } from "./types.ts"

export function matchesFilters(p: Pet, f: PetFilters) {
  if (p.status === "adopted") return false
  if (f.q) {
    const q = f.q.trim().toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.breed.toLowerCase().includes(q)) return false
  }
  if (f.species?.length && !f.species.includes(p.species)) return false
  if (f.sex?.length && !f.sex.includes(p.sex)) return false
  if (f.size?.length && !f.size.includes(p.size)) return false
  if (f.coat?.length && !f.coat.includes(p.coat)) return false
  if (f.status?.length && !f.status.includes(p.status as "available" | "reserved")) return false
  if (f.age?.length) {
    const m = ageInMonths(p.birthDate)
    const range = m < 12 ? "baby" : m <= 60 ? "adult" : "senior"
    if (!f.age.includes(range)) return false
  }
  if (f.health?.includes("vaccinated") && !p.vaccinated) return false
  if (f.health?.includes("sterilized") && !p.sterilized) return false
  if (f.health?.includes("specialNeeds") && !p.specialNeeds) return false
  if (f.compat?.includes("kids") && p.goodWithKids !== "yes") return false
  if (f.compat?.includes("cats") && p.goodWithCats !== "yes") return false
  if (f.compat?.includes("dogs") && p.goodWithDogs !== "yes") return false
  return true
}

export function sortPets(list: Pet[], sort: PetFilters["sort"] = "newest") {
  const by = {
    newest: (a: Pet, b: Pet) => b.addedAt.localeCompare(a.addedAt),
    oldest: (a: Pet, b: Pet) => a.addedAt.localeCompare(b.addedAt),
    "age-asc": (a: Pet, b: Pet) => b.birthDate.localeCompare(a.birthDate),
    "age-desc": (a: Pet, b: Pet) => a.birthDate.localeCompare(b.birthDate),
  }[sort]
  return [...list].sort(by)
}

/** Тот же вид, близкий возраст и размер; свободные — выше забронированных */
export function similarPets(all: Pet[], pet: Pet, limit = 4) {
  const age = ageInMonths(pet.birthDate)
  return all
    .filter((p) => p.id !== pet.id && p.species === pet.species && p.status !== "adopted")
    .map((p) => ({
      p,
      score: Math.abs(ageInMonths(p.birthDate) - age) / 12 + (p.size === pet.size ? 0 : 2) + (p.status === "available" ? 0 : 1),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.p)
}

/** «Питомцы недели»: поровну кошек и собак, сначала те, кто ждёт дольше */
export function featuredPets(all: Pet[], limit = 6) {
  const free = all.filter((p) => p.status === "available")
  const pick = (s: Pet["species"]) =>
    sortPets(
      free.filter((p) => p.species === s),
      "oldest",
    ).slice(0, Math.ceil(limit / 2))
  const cats = pick("cat")
  const dogs = pick("dog")
  return cats
    .flatMap((c, i) => [c, dogs[i]])
    .filter(Boolean)
    .slice(0, limit)
}

/** Разбор фильтров из query-строки: ?species=cat,dog&age=baby&q=…&sort=… */
export const FILTER_KEYS = ["species", "age", "size", "sex", "coat", "health", "compat", "status"] as const

export function filtersToQuery(f: PetFilters) {
  const p = new URLSearchParams()
  for (const k of FILTER_KEYS) {
    const v = f[k] as string[] | undefined
    if (v?.length) p.set(k, v.join(","))
  }
  if (f.q) p.set("q", f.q)
  if (f.sort) p.set("sort", f.sort)
  return p
}

export function filtersFromQuery(q: Record<string, unknown>): PetFilters {
  const f: PetFilters = {}
  for (const k of FILTER_KEYS) {
    const v = q[k]
    if (typeof v === "string" && v) (f[k] as string[]) = v.split(",").filter(Boolean)
  }
  if (typeof q.q === "string" && q.q.trim()) f.q = q.q.slice(0, 100)
  if (typeof q.sort === "string" && ["newest", "oldest", "age-asc", "age-desc"].includes(q.sort)) {
    f.sort = q.sort as PetFilters["sort"]
  }
  return f
}
