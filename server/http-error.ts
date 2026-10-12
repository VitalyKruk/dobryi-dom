/* HttpError и parse — без зависимостей от Node и Express: их использует и статическая версия (src/lib/api-static.ts) */
import { z } from "zod"

/** Ошибка с HTTP-статусом и понятным пользователю сообщением */
export class HttpError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

/** Проверка входных данных: при ошибке — 400 с текстом по каждому полю */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const fields: Record<string, string> = {}
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_"
    fields[key] ??= issue.message
  }
  throw new HttpError(400, "Проверьте введённые данные", fields)
}
