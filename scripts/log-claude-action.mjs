#!/usr/bin/env node
/*
 * Журнал действий Claude Code в этом проекте: хук PostToolUse (.claude/settings.json) после каждой
 * команды и правки файла дописывает строку в logs/claude-actions.log:
 *
 *   2026-10-12 12:30:05 UTC  a1b2c3d4  Bash        npm run test:api
 *   2026-10-12 12:30:41 UTC  a1b2c3d4  Edit        src/lib/api.ts
 *
 * Вторая колонка — начало id сессии: видно, какая сессия что делала, если их несколько.
 * Похожее на секреты (токены, пароли, ключи) в командах заменяется на ***.
 * Файл не попадает в git (.gitignore) — в командах бывают пути и данные, которым не место в репозитории.
 * Больше 5 МБ — старый журнал переименовывается в claude-actions.log.1.
 *
 * Хук никогда не мешает работе: любая ошибка — выход с кодом 0 без записи.
 * Проверить вручную:  echo {"tool_name":"Bash","tool_input":{"command":"ls"}} | node scripts/log-claude-action.mjs
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const DIR = path.join(ROOT, "logs")
const FILE = path.join(DIR, "claude-actions.log")
const MAX_BYTES = 5 * 1024 * 1024

const pad = (n) => String(n).padStart(2, "0")
const stamp = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`

/** Токены, пароли и ключи в командах — на *** */
function redact(s) {
  return s
    .replace(/\b(Bearer|token|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***")
    .replace(/\b(gh[pousr]_|github_pat_|sk-|xox[abp]-)[A-Za-z0-9_-]{8,}/g, "$1***")
    .replace(/((?:password|passwd|secret|api[_-]?key|token)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1***")
}

/** Путь файла — относительно проекта, если он внутри */
function rel(p) {
  if (!p) return ""
  const r = path.relative(ROOT, p)
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.split(path.sep).join("/") : p
}

function describe(tool, input) {
  switch (tool) {
    case "Bash":
    case "PowerShell": {
      const cmd = String(input.command ?? "")
        .replace(/\s+/g, " ")
        .trim()
      return redact(cmd.length > 300 ? `${cmd.slice(0, 300)}…` : cmd)
    }
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return rel(input.file_path ?? input.notebook_path)
    default:
      return ""
  }
}

try {
  let raw = ""
  for await (const chunk of process.stdin) raw += chunk
  const data = JSON.parse(raw || "{}")
  const tool = String(data.tool_name ?? "")
  const what = describe(tool, data.tool_input ?? {})
  if (tool && what) {
    mkdirSync(DIR, { recursive: true })
    if (existsSync(FILE) && statSync(FILE).size > MAX_BYTES) renameSync(FILE, `${FILE}.1`)
    const session = String(data.session_id ?? "").slice(0, 8) || "--------"
    appendFileSync(FILE, `${stamp(new Date())}  ${session}  ${tool.padEnd(10)}  ${what}\n`)
  }
} catch {
  // журнал — вспомогательная функция: не записали, но работу не останавливаем
}
process.exit(0)
