/*
 * Пароли — scrypt с солью, сессии — случайные токены в хранилище.
 * Права проверяются здесь, на сервере: скрытая в интерфейсе кнопка не защищает API.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import type { Role, User } from "../src/lib/types.ts"
import { HttpError } from "./errors.ts"
import type { Store } from "./store.ts"

const KEY_LEN = 32

function scryptAsync(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt)
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string | undefined) {
  if (!stored) {
    // Считаем хеш и для несуществующего пользователя — время ответа не выдаёт, есть ли такой email
    await scryptAsync(password, randomBytes(16))
    return false
  }
  const [, saltHex, keyHex] = stored.split("$")
  const key = await scryptAsync(password, Buffer.from(saltHex, "hex"))
  const expected = Buffer.from(keyHex, "hex")
  return expected.length === key.length && timingSafeEqual(expected, key)
}

export const newToken = () => randomBytes(32).toString("base64url")
/** В хранилище лежит только хеш токена: утёкший db.json не даёт войти под чужой сессией */
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex")

/** Матрица доступа — та же, что в src/context/auth.tsx (PROMPT.md, раздел 5) */
export type Permission =
  | "admin.access"
  | "pets.status"
  | "pets.edit"
  | "applications.view"
  | "applications.status"
  | "volunteers.manage"
  | "users.manage"

const permissions: Record<Role, Permission[]> = {
  user: [],
  volunteer: ["admin.access", "pets.status", "applications.view"],
  admin: [
    "admin.access",
    "pets.status",
    "pets.edit",
    "applications.view",
    "applications.status",
    "volunteers.manage",
    "users.manage",
  ],
}

export const can = (user: User | undefined, p: Permission) => !!user && permissions[user.role].includes(p)

declare module "express-serve-static-core" {
  interface Request {
    user?: User
    token?: string
  }
}

/** Достаёт пользователя по токену Bearer; без токена запрос идёт как гостевой */
export function authenticate(store: Store) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    if (token) {
      const hashed = hashToken(token)
      const session = store.db.sessions.find((s) => s.token === hashed)
      const user = session && store.db.users.find((u) => u.id === session.userId)
      if (user) {
        req.user = user
        req.token = token
      }
    }
    next()
  }
}

export function requireUser(req: Request) {
  if (!req.user) throw new HttpError(401, "Войдите, чтобы продолжить")
  return req.user
}

export function requirePermission(req: Request, p: Permission) {
  const user = requireUser(req)
  if (!can(user, p)) throw new HttpError(403, "Недостаточно прав для этого действия")
  return user
}
