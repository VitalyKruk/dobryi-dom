#!/usr/bin/env node
/*
 * Stop-хук Claude Code: после хода, в котором менялись файлы, запускает линтеры (scripts/lint.mjs).
 *
 *   — ничего не менялось или всё чисто → тихо выходит (код 0);
 *   — есть ошибки → печатает их в stderr и выходит с кодом 2:
 *     Claude Code не завершает ход и передаёт вывод Claude, чтобы тот исправил;
 *   — если ход уже был продлён этим хуком (stop_hook_active), второй раз не блокирует,
 *     а показывает предупреждение пользователю — чтобы не зациклиться.
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")

let input = {}
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}")
} catch {
  // хук могли вызвать вручную без stdin
}

const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "lint.mjs"), "--if-changed"], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})

if (r.status === 0) process.exit(0)

// Последние строки вывода: находки линтеров и итог. Предупреждения oxlint и служебные строки npx
// убираем — это не ошибки, а их много
const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
  .trim()
  .split(/\r?\n/)
  .filter((l) => !/: warning |^npm notice/.test(l))
const summaryAt = out.findIndex((l) => l.includes("Итог линтеров"))
const summary = summaryAt >= 0 ? out.slice(summaryAt) : out.slice(-10)
const report = ["Линтеры (npm run lint) нашли ошибки после изменений:", ...out.slice(-80)].join("\n")

if (input.stop_hook_active) {
  console.log(JSON.stringify({ systemMessage: `⚠ Ошибки линтеров всё ещё не исправлены.\n${summary.join("\n")}` }))
  process.exit(0)
}

console.error(report)
process.exit(2)
