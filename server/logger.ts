/*
 * Логи API — одна JSON-строка на событие в stdout (в Docker: docker compose logs api).
 * Такой формат читают и люди, и сборщики логов (Loki, ELK, CloudWatch) без настройки парсеров.
 *
 *   {"time":"…","level":"info","msg":"request","id":"…","method":"GET","path":"/api/pets","status":200,"ms":3}
 *
 * Уровень — переменная LOG_LEVEL: debug | info (по умолчанию) | warn | error | silent.
 * Персональные данные в логи не попадают: ни тел запросов, ни query-строк (там поиск по имени),
 * ни email, ни токенов — только метод, путь, статус, роль и id пользователя.
 */
import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const
export type Level = Exclude<keyof typeof LEVELS, "silent">

// Уровень читаем при каждом вызове — тесты и запуск могут менять LOG_LEVEL без перезагрузки модуля
const threshold = () => LEVELS[(process.env.LOG_LEVEL as keyof typeof LEVELS) ?? "info"] ?? LEVELS.info

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < threshold()) return
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })
  if (level === "error" || level === "warn") process.stderr.write(line + "\n")
  else process.stdout.write(line + "\n")
}

declare module "express-serve-static-core" {
  interface Request {
    /** id запроса — в логах и заголовке X-Request-Id, по нему ищут ошибку из сообщения пользователя */
    id?: string
  }
}

/** Лог каждого запроса к API после ответа: метод, путь, статус, длительность, кто спросил */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    req.id = randomUUID()
    res.setHeader("X-Request-Id", req.id)
    res.on("finish", () => {
      const ms = Number((process.hrtime.bigint() - started) / 1_000_000n)
      const status = res.statusCode
      // Проверка здоровья дёргается каждые 30 с — в обычном логе это шум
      const level: Level = status >= 500 ? "error" : req.path === "/api/health" ? "debug" : status >= 400 ? "warn" : "info"
      // user ставит authenticate (auth.ts) — здесь без импорта, чтобы логгер не тянул за собой хранилище
      const user = (req as Request & { user?: { id: string; role: string } }).user
      log(level, "request", {
        id: req.id,
        method: req.method,
        path: req.path,
        status,
        ms,
        role: user?.role ?? "guest",
        ...(user && { userId: user.id }),
      })
    })
    next()
  }
}
