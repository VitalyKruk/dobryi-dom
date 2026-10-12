import type { NextFunction, Request, Response } from "express"
import { HttpError } from "./http-error.ts"
import { log } from "./logger.ts"

export { HttpError, parse } from "./http-error.ts"

// Express 5 сам передаёт ошибки из async-обработчиков сюда
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
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
  // Непредвиденная ошибка: в лог — стек и id запроса, пользователю — id, чтобы по нему найти запись
  const e2 = err instanceof Error ? err : new Error(String(err))
  log("error", "unhandled_error", { id: req.id, method: req.method, path: req.path, error: e2.message, stack: e2.stack })
  res.status(500).json({ error: "Что-то пошло не так на сервере. Попробуйте ещё раз.", requestId: req.id })
}
