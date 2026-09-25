/*
 * Мок-слой данных. Все страницы общаются с «бэкендом» только через эти функции,
 * поэтому при переходе на Supabase достаточно заменить реализацию здесь.
 * Данные живут в localStorage, задержка имитирует сеть (видны Skeleton-состояния).
 */
import { demoMode } from "./demo"
import { ageInMonths } from "./format"
import {
  ADOPTED_BEFORE_SITE,
  DEMO_PASSWORD,
  seedApplications,
  seedPets,
  seedUsers,
  seedVolunteers,
} from "./seed"
import type {
  Application,
  ApplicationStatus,
  Pet,
  PetFilters,
  PetStatus,
  Role,
  User,
  Volunteer,
} from "./types"

// v2: кадрирование фото по мордочке — старые URL в localStorage нужно заменить
const DB_KEY = "dd:db:v2"

type DB = {
  pets: Pet[]
  applications: Application[]
  users: User[]
  passwords: Record<string, string>
  volunteers: Volunteer[]
  volunteerRequests: { name: string; phone: string; email: string; direction: string; days: string[]; at: string }[]
  subscribers: string[]
  feedback: { name: string; email: string; message: string; at: string }[]
  seq: number
}

function seed(): DB {
  return {
    pets: seedPets,
    applications: seedApplications,
    users: seedUsers,
    passwords: Object.fromEntries(seedUsers.map((u) => [u.email, DEMO_PASSWORD])),
    volunteers: seedVolunteers,
    volunteerRequests: [],
    subscribers: [],
    feedback: [],
    seq: 1046,
  }
}

let cache: DB | null = null

function db(): DB {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(DB_KEY)
    cache = raw ? (JSON.parse(raw) as DB) : seed()
  } catch {
    cache = seed()
  }
  return cache
}

function commit() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db()))
  } catch {
    // квота переполнена (например, много загруженных фото) — данные остаются в памяти до перезагрузки
  }
}

export function resetDemoData() {
  cache = seed()
  commit()
}

export class ApiError extends Error {}

/** Имитация сети; в демо-режиме — долгий ответ или падение запроса (см. lib/demo.ts) */
async function wait(ms = 300 + Math.random() * 300) {
  const mode = demoMode()
  await new Promise((r) => setTimeout(r, mode === "slow" ? 2500 : ms))
  if (mode === "error") throw new ApiError("Сервер не отвечает. Проверьте соединение и попробуйте ещё раз.")
}
/** В демо-режиме «empty» списки приходят пустыми */
const orEmpty = <T>(value: T, empty: T): T => (demoMode() === "empty" ? empty : value)
const clone = <T>(v: T): T => structuredClone(v)

// ——— Питомцы ———

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

function sortPets(list: Pet[], sort: PetFilters["sort"] = "newest") {
  const by = {
    newest: (a: Pet, b: Pet) => b.addedAt.localeCompare(a.addedAt),
    oldest: (a: Pet, b: Pet) => a.addedAt.localeCompare(b.addedAt),
    "age-asc": (a: Pet, b: Pet) => b.birthDate.localeCompare(a.birthDate),
    "age-desc": (a: Pet, b: Pet) => a.birthDate.localeCompare(b.birthDate),
  }[sort]
  return [...list].sort(by)
}

export async function getPets(filters: PetFilters, page = 1, pageSize = 12) {
  await wait()
  const all = orEmpty(sortPets(db().pets.filter((p) => matchesFilters(p, filters)), filters.sort), [])
  return { items: clone(all.slice((page - 1) * pageSize, page * pageSize)), total: all.length }
}

export async function countPets(filters: PetFilters) {
  await wait(120)
  return orEmpty(db().pets.filter((p) => matchesFilters(p, filters)).length, 0)
}

export async function getPet(id: string) {
  await wait()
  const pet = orEmpty(db().pets.find((p) => p.id === id), undefined)
  return pet ? clone(pet) : null
}

export async function getPetsByIds(ids: string[]) {
  await wait()
  return orEmpty(clone(db().pets.filter((p) => ids.includes(p.id))), [])
}

export async function getSimilarPets(pet: Pet, limit = 4) {
  await wait()
  const age = ageInMonths(pet.birthDate)
  if (demoMode() === "empty") return []
  return clone(
    db()
      .pets.filter((p) => p.id !== pet.id && p.species === pet.species && p.status !== "adopted")
      .map((p) => ({
        p,
        score: Math.abs(ageInMonths(p.birthDate) - age) / 12 + (p.size === pet.size ? 0 : 2) + (p.status === "available" ? 0 : 1),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map((x) => x.p),
  )
}

/** «Питомцы недели»: поровну кошек и собак, сначала те, кто ждёт дольше */
export async function getFeaturedPets(limit = 6) {
  await wait()
  const free = orEmpty(db().pets.filter((p) => p.status === "available"), [])
  const pick = (s: Pet["species"]) => sortPets(free.filter((p) => p.species === s), "oldest").slice(0, limit / 2)
  const cats = pick("cat")
  const dogs = pick("dog")
  return clone(cats.flatMap((c, i) => [c, dogs[i]]).filter(Boolean))
}

export async function getStats() {
  await wait(200)
  const pets = orEmpty(db().pets, [])
  const apps = orEmpty(db().applications, [])
  const weekAgo = Date.now() - 7 * 86_400_000
  return {
    adopted: orEmpty(ADOPTED_BEFORE_SITE, 0) + pets.filter((p) => p.status === "adopted").length,
    waiting: pets.filter((p) => p.status !== "adopted").length,
    available: pets.filter((p) => p.status === "available").length,
    reserved: pets.filter((p) => p.status === "reserved").length,
    newApplications: apps.filter((a) => new Date(a.createdAt).getTime() > weekAgo).length,
    pendingApplications: apps.filter((a) => a.status === "pending").length,
    volunteers: orEmpty(db().volunteers.length, 0),
  }
}

// ——— Админка: питомцы ———

export async function listAllPets() {
  await wait()
  return orEmpty(clone(sortPets(db().pets, "newest")), [])
}

export async function savePet(pet: Pet) {
  await wait(500)
  const list = db().pets
  const i = list.findIndex((p) => p.id === pet.id)
  if (i >= 0) list[i] = clone(pet)
  else list.unshift(clone(pet))
  commit()
  return clone(pet)
}

export async function deletePet(id: string) {
  await wait()
  const d = db()
  d.pets = d.pets.filter((p) => p.id !== id)
  commit()
}

export async function setPetStatus(id: string, status: PetStatus) {
  await wait(250)
  const pet = db().pets.find((p) => p.id === id)
  if (!pet) throw new ApiError("Питомец не найден")
  pet.status = status
  commit()
  return clone(pet)
}

export function newPetId(name: string) {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya",
  }
  const base =
    name
      .toLowerCase()
      .split("")
      .map((c) => translit[c] ?? (/[a-z0-9]/.test(c) ? c : c === " " ? "-" : ""))
      .join("")
      .replace(/-+/g, "-") || "pet"
  let id = base
  let n = 2
  while (db().pets.some((p) => p.id === id)) id = `${base}-${n++}`
  return id
}

// ——— Заявки ———

export type NewApplication = Omit<Application, "id" | "status" | "staffComments" | "createdAt">

export async function createApplication(input: NewApplication) {
  await wait(700)
  const d = db()
  const email = input.email.trim().toLowerCase()
  const duplicate = d.applications.find(
    (a) => a.petId === input.petId && a.email.toLowerCase() === email && a.status === "pending",
  )
  if (duplicate) {
    throw new ApiError(`У вас уже есть заявка на этого питомца (№ ${duplicate.id}) — мы её рассматриваем.`)
  }
  const app: Application = {
    ...input,
    id: `A-${d.seq++}`,
    status: "pending",
    staffComments: [],
    createdAt: new Date().toISOString(),
  }
  d.applications.unshift(app)
  commit()
  return clone(app)
}

export async function listApplications(opts: { userId?: string; email?: string } = {}) {
  await wait()
  if (demoMode() === "empty") return []
  return clone(
    db()
      .applications.filter(
        (a) =>
          (!opts.userId && !opts.email) ||
          (opts.userId && a.userId === opts.userId) ||
          (opts.email && a.email.toLowerCase() === opts.email.toLowerCase()),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  await wait(300)
  const d = db()
  const app = d.applications.find((a) => a.id === id)
  if (!app) throw new ApiError("Заявка не найдена")
  app.status = status
  // Бизнес-правило: одобрение бронирует питомца
  if (status === "approved") {
    const pet = d.pets.find((p) => p.id === app.petId)
    if (pet && pet.status === "available") pet.status = "reserved"
  }
  commit()
  return clone(app)
}

export async function addStaffComment(id: string, author: string, text: string) {
  await wait(250)
  const app = db().applications.find((a) => a.id === id)
  if (!app) throw new ApiError("Заявка не найдена")
  app.staffComments.push({ author, text, at: new Date().toISOString() })
  commit()
  return clone(app)
}

export async function cancelApplication(id: string) {
  return updateApplicationStatus(id, "cancelled")
}

// ——— Пользователи ———

export async function login(email: string, password: string) {
  await wait(500)
  const d = db()
  const key = email.trim().toLowerCase()
  const user = d.users.find((u) => u.email.toLowerCase() === key)
  if (!user || d.passwords[user.email] !== password) {
    throw new ApiError("Неверный email или пароль. Попробуйте ещё раз или войдите через демо-аккаунт.")
  }
  return clone(user)
}

export async function register(input: { name: string; email: string; password: string }) {
  await wait(600)
  const d = db()
  const email = input.email.trim().toLowerCase()
  if (d.users.some((u) => u.email.toLowerCase() === email)) {
    throw new ApiError("Этот email уже зарегистрирован — попробуйте войти.")
  }
  const user: User = {
    id: `u-${Date.now()}`,
    name: input.name.trim(),
    email,
    role: "user",
    favorites: [],
    notify: { newPets: true, applicationUpdates: true, email: true },
  }
  d.users.push(user)
  d.passwords[email] = input.password
  commit()
  return clone(user)
}

export function getUserSync(id: string) {
  const u = db().users.find((x) => x.id === id)
  return u ? clone(u) : null
}

export async function updateUser(id: string, patch: Partial<Omit<User, "id" | "role">>) {
  await wait(400)
  const u = db().users.find((x) => x.id === id)
  if (!u) throw new ApiError("Пользователь не найден")
  Object.assign(u, patch)
  commit()
  return clone(u)
}

/** Избранное пишется сразу, без задержки — сердечко должно реагировать мгновенно */
export function saveFavoritesSync(id: string, favorites: string[]) {
  const u = db().users.find((x) => x.id === id)
  if (u) {
    u.favorites = favorites
    commit()
  }
}

export async function listUsers() {
  await wait()
  return clone(db().users)
}

export async function setUserRole(id: string, role: Role) {
  await wait(250)
  const u = db().users.find((x) => x.id === id)
  if (!u) throw new ApiError("Пользователь не найден")
  u.role = role
  commit()
  return clone(u)
}

// ——— Волонтёры и прочее ———

export async function listVolunteers() {
  await wait()
  return orEmpty(clone(db().volunteers), [])
}

export async function saveVolunteers(list: Volunteer[]) {
  await wait(300)
  db().volunteers = clone(list)
  commit()
}

export async function sendVolunteerRequest(input: DB["volunteerRequests"][number]) {
  await wait(600)
  db().volunteerRequests.push(input)
  commit()
}

export async function subscribe(email: string) {
  await wait(400)
  const d = db()
  if (!d.subscribers.includes(email)) d.subscribers.push(email)
  commit()
}

export async function sendFeedback(input: { name: string; email: string; message: string }) {
  await wait(600)
  db().feedback.push({ ...input, at: new Date().toISOString() })
  commit()
}
