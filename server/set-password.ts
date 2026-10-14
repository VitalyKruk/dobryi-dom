/*
 * Новые случайные пароли для аккаунтов — для прода, где общий демо-пароль не принимается (DEMO_LOGIN=0).
 *
 *   docker compose stop api
 *   docker compose run --rm --no-deps api node server/set-password.ts olga@dobryi-dom.ru ivan@dobryi-dom.ru
 *   docker compose start api
 *
 * API на это время останавливают: он держит данные в памяти и при следующей записи вернул бы старые пароли.
 * Пароли печатаются в stdout строками «email пароль», открытые сессии этих пользователей закрываются.
 */
import { randomBytes } from "node:crypto"
import path from "node:path"
import { hashPassword } from "./auth.ts"
import { postgresFromEnv } from "./postgres.ts"
import { JsonBackend, Store } from "./store.ts"

const emails = process.argv.slice(2).map((e) => e.toLowerCase())
if (!emails.length) {
  console.error("Укажите email: node server/set-password.ts <email>…")
  process.exit(2)
}

// То же хранилище, что у API (server/index.ts): Postgres, если задан DATABASE_URL, иначе JSON в DATA_DIR
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, "..", "data"))
const json = new JsonBackend(DATA_DIR)
const postgres = postgresFromEnv()
const store = await (postgres ? new Store(postgres, json) : new Store(json)).init()

const users = store.db.users.filter((u) => emails.includes(u.email.toLowerCase()))
const missing = emails.filter((e) => !users.some((u) => u.email.toLowerCase() === e))
if (missing.length) {
  console.error(`Нет пользователей: ${missing.join(", ")}`)
  await postgres?.close()
  process.exit(1)
}

const lines: string[] = []
await store.write(async (d) => {
  for (const u of users) {
    const password = randomBytes(18).toString("base64url")
    d.passwords[u.email] = await hashPassword(password)
    lines.push(`${u.email} ${password}`)
  }
  d.sessions = d.sessions.filter((s) => !users.some((u) => u.id === s.userId))
})
await postgres?.close()
console.log(lines.join("\n"))
