import type {
  ApplicationStatus,
  Coat,
  Compat,
  Experience,
  Housing,
  Pet,
  PetSize,
  PetStatus,
  Role,
  Sex,
  Species,
  VisitTime,
  VolunteerRole,
} from "./types"

/** Русское склонение: plural(3, ["год", "года", "лет"]) → "года" */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

export function ageInMonths(birthDate: string, now = new Date()) {
  const b = new Date(birthDate)
  return Math.max(
    0,
    (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth(),
  )
}

export function formatAge(birthDate: string) {
  const m = ageInMonths(birthDate)
  if (m < 1) return "меньше месяца"
  if (m < 12) return `${m} ${plural(m, ["месяц", "месяца", "месяцев"])}`
  const y = Math.floor(m / 12)
  return `${y} ${plural(y, ["год", "года", "лет"])}`
}

export const NEW_DAYS = 14
export function isNew(pet: Pet) {
  return Date.now() - new Date(pet.addedAt).getTime() < NEW_DAYS * 86_400_000
}

/** Окончание по полу: g(pet, "Свободен", "Свободна") */
export const g = (sex: Sex, m: string, f: string) => (sex === "female" ? f : m)

export const speciesLabel: Record<Species, string> = { cat: "Кошка", dog: "Собака" }
export const speciesLabelBySex = (s: Species, sex: Sex) =>
  s === "cat" ? g(sex, "Кот", "Кошка") : g(sex, "Пёс", "Собака")
export const sexLabel: Record<Sex, string> = { male: "Мальчик", female: "Девочка" }
export const sizeLabel: Record<PetSize, string> = {
  small: "Маленький",
  medium: "Средний",
  large: "Крупный",
}
export const coatLabel: Record<Coat, string> = {
  short: "Короткая",
  long: "Длинная",
  none: "Без шерсти",
}
export const compatLabel: Record<Compat, string> = {
  yes: "Ладит",
  no: "Лучше без них",
  unknown: "Пока не знаем",
}

export function petStatusLabel(status: PetStatus, sex: Sex) {
  if (status === "available") return g(sex, "Свободен", "Свободна")
  if (status === "reserved") return g(sex, "Забронирован", "Забронирована")
  return "Уже дома"
}

export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрено",
  rejected: "Отклонено",
  cancelled: "Отозвана",
}

export const housingLabel: Record<Housing, string> = {
  apartment: "Квартира",
  house: "Частный дом",
  other: "Другое",
}
export const experienceLabel: Record<Experience, string> = {
  none: "Первый питомец",
  some: "Были питомцы раньше",
  experienced: "Большой опыт",
}
export const visitTimeLabel: Record<VisitTime, string> = {
  "weekday-morning": "Будни, утро",
  "weekday-evening": "Будни, вечер",
  weekend: "Выходные",
}
export const roleLabel: Record<Role, string> = {
  user: "Пользователь",
  volunteer: "Волонтёр",
  admin: "Администратор",
}
export const volunteerRoleLabel: Record<VolunteerRole, string> = {
  walker: "Выгул собак",
  caretaker: "Уход и уборка",
  photographer: "Фото и соцсети",
  driver: "Автоволонтёр",
}
export const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function formatNumber(n: number) {
  return n.toLocaleString("ru-RU")
}

/** Приводит ввод к маске +7 (___) ___-__-__ */
export function formatPhone(input: string) {
  let d = input.replace(/\D/g, "")
  if (d.startsWith("8")) d = "7" + d.slice(1)
  if (!d.startsWith("7")) d = "7" + d
  d = d.slice(0, 11)
  const p = d.slice(1)
  let out = "+7"
  if (p.length) out += " (" + p.slice(0, 3)
  if (p.length >= 3) out += ")"
  if (p.length > 3) out += " " + p.slice(3, 6)
  if (p.length > 6) out += "-" + p.slice(6, 8)
  if (p.length > 8) out += "-" + p.slice(8, 10)
  return out
}

/** Для фото с Unsplash подставляет размер; остальные URL (загруженные data:) возвращает как есть */
export function sizedPhoto(url: string, w: number, h?: number) {
  if (!url.includes("images.unsplash.com")) return url
  const u = new URL(url)
  u.searchParams.set("w", String(w))
  if (h) u.searchParams.set("h", String(h))
  u.searchParams.set("fit", "crop")
  u.searchParams.set("auto", "format")
  u.searchParams.set("q", "75")
  return u.toString()
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
}
