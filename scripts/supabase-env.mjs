#!/usr/bin/env node
/*
 * Записывает в .env адрес и серверный ключ ЛОКАЛЬНОГО Supabase (npx supabase start):
 *
 *   npm run supabase:env
 *
 * Ключ локального Supabase — общий демо-ключ CLI, а не секрет; для облачного проекта
 * впишите свои значения в .env вручную (см. .env.example). Файл .env не попадает в git.
 * Остальные строки .env сохраняются как есть.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const ENV = path.join(ROOT, ".env")
// CLI из devDependencies — JS-обёртка над бинарником, запускаем тем же node без оболочки
const cli = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js")

const r = spawnSync(process.execPath, [cli, "status", "-o", "env"], { cwd: ROOT, encoding: "utf8" })
if (r.status !== 0) {
  console.error("Локальный Supabase не запущен. Сначала: npm run supabase:start")
  console.error(r.stderr || r.stdout)
  process.exit(1)
}
const status = Object.fromEntries(
  r.stdout
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const url = status.API_URL
const key = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY
if (!url || !key) {
  console.error("Не нашёл API_URL и SERVICE_ROLE_KEY в выводе supabase status")
  process.exit(1)
}

const port = new URL(url).port || "54321"
const values = {
  SUPABASE_URL: url,
  // Из контейнеров Docker локальный Supabase виден по host.docker.internal, а не по 127.0.0.1
  SUPABASE_DOCKER_URL: `http://host.docker.internal:${port}`,
  SUPABASE_SERVICE_ROLE_KEY: key,
}

const lines = existsSync(ENV) ? readFileSync(ENV, "utf8").split(/\r?\n/) : []
for (const [k, v] of Object.entries(values)) {
  const i = lines.findIndex((l) => l.startsWith(`${k}=`))
  if (i >= 0) lines[i] = `${k}=${v}`
  else lines.push(`${k}=${v}`)
}
writeFileSync(ENV, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n")
console.log(`Записал в .env: SUPABASE_URL=${url}, SUPABASE_DOCKER_URL=${values.SUPABASE_DOCKER_URL}, SUPABASE_SERVICE_ROLE_KEY=…`)
