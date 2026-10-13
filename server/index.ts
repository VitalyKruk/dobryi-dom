/* Точка входа API: node server/index.ts (Node 24 сам снимает типы TypeScript) */
import path from "node:path"
import { createApp } from "./app.ts"
import { log } from "./logger.ts"
import { JsonBackend, Store } from "./store.ts"
import { postgresFromEnv } from "./postgres.ts"

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST ?? "127.0.0.1"
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, "..", "data"))

// Postgres, если задан DATABASE_URL, иначе — JSON-файл в DATA_DIR.
// При первом запуске на пустой базе переносим туда данные и фото из db.json, если он есть.
const json = new JsonBackend(DATA_DIR)
const postgres = postgresFromEnv()
const store = await (postgres ? new Store(postgres, json) : new Store(json)).init()
const server = createApp(store).listen(PORT, HOST, () => {
  log("info", "started", { url: `http://${HOST}:${PORT}/api`, storage: postgres ? "postgres" : "json", data: store.location, source: store.source, pid: process.pid })
})

// Падение процесса — последнее, что стоит записать в лог перед выходом
process.on("uncaughtException", (err) => {
  log("error", "uncaught_exception", { error: err.message, stack: err.stack })
  process.exit(1)
})

// Корректная остановка в Docker: дописываем начатые запросы и выходим
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("info", "stopping", { signal })
    server.close(() => process.exit(0))
  })
}
