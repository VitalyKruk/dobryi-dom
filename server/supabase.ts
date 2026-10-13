/*
 * Хранение в Supabase: данные — таблицы Postgres (supabase/migrations), фото — бакет pet-photos в Storage.
 *
 * Включается переменными окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (см. .env.example).
 * Ключ service_role — серверный секрет: он обходит RLS, поэтому живёт только в окружении API
 * и никогда не попадает в браузер или в git.
 *
 * Запись: после каждого изменения считаем строки всех таблиц из данных в памяти и отправляем
 * только то, что поменялось (upsert новых и изменённых, delete исчезнувших). Сравниваем с тем,
 * что сохранили в прошлый раз, — без лишних запросов к базе.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Application, AuditEntry, Pet, User, Volunteer } from "../src/lib/types.ts"
import type { FakeDoorCounters } from "../src/lib/fake-door.ts"
import { UPLOAD_NAME, type Backend, type DB } from "./store.ts"

const BUCKET = "pet-photos"
const PAGE = 1000

type Row = Record<string, unknown>
type Table = { name: string; key: string; rows: (db: DB) => Row[] }

/** Как данные в памяти раскладываются по таблицам */
const TABLES: Table[] = [
  {
    name: "pets",
    key: "id",
    rows: (db) => db.pets.map((p) => ({ id: p.id, name: p.name, species: p.species, status: p.status, added_at: p.addedAt, data: p })),
  },
  {
    name: "applications",
    key: "id",
    rows: (db) =>
      db.applications.map((a) => ({ id: a.id, pet_id: a.petId, email: a.email, status: a.status, created_at: a.createdAt, data: a })),
  },
  { name: "users", key: "id", rows: (db) => db.users.map((u) => ({ id: u.id, email: u.email, role: u.role, data: u })) },
  { name: "passwords", key: "email", rows: (db) => Object.entries(db.passwords).map(([email, hash]) => ({ email, hash })) },
  {
    name: "sessions",
    key: "token",
    rows: (db) => db.sessions.map((s) => ({ token: s.token, user_id: s.userId, created_at: s.createdAt })),
  },
  { name: "volunteers", key: "id", rows: (db) => db.volunteers.map((v) => ({ id: v.id, data: v })) },
  { name: "audit", key: "id", rows: (db) => db.audit.map((e) => ({ id: e.id, at: e.at, action: e.action, data: e })) },
  { name: "volunteer_requests", key: "pos", rows: (db) => db.volunteerRequests.map((data, pos) => ({ pos, data })) },
  { name: "feedback", key: "pos", rows: (db) => db.feedback.map((data, pos) => ({ pos, data })) },
  { name: "subscribers", key: "email", rows: (db) => db.subscribers.map((email) => ({ email })) },
  {
    name: "fake_doors",
    key: "feature",
    rows: (db) => Object.entries(db.fakeDoors).map(([feature, c]) => ({ feature, count: c!.count, last_at: c!.lastAt })),
  },
  { name: "meta", key: "key", rows: (db) => [{ key: "seq", value: db.seq }] },
]

const chunks = <T>(list: T[], size = 500) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

export class SupabaseBackend implements Backend {
  readonly location: string
  private client: SupabaseClient
  /** что лежит в каждой таблице после прошлого сохранения: ключ → строка в JSON */
  private saved = new Map<string, Map<string, string>>()

  constructor(url: string, serviceRoleKey: string) {
    this.location = `${url} (Supabase)`
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  private async all(table: string, order: string, ascending = true): Promise<Row[]> {
    const out: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client.from(table).select("*").order(order, { ascending }).range(from, from + PAGE - 1)
      if (error) throw new Error(`Supabase: чтение ${table}: ${error.message}`)
      out.push(...(data as Row[]))
      if (data.length < PAGE) return out
    }
  }

  async load(): Promise<DB | null> {
    const meta = await this.all("meta", "key")
    const seq = meta.find((m) => m.key === "seq")?.value
    if (typeof seq !== "number") return null // таблицы пустые — первый запуск

    const [pets, applications, users, passwords, sessions, volunteers, audit, requests, feedback, subscribers, fakeDoors] =
      await Promise.all([
        this.all("pets", "added_at", false),
        this.all("applications", "created_at", false),
        this.all("users", "email"),
        this.all("passwords", "email"),
        this.all("sessions", "created_at"),
        this.all("volunteers", "id"),
        this.all("audit", "at", false),
        this.all("volunteer_requests", "pos"),
        this.all("feedback", "pos"),
        this.all("subscribers", "email"),
        this.all("fake_doors", "feature"),
      ])
    const db: DB = {
      pets: pets.map((r) => r.data as Pet),
      applications: applications.map((r) => r.data as Application),
      users: users.map((r) => r.data as User),
      passwords: Object.fromEntries(passwords.map((r) => [r.email as string, r.hash as string])),
      sessions: sessions.map((r) => ({ token: r.token as string, userId: r.user_id as string, createdAt: new Date(r.created_at as string).toISOString() })),
      volunteers: volunteers.map((r) => r.data as Volunteer),
      audit: audit.map((r) => r.data as AuditEntry),
      volunteerRequests: requests.map((r) => r.data as DB["volunteerRequests"][number]),
      feedback: feedback.map((r) => r.data as DB["feedback"][number]),
      subscribers: subscribers.map((r) => r.email as string),
      fakeDoors: Object.fromEntries(
        fakeDoors.map((r) => [r.feature as string, { count: r.count as number, lastAt: new Date(r.last_at as string).toISOString() }]),
      ) as FakeDoorCounters,
      seq,
    }
    // Запоминаем, что уже лежит в базе, — следующее сохранение отправит только разницу
    for (const t of TABLES) this.saved.set(t.name, new Map(t.rows(db).map((r) => [String(r[t.key]), JSON.stringify(r)])))
    return db
  }

  async save(db: DB) {
    for (const t of TABLES) {
      const before = this.saved.get(t.name) ?? new Map<string, string>()
      const now = new Map(t.rows(db).map((r) => [String(r[t.key]), r] as const))
      const changed = [...now.entries()].filter(([k, r]) => before.get(k) !== JSON.stringify(r)).map(([, r]) => r)
      const gone = [...before.keys()].filter((k) => !now.has(k))
      for (const part of chunks(changed)) {
        const { error } = await this.client.from(t.name).upsert(part, { onConflict: t.key })
        if (error) throw new Error(`Supabase: запись ${t.name}: ${error.message}`)
      }
      for (const part of chunks(gone)) {
        const { error } = await this.client.from(t.name).delete().in(t.key, part)
        if (error) throw new Error(`Supabase: удаление из ${t.name}: ${error.message}`)
      }
      this.saved.set(t.name, new Map([...now.entries()].map(([k, r]) => [k, JSON.stringify(r)])))
    }
  }

  async saveUpload(name: string, body: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(BUCKET).upload(name, body, { contentType, upsert: true })
    if (error) throw new Error(`Supabase Storage: загрузка ${name}: ${error.message}`)
  }

  async readUpload(name: string) {
    const { data, error } = await this.client.storage.from(BUCKET).download(name)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  }

  async listUploads() {
    const { data, error } = await this.client.storage.from(BUCKET).list("", { limit: 1000 })
    if (error) throw new Error(`Supabase Storage: список файлов: ${error.message}`)
    return data.map((f) => f.name).filter((n) => UPLOAD_NAME.test(n))
  }
}

/** Бэкенд Supabase, если заданы переменные окружения; иначе null — работаем на JSON-файле */
export function supabaseFromEnv(env = process.env) {
  const url = env.SUPABASE_URL?.trim()
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url && !key) return null
  if (!url || !key) throw new Error("Для Supabase нужны обе переменные: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY")
  return new SupabaseBackend(url, key)
}
