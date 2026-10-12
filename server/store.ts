/*
 * Хранилище — один JSON-файл (data/db.json).
 * Запись атомарная (временный файл + rename) и последовательная: параллельные запросы
 * не перетрут друг друга и не оставят полузаписанный файл при падении.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { seedApplications, seedPets, seedUsers, seedVolunteers, DEMO_PASSWORD } from "../src/lib/seed.ts"
import { seedAudit } from "../src/lib/audit.ts"
import { buildApplications } from "../src/lib/seed-history.ts"
import type { Application, AuditEntry, Pet, User, Volunteer } from "../src/lib/types.ts"
import { hashPassword } from "./auth.ts"

export type Session = { token: string; userId: string; createdAt: string }

export type DB = {
  pets: Pet[]
  applications: Application[]
  users: User[]
  /** email → scrypt-хеш пароля */
  passwords: Record<string, string>
  sessions: Session[]
  volunteers: Volunteer[]
  volunteerRequests: { name: string; phone: string; email: string; direction: string; days: string[]; at: string }[]
  subscribers: string[]
  feedback: { name: string; email: string; message: string; at: string }[]
  /** журнал действий, новые записи — в начале */
  audit: AuditEntry[]
  seq: number
}

export async function seedDb(): Promise<DB> {
  const passwords: Record<string, string> = {}
  for (const u of seedUsers) passwords[u.email] = await hashPassword(DEMO_PASSWORD)
  // Свежие заявки из seed.ts + история за три месяца для дашборда
  const { applications, seq } = buildApplications(seedApplications)
  return structuredClone({
    pets: seedPets,
    applications,
    users: seedUsers,
    passwords,
    sessions: [],
    volunteers: seedVolunteers,
    volunteerRequests: [],
    subscribers: [],
    feedback: [],
    audit: seedAudit(applications, seedPets, seedUsers),
    seq,
  })
}

export class Store {
  private data!: DB
  private queue: Promise<void> = Promise.resolve()
  readonly file: string
  readonly uploadsDir: string

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "db.json")
    this.uploadsDir = path.join(dataDir, "uploads")
  }

  async init() {
    await mkdir(this.uploadsDir, { recursive: true })
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8")) as DB
      // db.json, созданный до появления журнала, — начинаем журнал с пустого
      this.data.audit ??= []
      // Демо-аккаунт, добавленный в seed.ts после создания базы, — дописываем, иначе его кнопка входа не сработает
      for (const u of seedUsers) {
        if (this.data.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) continue
        this.data.users.push(structuredClone(u))
        this.data.passwords[u.email] = await hashPassword(DEMO_PASSWORD)
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
      this.data = await seedDb()
      await this.flush()
    }
    return this
  }

  get db() {
    return this.data
  }

  /** Изменить данные и сохранить на диск; следующее изменение ждёт окончания предыдущего */
  async write<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
    let result!: T
    const run = this.queue.then(async () => {
      result = await fn(this.data)
      await this.flush()
    })
    this.queue = run.catch(() => {})
    await run
    return result
  }

  async reset() {
    const fresh = await seedDb()
    return this.write((db) => {
      // Сессии оставляем, чтобы сброс не разлогинил тех, кто работает с демо
      const sessions = db.sessions.filter((s) => fresh.users.some((u) => u.id === s.userId))
      Object.assign(db, fresh, { sessions })
    })
  }

  private async flush() {
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(this.data, null, 2))
    await rename(tmp, this.file)
  }
}
