import type { NextFunction, Request, Response } from "express"
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

// Express 5 сам передаёт ошибки из async-обработчиков сюда
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields })
    return
  }
  // Кривой JSON или слишком большое тело запроса от express.json()
  const e = err as { type?: string; status?: number }
  if (e.type === "entity.parse.failed") {
    res.status(400).json({ error: "Некорректный JSON в запросе" })
    return
  }
  if (e.type === "entity.too.large" || e.status === 413) {
    res.status(413).json({ error: "Слишком большой запрос" })
    return
  }
  // Прочие ошибки Express (например, 404 от express.static)
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) {
    res.status(e.status).json({ error: e.status === 404 ? "Не найдено" : "Некорректный запрос" })
    return
  }
  console.error(err)
  res.status(500).json({ error: "Что-то пошло не так на сервере. Попробуйте ещё раз." })
}
