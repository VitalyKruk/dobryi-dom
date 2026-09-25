/*
 * Клиент REST API (server/). Все страницы общаются с бэкендом только через эти функции.
 * Запросы идут на /api того же домена: в разработке их проксирует Vite, в Docker — nginx.
 */
import { demoMode } from "./demo"
import { filtersToQuery } from "./pets-query"
import type { Match, MatchProfile } from "./match"
import type {
  Analytics,
  Application,
  ApplicationStatus,
  Pet,
  PetFilters,
  PetStatus,
  Role,
  Species,
  User,
  Volunteer,
} from "./types"

const TOKEN_KEY = "dd:token"

export class ApiError extends Error {
  status: number
  /** Ошибки по полям формы от серверной валидации: { phone: "…" } */
  fields?: Record<string, string>
  constructor(message: string, status = 0, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // без localStorage сессия проживёт до перезагрузки
  }
}

type Body = unknown

async function request<T>(method: string, path: string, body?: Body, extra?: RequestInit): Promise<T> {
  const headers = new Headers(extra?.headers)
  const token = getToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  const mode = demoMode()
  if (mode) headers.set("x-demo", mode)
  let payload: BodyInit | undefined
  if (body instanceof Blob) payload = body
  else if (body !== undefined) {
    headers.set("content-type", "application/json")
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.")
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Токен истёк или отозван — забываем его, чтобы интерфейс перешёл в гостевой режим
    if (res.status === 401 && token) setToken(null)
    const message =
      (data as { error?: string } | null)?.error ??
      (res.status >= 500 ? "Сервер временно недоступен. Попробуйте ещё раз." : "Не удалось выполнить запрос.")
    throw new ApiError(message, res.status, (data as { fields?: Record<string, string> } | null)?.fields)
  }
  return data as T
}

const get = <T>(path: string) => request<T>("GET", path)
const send = <T>(method: string, path: string, body?: Body) => request<T>(method, path, body)
const enc = encodeURIComponent

// ——— Питомцы ———

export function getPets(filters: PetFilters, page = 1, pageSize = 12) {
  const q = filtersToQuery(filters)
  q.set("page", String(page))
  q.set("pageSize", String(pageSize))
  return get<{ items: Pet[]; total: number }>(`/pets?${q}`)
}

export async function countPets(filters: PetFilters) {
  return (await get<{ count: number }>(`/pets/count?${filtersToQuery(filters)}`)).count
}

/** null — питомца нет (404), остальные ошибки пробрасываются */
export async function getPet(id: string) {
  try {
    return await get<Pet>(`/pets/${enc(id)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function getPetsByIds(ids: string[]) {
  if (ids.length === 0) return []
  return (await get<{ items: Pet[] }>(`/pets?ids=${ids.map(enc).join(",")}`)).items
}

export const getSimilarPets = (pet: Pet) => get<Pet[]>(`/pets/${enc(pet.id)}/similar`)
export const getFeaturedPets = (limit = 6) => get<Pet[]>(`/pets/featured?limit=${limit}`)

export type Stats = {
  adopted: number
  waiting: number
  available: number
  reserved: number
  newApplications: number
  pendingApplications: number
  volunteers: number
}
export const getStats = () => get<Stats>("/stats")
export const getAnalytics = () => get<Analytics>("/admin/analytics")

// ——— Подбор «Подходят вам» ———

export type MatchQuery = {
  housing?: Application["housing"]
  kids?: boolean
  /** кто уже живёт дома; пустой массив — никого */
  other?: Species[]
  experience?: Application["experience"]
  species?: Species[]
  exclude?: string[]
  limit?: number
}

/** Без параметров — по последней анкете и избранному вошедшего пользователя */
export function getRecommendations(q: MatchQuery = {}) {
  const p = new URLSearchParams()
  if (q.housing) p.set("housing", q.housing)
  if (q.kids !== undefined) p.set("kids", q.kids ? "yes" : "no")
  if (q.other) p.set("other", q.other.length ? q.other.join(",") : "none")
  if (q.experience) p.set("experience", q.experience)
  if (q.species?.length) p.set("species", q.species.join(","))
  if (q.exclude?.length) p.set("exclude", q.exclude.join(","))
  if (q.limit) p.set("limit", String(q.limit))
  return get<{ basedOn: string[]; profile: MatchProfile; items: Match[] }>(`/recommendations?${p}`)
}

// ——— Админка: питомцы ———

export type PetInput = Omit<Pet, "id" | "addedAt">

export const listAllPets = () => get<Pet[]>("/admin/pets")

/** Без id — создать (id придумает сервер), с id — сохранить изменения */
export function savePet(input: PetInput, id?: string) {
  return id ? send<Pet>("PUT", `/pets/${enc(id)}`, input) : send<Pet>("POST", "/pets", input)
}

export const deletePet = (id: string) => send<void>("DELETE", `/pets/${enc(id)}`)
export const setPetStatus = (id: string, status: PetStatus) => send<Pet>("PATCH", `/pets/${enc(id)}/status`, { status })

/** Загрузка фото: тело запроса — сам файл; ответ — адрес /uploads/… */
export async function uploadPhoto(file: Blob) {
  return (await request<{ url: string }>("POST", "/uploads", file, { headers: { "content-type": file.type } })).url
}

// ——— Заявки ———

export type NewApplication = Omit<Application, "id" | "status" | "staffComments" | "createdAt" | "userId">

export const createApplication = (input: NewApplication) => send<Application>("POST", "/applications", input)
/** Сотрудник получает все заявки, пользователь — свои */
export const listApplications = () => get<Application[]>("/applications")
export const updateApplicationStatus = (id: string, status: ApplicationStatus) =>
  send<Application>("PATCH", `/applications/${enc(id)}/status`, { status })
export const addStaffComment = (id: string, text: string) => send<Application>("POST", `/applications/${enc(id)}/comments`, { text })
export const cancelApplication = (id: string) => send<Application>("POST", `/applications/${enc(id)}/cancel`)

// ——— Вход и профиль ———

type AuthResponse = { token: string; user: User }

export async function login(email: string, password: string) {
  const r = await send<AuthResponse>("POST", "/auth/login", { email, password })
  setToken(r.token)
  return r.user
}

export async function register(input: { name: string; email: string; password: string }) {
  const r = await send<AuthResponse>("POST", "/auth/register", input)
  setToken(r.token)
  return r.user
}

export async function logout() {
  try {
    await send<void>("POST", "/auth/logout")
  } finally {
    setToken(null)
  }
}

export const getMe = () => get<User>("/me")
export const updateProfile = (patch: Partial<Omit<User, "id" | "role" | "favorites">>) => send<User>("PATCH", "/me", patch)
export const saveFavorites = (favorites: string[]) => send<User>("PUT", "/me/favorites", { favorites })

export const listUsers = () => get<User[]>("/users")
export const setUserRole = (id: string, role: Role) => send<User>("PATCH", `/users/${enc(id)}/role`, { role })

// ——— Волонтёры и прочее ———

export const listVolunteers = () => get<Volunteer[]>("/volunteers")
export const saveVolunteers = (volunteers: Volunteer[]) => send<Volunteer[]>("PUT", "/volunteers", { volunteers })
export const sendVolunteerRequest = (input: { name: string; phone: string; email: string; direction: string; days: string[] }) =>
  send<void>("POST", "/volunteer-requests", input)
export const subscribe = (email: string) => send<void>("POST", "/subscribe", { email })
export const sendFeedback = (input: { name: string; email: string; message: string }) => send<void>("POST", "/feedback", input)
export const resetDemoData = () => send<void>("POST", "/admin/reset")
