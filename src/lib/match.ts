/*
 * Подбор питомцев под человека: по ответам анкеты (жильё, дети, другие животные, опыт)
 * и по тому, кого он добавил в избранное. Для каждого питомца — процент совпадения
 * и человеческие причины («Ладит с детьми», «Размер подходит для квартиры»).
 * Общий код сервера и клиента: без браузерных зависимостей, импорты с расширением.
 */
import { ageInMonths } from "./format.ts"
import type { Application, Experience, Housing, Pet, PetSize, Species } from "./types.ts"

export type MatchProfile = {
  housing?: Housing
  hasKids?: boolean
  /** кто уже живёт дома */
  otherPets?: Species[]
  experience?: Experience
  /** предпочтения из избранного */
  species?: Species[]
  sizes?: PetSize[]
}

export type Match = { pet: Pet; score: number; reasons: string[] }

const CAT = /кош|кот|котён|котен/i
const DOG = /соб|пёс|пес|щен|такс|лабрадор|спаниель|терьер|овчар|хаск|корги|дворняж/i

/** Кто живёт дома — по свободному ответу «Кто живёт с вами?» */
export function otherPetsFromNote(note?: string): Species[] {
  if (!note) return []
  return [...(CAT.test(note) ? (["cat"] as const) : []), ...(DOG.test(note) ? (["dog"] as const) : [])]
}

export function profileFromApplication(app: Application): MatchProfile {
  const other = app.hasOtherPets ? otherPetsFromNote(app.otherPetsNote) : []
  return {
    housing: app.housing,
    hasKids: app.hasKids,
    // «Да», но непонятно кто — осторожничаем и учитываем и кошек, и собак
    otherPets: app.hasOtherPets && other.length === 0 ? ["cat", "dog"] : other,
    experience: app.experience,
  }
}

/** Самые частые вид и размер среди избранных */
export function profileFromFavorites(favs: Pet[]): MatchProfile {
  if (favs.length === 0) return {}
  const top = <T extends string>(values: T[]) => {
    const counts = new Map<T, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    const max = Math.max(...counts.values())
    return [...counts].filter(([, n]) => n === max).map(([v]) => v)
  }
  return { species: top(favs.map((p) => p.species)), sizes: top(favs.map((p) => p.size)) }
}

const CALM = /спокой|тих|ласков|неторопл|домосед|мурчал|уравновеш/i
const ACTIVE = /активн|энерги|игрив|спортив|бегу/i

/** null — питомец точно не подходит (например, не ладит с детьми, а в семье малыши) */
export function scorePet(pet: Pet, pr: MatchProfile, now = new Date()): Match | null {
  if (pet.status !== "available") return null
  if (pr.hasKids && pet.goodWithKids === "no") return null
  if (pr.otherPets?.includes("cat") && pet.goodWithCats === "no") return null
  if (pr.otherPets?.includes("dog") && pet.goodWithDogs === "no") return null

  let score = 60
  const reasons: string[] = []
  const traits = pet.traits.join(" ")
  const months = ageInMonths(pet.birthDate, now)
  const bigDog = pet.species === "dog" && pet.size === "large"

  if (pr.hasKids) {
    if (pet.goodWithKids === "yes") {
      score += 12
      reasons.push("Ладит с детьми")
    } else score -= 8
  }
  if (pr.otherPets?.includes("cat")) {
    if (pet.goodWithCats === "yes") {
      score += 8
      reasons.push("Уживётся с вашей кошкой")
    } else score -= 6
  }
  if (pr.otherPets?.includes("dog")) {
    if (pet.goodWithDogs === "yes") {
      score += 8
      reasons.push("Дружит с собаками")
    } else score -= 6
  }

  if (pr.housing === "apartment") {
    if (bigDog) score -= 14
    else if (pet.species === "cat" || pet.size === "small") {
      score += 6
      reasons.push("Удобно в квартире")
    }
  }
  if (pr.housing === "house" && pet.species === "dog" && pet.size !== "small") {
    score += 8
    reasons.push("Оценит простор загородного дома")
  }

  if (pr.experience === "none") {
    if (pet.specialNeeds) score -= 18
    if (CALM.test(traits)) {
      score += 7
      reasons.push("Спокойный характер — хорошо для первого питомца")
    }
    if (pet.species === "dog" && months < 12) score -= 4 // щенку нужно воспитание
  }
  if (pr.experience === "experienced") {
    if (pet.specialNeeds) {
      score += 6
      reasons.push("Нужен опытный хозяин — это вы")
    }
    if (months > 84) {
      score += 4
      reasons.push("Взрослому питомцу важен спокойный опытный дом")
    }
  }
  if (pr.housing === "house" && ACTIVE.test(traits) && pet.species === "dog") score += 3

  if (pr.species?.length) {
    if (pr.species.includes(pet.species)) {
      score += 10
      reasons.push(pet.species === "cat" ? "Вы присматриваетесь к кошкам" : "Вы присматриваетесь к собакам")
    } else score -= 10
  }
  if (pr.sizes?.includes(pet.size)) score += 4

  const waiting = (now.getTime() - new Date(pet.addedAt).getTime()) / 86_400_000
  if (waiting > 60) {
    score += 3
    reasons.push("Ждёт дом дольше двух месяцев")
  }

  return { pet, score: Math.max(35, Math.min(98, Math.round(score))), reasons: reasons.slice(0, 3) }
}

export function matchPets(pets: Pet[], pr: MatchProfile, { limit = 6, exclude = [] as string[] } = {}) {
  return pets
    .filter((p) => !exclude.includes(p.id))
    .map((p) => scorePet(p, pr))
    .filter((m): m is Match => m !== null)
    .sort((a, b) => b.score - a.score || a.pet.addedAt.localeCompare(b.pet.addedAt))
    .slice(0, limit)
}

export const isEmptyProfile = (pr: MatchProfile) =>
  !pr.housing && pr.hasKids === undefined && !pr.otherPets?.length && !pr.experience && !pr.species?.length
