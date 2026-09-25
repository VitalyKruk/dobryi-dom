/* Точка входа API: node server/index.ts (Node 24 сам снимает типы TypeScript) */
import path from "node:path"
import { createApp } from "./app.ts"
import { Store } from "./store.ts"

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST ?? "127.0.0.1"
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, "..", "data"))

const store = await new Store(DATA_DIR).init()
const server = createApp(store).listen(PORT, HOST, () => {
  console.log(`API «Добрый дом»: http://${HOST}:${PORT}/api  (данные: ${store.file})`)
})

// Корректная остановка в Docker: дописываем начатые запросы и выходим
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
