/*
 * API без сервера — для статической сборки (npm run build:static), которую можно выложить
 * одной страницей без бэкенда. Те же функции, что в api.ts, но «сервер» работает прямо в браузере:
 * те же схемы валидации (server/schemas.ts), правила, аналитика и подбор, данные — в localStorage
 * этого браузера. В обычной сборке этот файл не используется: его подставляет vite.config.ts
 * вместо api.ts только в режиме static.
 */
import { buildAnalytics } from "../../server/analytics.ts"
import { HttpError, parse } from "../../server/http-error.ts"
import * as s from "../../server/schemas.ts"
import {
  ApiError,
  getToken,
  setToken,
  type AuditQuery,
  type ClientErrorReport,
  type MatchQuery,
  type NewApplication,
  type PetInput,
  type Stats,
} from "./api"
import { fakeDoorStats, recordFakeDoor, type FakeDoor } from "./fake-door"
import { actorOf, filterAudit, maskEmail, petStatusChange, pushAudit, roleChange, seedAudit, statusChange } from "./audit"
import { demoMode } from "./demo"
import { isEmptyProfile, matchPets, profileFromApplication, profileFromFavorites, type MatchProfile } from "./match"
import { featuredPets, filtersFromQuery, filtersToQuery, matchesFilters, similarPets, sortPets } from "./pets-query"
import { ADOPTED_BEFORE_SITE, DEMO_PASSWORD, seedApplications, seedPets, seedUsers, seedVolunteers } from "./seed"
import { buildApplications } from "./seed-history"
import type { Application, ApplicationStatus, AuditEntry, InvestorReport, Pet, PetFilters, PetStatus, Role, User, Volunteer } from "./types"

export { ApiError, getToken, setToken }
export type { AuditQuery, ClientErrorReport, MatchQuery, NewApplication, PetInput, Stats }

// ——— Хранилище ———

type DB = {
  pets: Pet[]
  applications: Application[]
  users: User[]
  /** email → sha-256 пароля (демо в браузере зрителя, не настоящая защита) */
  passwords: Record<string, string>
  sessions: { token: string; userId: string }[]
  volunteers: Volunteer[]
  volunteerRequests: unknown[]
  subscribers: string[]
  feedback: unknown[]
  audit: AuditEntry[]
  fakeDoors: Partial<Record<FakeDoor, { count: number; lastAt: string }>>
  seq: number
}

const DB_KEY = "dd:static-db:v1"
let memory: DB | null = null

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function seedDb(): Promise<DB> {
  const { applications, seq } = buildApplications(seedApplications)
  const hash = await sha256(DEMO_PASSWORD)
  return structuredClone({
    pets: seedPets,
    applications,
    users: seedUsers,
    passwords: Object.fromEntries(seedUsers.map((u) => [u.email, hash])),
    sessions: [],
    volunteers: seedVolunteers,
    volunteerRequests: [],
    subscribers: [],
    feedback: [],
    audit: seedAudit(applications, seedPets, seedUsers),
    fakeDoors: {},
    seq,
  })
}

async function load(): Promise<DB> {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) memory = JSON.parse(raw) as DB
  } catch {
    // нет доступа к localStorage или испорченные данные — начинаем с демо-данных
  }
  memory ??= await seedDb()
  // Данные из браузера, сохранённые до появления журнала
  memory.audit ??= []
  memory.fakeDoors ??= {}
  // Демо-аккаунт, появившийся после первого открытия страницы, — дописываем, чтобы его кнопка входа работала
  for (const u of seedUsers) {
    if (memory.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) continue
    memory.users.push(structuredClone(u))
    memory.passwords[u.email] = await sha256(DEMO_PASSWORD)
  }
  return memory
}

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(memory))
  } catch {
    // переполнение или запрет хранилища: данные проживут до перезагрузки
  }
}

// ——— «Запрос»: задержка сети, демо-режим, права, ошибки как у сервера ———

type Permission =
  | "admin.access"
  | "pets.notes"
  | "pets.status"
  | "pets.edit"
  | "applications.view"
  | "applications.status"
  | "volunteers.manage"
  | "users.manage"

const permissions: Record<Role, Permission[]> = {
  user: [],
  volunteer: ["admin.access", "pets.notes", "applications.view"],
  admin: [
    "admin.access",
    "pets.notes",
    "pets.status",
    "pets.edit",
    "applications.view",
    "applications.status",
    "volunteers.manage",
    "users.manage",
  ],
}
const can = (u: User | undefined, p: Permission) => !!u && permissions[u.role].includes(p)

type Ctx = { d: DB; me?: User; empty: boolean }

function requireUser(c: Ctx) {
  if (!c.me) throw new HttpError(401, "Войдите в аккаунт, чтобы продолжить")
  return c.me
}

function requirePermission(c: Ctx, p: Permission) {
  const me = requireUser(c)
  if (!can(me, p)) throw new HttpError(403, "Недостаточно прав для этого действия")
  return me
}

/** Запись в журнал действий — как на сервере, но в localStorage зрителя */
const audit = (c: Ctx, entry: Omit<AuditEntry, "id" | "at" | "actor"> & { actor?: AuditEntry["actor"] }) =>
  pushAudit(c.d.audit, { actor: actorOf(c.me), ...entry }, crypto.randomUUID())

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()

async function call<T>(fn: (c: Ctx) => T | Promise<T>): Promise<T> {
  const mode = demoMode()
  // Небольшая задержка — чтобы скелетоны и спиннеры вели себя как с настоящим сервером
  await wait(mode === "slow" ? 2500 : 150)
  if (mode === "error") throw new ApiError("Сервер не отвечает. Проверьте соединение и попробуйте ещё раз.", 503)
  const d = await load()
  const token = getToken()
  const session = token ? d.sessions.find((x) => x.token === token) : undefined
  const me = session ? d.users.find((u) => u.id === session.userId) : undefined
  try {
    const result = await fn({ d, me, empty: mode === "empty" })
    persist()
    // Как по сети: наружу уходит копия, а не ссылка на «базу»
    return result === undefined ? result : structuredClone(result)
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401 && token) setToken(null)
      throw new ApiError(e.message, e.status, e.fields)
    }
    throw e
  }
}

function publicPet(pet: Pet, viewer?: User): Pet {
  if (can(viewer, "pets.notes")) return pet
  const { internalNotes: _hidden, ...rest } = pet
  return rest
}

function slugify(name: string, taken: (id: string) => boolean) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
  }
  const base =
    name
      .toLowerCase()
      .split("")
      .map((ch) => map[ch] ?? (/[a-z0-9]/.test(ch) ? ch : ch === " " ? "-" : ""))
      .join("")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "pet"
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  return id
}

// ——— Питомцы ———

export function getPets(filters: PetFilters, page = 1, pageSize = 12) {
  return call((c) => {
    // Через query-строку — как сервер: та же нормализация фильтров
    const f = filtersFromQuery(Object.fromEntries(filtersToQuery(filters)))
    const all = c.empty
      ? []
      : sortPets(
          c.d.pets.filter((p) => matchesFilters(p, f)),
          f.sort,
        )
    return { items: all.slice((page - 1) * pageSize, page * pageSize).map((p) => publicPet(p, c.me)), total: all.length }
  })
}

export function countPets(filters: PetFilters) {
  return call((c) => (c.empty ? 0 : c.d.pets.filter((p) => matchesFilters(p, filters)).length))
}

export function getPet(id: string) {
  return call((c) => {
    const pet = c.empty ? undefined : c.d.pets.find((p) => p.id === id)
    return pet ? publicPet(pet, c.me) : null
  })
}

export function getPetsByIds(ids: string[]) {
  return call((c) => (c.empty ? [] : c.d.pets.filter((p) => ids.includes(p.id)).map((p) => publicPet(p, c.me))))
}

export function getSimilarPets(pet: Pet) {
  return call((c) => (c.empty ? [] : similarPets(c.d.pets, pet, 4).map((p) => publicPet(p, c.me))))
}

export function getFeaturedPets(limit = 6) {
  return call((c) => (c.empty ? [] : featuredPets(c.d.pets, Math.min(12, limit)).map((p) => publicPet(p, c.me))))
}

export function getStats() {
  return call<Stats>((c) => {
    const pets = c.empty ? [] : c.d.pets
    const apps = c.empty ? [] : c.d.applications
    const weekAgo = Date.now() - 7 * 86_400_000
    return {
      adopted: (c.empty ? 0 : ADOPTED_BEFORE_SITE) + pets.filter((p) => p.status === "adopted").length,
      waiting: pets.filter((p) => p.status !== "adopted").length,
      available: pets.filter((p) => p.status === "available").length,
      reserved: pets.filter((p) => p.status === "reserved").length,
      newApplications: apps.filter((a) => new Date(a.createdAt).getTime() > weekAgo).length,
      pendingApplications: apps.filter((a) => a.status === "pending").length,
      volunteers: c.empty ? 0 : c.d.volunteers.length,
    }
  })
}

export function getAnalytics() {
  return call((c) => {
    requirePermission(c, "applications.view")
    return buildAnalytics(c.empty ? [] : c.d.pets, c.empty ? [] : c.d.applications)
  })
}

/** Раздел для инвесторов: обезличенные агрегаты, как GET /api/investors */
export function getInvestorReport() {
  return call<InvestorReport>((c) => {
    const pets = c.empty ? [] : c.d.pets
    const apps = c.empty ? [] : c.d.applications
    const a = buildAnalytics(pets, apps)
    return {
      generatedAt: now(),
      adoptedBeforeSite: c.empty ? 0 : ADOPTED_BEFORE_SITE,
      pets: {
        adoptedOnSite: pets.filter((p) => p.status === "adopted").length,
        waiting: pets.filter((p) => p.status !== "adopted").length,
        available: pets.filter((p) => p.status === "available").length,
        reserved: pets.filter((p) => p.status === "reserved").length,
      },
      volunteers: c.empty ? 0 : c.d.volunteers.length,
      applicationsAllTime: apps.length,
      dataSince: apps.reduce<string | null>((min, x) => (!min || x.createdAt < min ? x.createdAt : min), null),
      weeks: a.weeks,
      totals: a.totals,
      funnel: a.funnel,
      species: a.species,
    }
  })
}

export function getRecommendations(q: MatchQuery = {}) {
  return call((c) => {
    const user = c.me
    const own = user
      ? c.d.applications
          .filter((a) => a.userId === user.id || a.email.toLowerCase() === user.email.toLowerCase())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : []
    const favPets = user ? c.d.pets.filter((p) => user.favorites.includes(p.id)) : []
    const explicit: MatchProfile = {
      housing: q.housing,
      hasKids: q.kids,
      otherPets: q.other,
      experience: q.experience,
      species: q.species,
    }
    const basedOn: string[] = []
    let profile = explicit
    if (isEmptyProfile(explicit)) {
      profile = own[0] ? profileFromApplication(own[0]) : {}
      if (own[0]) basedOn.push(`анкете ${own[0].id}`)
    } else basedOn.push("вашим ответам")
    if (!explicit.species?.length && favPets.length) {
      profile = { ...profile, ...profileFromFavorites(favPets) }
      basedOn.push("избранному")
    }
    const exclude = [...(q.exclude ?? []), ...own.map((a) => a.petId), ...favPets.map((p) => p.id)]
    const limit = Math.min(12, Math.max(1, q.limit ?? 6))
    const items = c.empty || isEmptyProfile(profile) ? [] : matchPets(c.d.pets, profile, { limit, exclude })
    return { basedOn, profile, items: items.map((m) => ({ ...m, pet: publicPet(m.pet, user) })) }
  })
}

// ——— Админка: питомцы ———

export function listAllPets() {
  return call((c) => {
    requirePermission(c, "admin.access")
    return c.empty ? [] : sortPets(c.d.pets, "newest")
  })
}

function validatePet(input: unknown) {
  // Серверная схема требует адрес /uploads/… — здесь загрузки живут как data:-URI,
  // а фото из демо-данных лежат рядом со страницей (photos/…), поэтому фото проверяем сами
  const { photos, ...rest } = (input ?? {}) as { photos?: unknown }
  const parsed = parse(s.petSchema.omit({ photos: true }), rest)
  const list = Array.isArray(photos)
    ? photos.filter((p): p is string => typeof p === "string" && /^(data:image\/|photos\/|https:\/\/images\.unsplash\.com\/)/.test(p))
    : []
  if (list.length === 0) throw new HttpError(400, "Проверьте введённые данные", { photos: "Добавьте хотя бы одно фото" })
  return { ...parsed, photos: list.slice(0, 8) }
}

export function savePet(input: PetInput, id?: string) {
  return call((c) => {
    requirePermission(c, "pets.edit")
    const data = validatePet(input)
    if (!id) {
      const created: Pet = { ...data, id: slugify(data.name, (x) => c.d.pets.some((p) => p.id === x)), addedAt: now() }
      c.d.pets.unshift(created)
      audit(c, { action: "pet.create", target: { type: "pet", id: created.id, label: created.name } })
      return created
    }
    const i = c.d.pets.findIndex((p) => p.id === id)
    if (i < 0) throw new HttpError(404, "Питомец не найден")
    const prev = c.d.pets[i]
    c.d.pets[i] = { ...data, id: prev.id, addedAt: prev.addedAt }
    if (data.status === "adopted") c.d.pets[i].adoptedAt = prev.adoptedAt ?? now()
    audit(c, {
      action: "pet.update",
      target: { type: "pet", id: prev.id, label: data.name },
      details: prev.status !== data.status ? petStatusChange(prev, prev.status, data.status) : undefined,
    })
    return c.d.pets[i]
  })
}

export function deletePet(id: string) {
  return call((c) => {
    requirePermission(c, "pets.edit")
    const gone = c.d.pets.find((p) => p.id === id)
    if (!gone) throw new HttpError(404, "Питомец не найден")
    c.d.pets = c.d.pets.filter((p) => p.id !== id)
    audit(c, { action: "pet.delete", target: { type: "pet", id: gone.id, label: gone.name } })
  })
}

export function setPetStatus(id: string, status: PetStatus) {
  return call((c) => {
    requirePermission(c, "pets.status")
    const { status: next } = parse(s.petStatusSchema, { status })
    const p = c.d.pets.find((x) => x.id === id)
    if (!p) throw new HttpError(404, "Питомец не найден")
    if (next === "adopted" && p.status !== "adopted") p.adoptedAt = now()
    if (next !== "adopted") delete p.adoptedAt
    if (p.status !== next)
      audit(c, { action: "pet.status", target: { type: "pet", id: p.id, label: p.name }, details: petStatusChange(p, p.status, next) })
    p.status = next
    return p
  })
}

export function uploadPhoto(file: Blob) {
  return call(async (c) => {
    requirePermission(c, "pets.edit")
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new HttpError(415, "Загрузите изображение JPG, PNG или WebP")
    }
    if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "Слишком большой файл")
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new HttpError(400, "Не удалось прочитать файл"))
      r.readAsDataURL(file)
    })
  })
}

// ——— Заявки ———

export function createApplication(input: NewApplication) {
  return call((c) => {
    const data = parse(s.applicationSchema, input)
    const pet = c.d.pets.find((p) => p.id === data.petId)
    if (!pet || pet.status === "adopted") throw new HttpError(404, "Этот питомец уже дома или не найден")
    const email = data.email.toLowerCase()
    const duplicate = c.d.applications.find((a) => a.petId === data.petId && a.email.toLowerCase() === email && a.status === "pending")
    if (duplicate) throw new HttpError(409, `У вас уже есть заявка на этого питомца (№ ${duplicate.id}) — мы её рассматриваем.`)
    const app: Application = {
      ...data,
      otherPetsNote: data.hasOtherPets ? data.otherPetsNote : undefined,
      userId: c.me?.id,
      id: `A-${c.d.seq++}`,
      status: "pending",
      staffComments: [],
      createdAt: now(),
    }
    c.d.applications.unshift(app)
    audit(c, {
      actor: c.me ? actorOf(c.me) : { name: app.name },
      action: "application.create",
      target: { type: "application", id: app.id, label: `${app.id} · ${pet.name}` },
    })
    return app
  })
}

export function listApplications() {
  return call((c) => {
    const me = requireUser(c)
    const list = c.empty
      ? []
      : c.d.applications.filter(
          (a) => can(me, "applications.view") || a.userId === me.id || a.email.toLowerCase() === me.email.toLowerCase(),
        )
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export function updateApplicationStatus(id: string, status: ApplicationStatus) {
  return call((c) => {
    requirePermission(c, "applications.status")
    const { status: next } = parse(s.applicationStatusSchema, { status })
    const app = c.d.applications.find((a) => a.id === id)
    if (!app) throw new HttpError(404, "Заявка не найдена")
    const petName = c.d.pets.find((p) => p.id === app.petId)?.name ?? app.petId
    if (app.status !== next) {
      audit(c, {
        action: "application.status",
        target: { type: "application", id: app.id, label: `${app.id} · ${petName}` },
        details: statusChange(app.status, next),
      })
    }
    app.status = next
    if (next === "pending") delete app.decidedAt
    else app.decidedAt = now()
    if (next === "approved") {
      const pet = c.d.pets.find((p) => p.id === app.petId)
      if (pet?.status === "available") {
        audit(c, {
          action: "pet.status",
          target: { type: "pet", id: pet.id, label: pet.name },
          details: petStatusChange(pet, "available", "reserved"),
        })
        pet.status = "reserved"
      }
    }
    return app
  })
}

export function addStaffComment(id: string, text: string) {
  return call((c) => {
    const me = requirePermission(c, "applications.view")
    const { text: clean } = parse(s.commentSchema, { text })
    const app = c.d.applications.find((a) => a.id === id)
    if (!app) throw new HttpError(404, "Заявка не найдена")
    app.staffComments.push({ author: me.name, text: clean, at: now() })
    audit(c, { action: "application.comment", target: { type: "application", id: app.id, label: app.id } })
    return app
  })
}

export function cancelApplication(id: string) {
  return call((c) => {
    const me = requireUser(c)
    const app = c.d.applications.find((a) => a.id === id)
    const own = app && (app.userId === me.id || app.email.toLowerCase() === me.email.toLowerCase())
    if (!app || !own) throw new HttpError(404, "Заявка не найдена")
    if (app.status !== "pending") throw new HttpError(409, "Отозвать можно только заявку на рассмотрении")
    app.status = "cancelled"
    app.decidedAt = now()
    audit(c, { action: "application.cancel", target: { type: "application", id: app.id, label: app.id } })
    return app
  })
}

// ——— Вход и профиль ———

function startSession(d: DB, userId: string) {
  const token = crypto.randomUUID()
  d.sessions = [...d.sessions, { token, userId }].slice(-50)
  return token
}

export async function login(email: string, password: string) {
  const r = await call(async (c) => {
    const data = parse(s.loginSchema, { email, password })
    const user = c.d.users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())
    const ok = !!user && c.d.passwords[user.email] === (await sha256(data.password))
    if (!user || !ok) {
      audit(c, { actor: null, action: "auth.login_failed", details: maskEmail(data.email.toLowerCase()) })
      persist() // call не сохраняет при ошибке, а запись о неудачном входе нужна
      throw new HttpError(401, "Неверный email или пароль. Попробуйте ещё раз или войдите через демо-аккаунт.")
    }
    audit(c, { actor: actorOf(user), action: "auth.login" })
    return { token: startSession(c.d, user.id), user }
  })
  setToken(r.token)
  return r.user
}

export async function register(input: { name: string; email: string; password: string }) {
  const r = await call(async (c) => {
    const data = parse(s.registerSchema, input)
    const email = data.email.toLowerCase()
    if (c.d.users.some((u) => u.email.toLowerCase() === email))
      throw new HttpError(409, "Этот email уже зарегистрирован — попробуйте войти.")
    const user: User = {
      id: `u-${crypto.randomUUID().slice(0, 12)}`,
      name: data.name,
      email,
      role: "user",
      favorites: [],
      notify: { newPets: true, applicationUpdates: true, email: true },
    }
    c.d.users.push(user)
    c.d.passwords[email] = await sha256(data.password)
    audit(c, { actor: actorOf(user), action: "auth.register", target: { type: "user", id: user.id, label: user.name } })
    return { token: startSession(c.d, user.id), user }
  })
  setToken(r.token)
  return r.user
}

export async function logout() {
  const token = getToken()
  try {
    await call((c) => {
      c.d.sessions = c.d.sessions.filter((x) => x.token !== token)
    })
  } finally {
    setToken(null)
  }
}

export function getMe() {
  return call((c) => requireUser(c))
}

export function updateProfile(patch: Partial<Omit<User, "id" | "role" | "favorites">>) {
  return call((c) => {
    const me = requireUser(c)
    const data = parse(s.profileSchema, patch)
    const u = c.d.users.find((x) => x.id === me.id)!
    if (data.email && data.email.toLowerCase() !== u.email.toLowerCase()) {
      const email = data.email.toLowerCase()
      if (c.d.users.some((x) => x.email.toLowerCase() === email)) throw new HttpError(409, "Этот email уже занят")
      c.d.passwords[email] = c.d.passwords[u.email]
      delete c.d.passwords[u.email]
      data.email = email
    }
    Object.assign(u, data)
    return u
  })
}

export function saveFavorites(favorites: string[]) {
  return call((c) => {
    const me = requireUser(c)
    const { favorites: list } = parse(s.favoritesSchema, { favorites })
    const u = c.d.users.find((x) => x.id === me.id)!
    u.favorites = Array.from(new Set(list)).filter((id) => c.d.pets.some((p) => p.id === id))
    return u
  })
}

export function listUsers() {
  return call((c) => {
    requirePermission(c, "users.manage")
    return c.d.users
  })
}

export function setUserRole(id: string, role: Role) {
  return call((c) => {
    const me = requirePermission(c, "users.manage")
    const { role: next } = parse(s.roleSchema, { role })
    if (id === me.id) throw new HttpError(400, "Нельзя поменять роль самому себе")
    const u = c.d.users.find((x) => x.id === id)
    if (!u) throw new HttpError(404, "Пользователь не найден")
    if (u.role !== next)
      audit(c, { action: "user.role", target: { type: "user", id: u.id, label: u.name }, details: roleChange(u.role, next) })
    u.role = next
    return u
  })
}

// ——— Волонтёры и прочее ———

export function listVolunteers() {
  return call((c) => {
    requirePermission(c, "volunteers.manage")
    return c.empty ? [] : c.d.volunteers
  })
}

export function saveVolunteers(volunteers: Volunteer[]) {
  return call((c) => {
    requirePermission(c, "volunteers.manage")
    const { volunteers: list } = parse(s.volunteersSchema, { volunteers })
    c.d.volunteers = list
    audit(c, { action: "volunteers.update", target: { type: "volunteers", label: `${list.length} волонтёров` } })
    return list
  })
}

export function sendVolunteerRequest(input: { name: string; phone: string; email: string; direction: string; days: string[] }) {
  return call((c) => {
    c.d.volunteerRequests.push({ ...parse(s.volunteerRequestSchema, input), at: now() })
  })
}

export function subscribe(email: string) {
  return call((c) => {
    const { email: clean } = parse(s.subscribeSchema, { email })
    if (!c.d.subscribers.includes(clean.toLowerCase())) c.d.subscribers.push(clean.toLowerCase())
  })
}

export function sendFeedback(input: { name: string; email: string; message: string }) {
  return call((c) => {
    c.d.feedback.push({ ...parse(s.feedbackSchema, input), at: now() })
  })
}

/** Вернуть демо-данные к исходному состоянию (сессии сохраняем, чтобы не разлогинить) */
export function resetDemoData() {
  return call(async (c) => {
    requirePermission(c, "users.manage")
    const fresh = await seedDb()
    const sessions = c.d.sessions.filter((x) => fresh.users.some((u) => u.id === x.userId))
    Object.assign(c.d, fresh, { sessions })
    audit(c, { action: "data.reset", target: { type: "data", label: "Демо-данные" } })
  })
}

// ——— Фейкдоры ———

/** Без сервера переходы считаются в браузере зрителя — видно, как это выглядит у администратора */
export function trackFakeDoor(feature: FakeDoor) {
  void load().then((d) => {
    recordFakeDoor(d.fakeDoors, feature)
    persist()
  })
}

export function getFakeDoorStats() {
  return call((c) => {
    requirePermission(c, "users.manage")
    return fakeDoorStats(c.empty ? {} : c.d.fakeDoors)
  })
}

// ——— Журнал действий и ошибки браузера ———

export function listAudit(q: AuditQuery = {}) {
  return call((c) => {
    requirePermission(c, "users.manage")
    const page = Math.max(1, q.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25))
    const list = c.empty ? [] : filterAudit(c.d.audit, q.group, q.q)
    return { items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length }
  })
}

/** Сервера нет — ошибку видно только в консоли браузера */
export function reportClientError(report: ClientErrorReport) {
  console.warn("[client_error]", report)
}
