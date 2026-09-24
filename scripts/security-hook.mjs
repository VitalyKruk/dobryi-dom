#!/usr/bin/env node
/*
 * Stop-хук Claude Code: после хода, в котором менялись файлы, запускает проверку на уязвимости.
 *
 *   — ничего не менялось или всё чисто → тихо выходит (код 0);
 *   — найдены проблемы → печатает итог в stderr и выходит с кодом 2:
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

const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "security-scan.mjs"), "--if-changed"], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})

if (r.status === 0) process.exit(0)

// Итог + строки с находками, без многостраничных таблиц Trivy
const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
const lines = out.split(/\r?\n/)
const summaryAt = lines.findIndex((l) => l.includes("Итог проверки"))
const findings = lines.filter((l) => /✘|CVE-|GHSA-|DS-\d+|AVD-|HIGH|CRITICAL/.test(l)).slice(0, 40)
const summary = summaryAt >= 0 ? lines.slice(summaryAt) : lines.slice(-20)
const report = [
  "Проверка на уязвимости (npm run security) нашла проблемы после изменений:",
  ...findings,
  "",
  ...summary,
  "Подробности: npm run security; отчёты — в .security/.",
].join("\n")

if (input.stop_hook_active) {
  console.log(JSON.stringify({ systemMessage: `⚠ Уязвимости всё ещё не устранены.\n${summary.join("\n")}` }))
  process.exit(0)
}

console.error(report)
process.exit(2)
