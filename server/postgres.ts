/*
 * Хранение в Postgres: данные и загруженные фото — в таблицах (схема — server/schema.sql,
 * применяется при каждом запуске). Включается переменной DATABASE_URL (см. .env.example).
 *
 * Запись: после каждого изменения считаем строки всех таблиц из данных в памяти и в одной
 * транзакции отправляем только то, что поменялось (upsert новых и изменённых, delete исчезнувших).
 * Сравниваем с тем, что сохранили в прошлый раз, — без лишних запросов к базе.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import type { FakeDoorCounters } from "../src/lib/fake-door.ts"
import type { Application, AuditEntry, Pet, User, Volunteer } from "../src/lib/types.ts"
import { UPLOAD_NAME, type Backend, type DB } from "./store.ts"

type Row = Record<string, unknown>
type Table = { name: string; key: string; columns: string[]; jsonb: string[]; rows: (db: DB) => Row[] }

/** Как данные в памяти раскладываются по таблицам */
const TABLES: Table[] = [
  {
    name: "pets",
    key: "id",
    columns: ["id", "name", "species", "status", "added_at", "data"],
    jsonb: ["data"],
    rows: (db) => db.pets.map((p) => ({ id: p.id, name: p.name, species: p.species, status: p.status, added_at: p.addedAt, data: p })),
  },
  {
    name: "applications",
    key: "id",
    columns: ["id", "pet_id", "email", "status", "created_at", "data"],
    jsonb: ["data"],
    rows: (db) =>
      db.applications.map((a) => ({ id: a.id, pet_id: a.petId, email: a.email, status: a.status, created_at: a.createdAt, data: a })),
  },
  {
    name: "users",
    key: "id",
    columns: ["id", "email", "role", "data"],
    jsonb: ["data"],
    rows: (db) => db.users.map((u) => ({ id: u.id, email: u.email, role: u.role, data: u })),
  },
  {
    name: "passwords",
    key: "email",
    columns: ["email", "hash"],
    jsonb: [],
    rows: (db) => Object.entries(db.passwords).map(([email, hash]) => ({ email, hash })),
  },
  {
    name: "sessions",
    key: "token",
    columns: ["token", "user_id", "created_at"],
    jsonb: [],
    rows: (db) => db.sessions.map((s) => ({ token: s.token, user_id: s.userId, created_at: s.createdAt })),
  },
  { name: "volunteers", key: "id", columns: ["id", "data"], jsonb: ["data"], rows: (db) => db.volunteers.map((v) => ({ id: v.id, data: v })) },
  {
    name: "audit",
    key: "id",
    columns: ["id", "at", "action", "data"],
    jsonb: ["data"],
    rows: (db) => db.audit.map((e) => ({ id: e.id, at: e.at, action: e.action, data: e })),
  },
  {
    name: "volunteer_requests",
    key: "pos",
    columns: ["pos", "data"],
    jsonb: ["data"],
    rows: (db) => db.volunteerRequests.map((data, pos) => ({ pos, data })),
  },
  { name: "feedback", key: "pos", columns: ["pos", "data"], jsonb: ["data"], rows: (db) => db.feedback.map((data, pos) => ({ pos, data })) },
  { name: "subscribers", key: "email", columns: ["email"], jsonb: [], rows: (db) => db.subscribers.map((email) => ({ email })) },
  {
    name: "fake_doors",
    key: "feature",
    columns: ["feature", "count", "last_at"],
    jsonb: [],
    rows: (db) => Object.entries(db.fakeDoors).map(([feature, c]) => ({ feature, count: c!.count, last_at: c!.lastAt })),
  },
  { name: "meta", key: "key", columns: ["key", "value"], jsonb: ["value"], rows: (db) => [{ key: "seq", value: db.seq }] },
]

const chunks = <T>(list: T[], size = 200) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v))

/** Пароль из адреса подключения в лог не попадает */
function safeLocation(url: string) {
  try {
    const u = new URL(url)
    return `postgres://${u.hostname}:${u.port || 5432}${u.pathname}`
  } catch {
    return "postgres"
  }
}

export class PostgresBackend implements Backend {
  readonly location: string
  private pool: pg.Pool
  /** что лежит в каждой таблице после прошлого сохранения: ключ → строка в JSON */
  private saved = new Map<string, Map<string, string>>()

  constructor(url: string) {
    this.location = safeLocation(url)
    this.pool = new pg.Pool({ connectionString: url, max: 5 })
  }

  async close() {
    await this.pool.end()
  }

  private async all(table: string, order: string) {
    return (await this.pool.query(`select * from ${table} order by ${order}`)).rows as Row[]
  }

  async load(): Promise<DB | null> {
    await this.pool.query(await readFile(path.join(import.meta.dirname, "schema.sql"), "utf8"))
    const meta = await this.all("meta", "key")
    const seq = meta.find((m) => m.key === "seq")?.value
    if (typeof seq !== "number") return null // таблицы пустые — первый запуск

    const [pets, applications, users, passwords, sessions, volunteers, audit, requests, feedback, subscribers, fakeDoors] =
      await Promise.all([
        this.all("pets", "added_at desc"),
        this.all("applications", "created_at desc"),
        this.all("users", "email"),
        this.all("passwords", "email"),
        this.all("sessions", "created_at"),
        this.all("volunteers", "id"),
        this.all("audit", "at desc"),
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
      sessions: sessions.map((r) => ({ token: r.token as string, userId: r.user_id as string, createdAt: iso(r.created_at) })),
      volunteers: volunteers.map((r) => r.data as Volunteer),
      audit: audit.map((r) => r.data as AuditEntry),
      volunteerRequests: requests.map((r) => r.data as DB["volunteerRequests"][number]),
      feedback: feedback.map((r) => r.data as DB["feedback"][number]),
      subscribers: subscribers.map((r) => r.email as string),
      fakeDoors: Object.fromEntries(fakeDoors.map((r) => [r.feature as string, { count: r.count as number, lastAt: iso(r.last_at) }])) as FakeDoorCounters,
      seq,
    }
    // Запоминаем, что уже лежит в базе, — следующее сохранение отправит только разницу
    for (const t of TABLES) this.saved.set(t.name, new Map(t.rows(db).map((r) => [String(r[t.key]), JSON.stringify(r)])))
    return db
  }

  async save(db: DB) {
    const plan = TABLES.map((t) => {
      const before = this.saved.get(t.name) ?? new Map<string, string>()
      const now = new Map(t.rows(db).map((r) => [String(r[t.key]), r] as const))
      const changed = [...now.entries()].filter(([k, r]) => before.get(k) !== JSON.stringify(r)).map(([, r]) => r)
      const gone = [...before.keys()].filter((k) => !now.has(k))
      return { t, now, changed, gone }
    })
    if (plan.every((p) => !p.changed.length && !p.gone.length)) return

    // Всё изменение — одной транзакцией: при ошибке база не останется наполовину обновлённой
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      for (const { t, changed, gone } of plan) {
        for (const part of chunks(changed)) {
          const values: unknown[] = []
          const tuples = part.map((r) => {
            const cells = t.columns.map((c) => {
              const v = r[c]
              values.push(t.jsonb.includes(c) ? JSON.stringify(v) : v)
              return `$${values.length}${t.jsonb.includes(c) ? "::jsonb" : ""}`
            })
            return `(${cells.join(", ")})`
          })
          const updates = t.columns.filter((c) => c !== t.key).map((c) => `${c} = excluded.${c}`)
          await client.query(
            `insert into ${t.name} (${t.columns.join(", ")}) values ${tuples.join(", ")} on conflict (${t.key}) ` +
              (updates.length ? `do update set ${updates.join(", ")}` : "do nothing"),
            values,
          )
        }
        for (const part of chunks(gone)) {
          const keys = t.key === "pos" ? part.map(Number) : part
          await client.query(`delete from ${t.name} where ${t.key} = any($1)`, [keys])
        }
      }
      await client.query("commit")
    } catch (e) {
      await client.query("rollback").catch(() => {})
      // Транзакция откатилась — заново узнаём, какие строки лежат в базе: следующее сохранение
      // перепишет их все и удалит лишние, и память с базой снова сойдутся
      await this.resync().catch(() => this.saved.clear())
      throw e
    } finally {
      client.release()
    }
    for (const { t, now } of plan) this.saved.set(t.name, new Map([...now.entries()].map(([k, r]) => [k, JSON.stringify(r)])))
  }

  /** Ключи строк, которые сейчас в базе; содержимое неизвестно — пометка "" заставит переписать строку */
  private async resync() {
    for (const t of TABLES) {
      const r = await this.pool.query(`select ${t.key} as k from ${t.name}`)
      this.saved.set(t.name, new Map(r.rows.map((x) => [String(x.k), ""])))
    }
  }

  async saveUpload(name: string, body: Buffer, contentType: string) {
    await this.pool.query(
      "insert into uploads (name, content_type, body) values ($1, $2, $3) on conflict (name) do update set content_type = excluded.content_type, body = excluded.body",
      [name, contentType, body],
    )
  }

  async readUpload(name: string) {
    const r = await this.pool.query("select body from uploads where name = $1", [name])
    return r.rows.length ? (r.rows[0].body as Buffer) : null
  }

  async listUploads() {
    const r = await this.pool.query("select name from uploads order by name")
    return r.rows.map((x) => x.name as string).filter((n) => UPLOAD_NAME.test(n))
  }
}

/** Бэкенд Postgres, если задан DATABASE_URL; иначе null — работаем на JSON-файле */
export function postgresFromEnv(env = process.env) {
  const url = env.DATABASE_URL?.trim()
  return url ? new PostgresBackend(url) : null
}
