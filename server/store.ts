/*
 * Хранилище данных API. Все данные держим в памяти (их немного — сотни записей), изменения
 * идут строго по очереди, а сохраняет их подключаемый бэкенд:
 *
 *   - JsonBackend — один файл data/db.json + папка data/uploads (тесты, запуск без Postgres);
 *   - PostgresBackend (server/postgres.ts) — таблицы Postgres, фото в таблице uploads.
 *
 * Код маршрутов (app.ts) от бэкенда не зависит: он работает со store.db и store.write().
 * Ограничение: один процесс API на базу — кеш в памяти не синхронизируется между процессами.
 */
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { seedApplications, seedPets, seedUsers, seedVolunteers, DEMO_PASSWORD } from "../src/lib/seed.ts"
import { seedAudit } from "../src/lib/audit.ts"
import type { FakeDoorCounters } from "../src/lib/fake-door.ts"
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
  /** переходы по кнопкам функций в разработке (фейкдоры) */
  fakeDoors: FakeDoorCounters
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
    fakeDoors: {},
    seq,
  })
}

/** Снимок Unsplash в старых стартовых данных: id снимка и приближение кадра (fp-z) */
const UNSPLASH_PHOTO = /^https:\/\/images\.unsplash\.com\/photo-([0-9a-f]+-[0-9a-f]+)\?(?:.*&)?fp-z=([\d.]+)/

/**
 * Ссылки на Unsplash (в России заблокирован) → копии из public/photos, которые раздаёт сам сайт.
 * У питомца два кадра одного снимка: крупный план — тот, у которого приближение больше.
 * Меняем только снимки, копии которых есть (это фото из seedPets); возвращаем, сколько заменили.
 */
function localizePhotos(pets: Pet[]) {
  const known = new Set(seedPets.flatMap((p) => p.photos))
  let changed = 0
  for (const pet of pets) {
    const parsed = pet.photos.map((url) => UNSPLASH_PHOTO.exec(url))
    pet.photos = pet.photos.map((url, i) => {
      const m = parsed[i]
      if (!m) return url
      const zoom = parsed.some((o) => o?.[1] === m[1] && Number(o[2]) < Number(m[2]))
      const local = `/photos/${m[1]}${zoom ? "-zoom" : ""}.jpg`
      if (!known.has(local)) return url
      changed++
      return local
    })
  }
  return changed
}

/** Куда сохраняются данные и фото */
export interface Backend {
  /** для лога при запуске: путь к файлу или адрес базы */
  readonly location: string
  /** null — хранилище пустое (первый запуск) */
  load(): Promise<DB | null>
  save(db: DB): Promise<void>
  saveUpload(name: string, body: Buffer, contentType: string): Promise<void>
  /** null — файла нет */
  readUpload(name: string): Promise<Buffer | null>
  /** имена всех загруженных фото — для переноса между бэкендами */
  listUploads(): Promise<string[]>
}

/** Один JSON-файл: запись атомарная (временный файл + rename) — при падении не останется полузаписанного файла */
export class JsonBackend implements Backend {
  readonly file: string
  readonly uploadsDir: string

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "db.json")
    this.uploadsDir = path.join(dataDir, "uploads")
  }

  get location() {
    return this.file
  }

  async load() {
    await mkdir(this.uploadsDir, { recursive: true })
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as DB
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null
      throw e
    }
  }

  async save(db: DB) {
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(db, null, 2))
    await rename(tmp, this.file)
  }

  async saveUpload(name: string, body: Buffer) {
    await writeFile(path.join(this.uploadsDir, name), body)
  }

  async readUpload(name: string) {
    try {
      return await readFile(path.join(this.uploadsDir, name))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null
      throw e
    }
  }

  async listUploads() {
    try {
      return (await readdir(this.uploadsDir)).filter((n) => UPLOAD_NAME.test(n))
    } catch {
      return []
    }
  }
}

/** Имя загруженного фото: его придумывает сервер — 32 hex-символа и расширение */
export const UPLOAD_NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/

export const uploadType = (name: string) => (name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg")

export class Store {
  private data!: DB
  private queue: Promise<void> = Promise.resolve()
  readonly backend: Backend
  private readonly importFrom?: Backend

  /**
   * @param backend куда сохранять; строка — папка для JsonBackend (как было раньше)
   * @param importFrom откуда перенести данные, если основное хранилище пустое (например, db.json → Postgres)
   */
  constructor(backend: Backend | string, importFrom?: Backend) {
    this.backend = typeof backend === "string" ? new JsonBackend(backend) : backend
    this.importFrom = importFrom
  }

  get location() {
    return this.backend.location
  }

  async init() {
    let data = await this.backend.load()
    let source = "existing"
    if (!data && this.importFrom) {
      data = await this.importFrom.load()
      if (data) {
        source = "import"
        // Фото переносим вместе с данными: ссылки /uploads/<имя> в карточках остаются рабочими
        for (const name of await this.importFrom.listUploads()) {
          const body = await this.importFrom.readUpload(name)
          if (body) await this.backend.saveUpload(name, body, uploadType(name))
        }
      }
    }
    if (!data) {
      data = await seedDb()
      source = "seed"
    }
    // База, созданная до появления журнала и фейкдоров, — начинаем их с пустого
    data.audit ??= []
    data.fakeDoors ??= {}
    // Демо-аккаунт, добавленный в seed.ts после создания базы, — дописываем, иначе его кнопка входа не сработает
    for (const u of seedUsers) {
      if (data.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) continue
      data.users.push(structuredClone(u))
      data.passwords[u.email] = await hashPassword(DEMO_PASSWORD)
    }
    // База, созданная, когда фото грузились с Unsplash, — переводим на копии с нашего сервера
    this.localizedPhotos = localizePhotos(data.pets)
    this.data = data
    await this.backend.save(this.data)
    this.source = source
    return this
  }

  /** откуда взялись данные при запуске: existing | import | seed — для лога */
  source = "existing"
  /** сколько ссылок на Unsplash заменено копиями при запуске — для лога */
  localizedPhotos = 0

  get db() {
    return this.data
  }

  /** Изменить данные и сохранить; следующее изменение ждёт окончания предыдущего */
  async write<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
    let result!: T
    const run = this.queue.then(async () => {
      result = await fn(this.data)
      await this.backend.save(this.data)
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
      // Пароли — тоже: на проде у персонала свои (server/set-password.ts), сброс не возвращает демо-пароль
      const passwords = { ...fresh.passwords }
      for (const email of Object.keys(passwords)) passwords[email] = db.passwords[email] ?? passwords[email]
      Object.assign(db, fresh, { sessions, passwords })
    })
  }

  saveUpload(name: string, body: Buffer, contentType: string) {
    return this.backend.saveUpload(name, body, contentType)
  }

  readUpload(name: string) {
    return this.backend.readUpload(name)
  }
}
