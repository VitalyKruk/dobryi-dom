#!/usr/bin/env node
/*
 * Все линтеры проекта одной командой.
 *
 *   npm run lint                 — проверить всё
 *   npm run lint -- --fix        — исправить, что можно, автоматически (oxlint, Prettier)
 *   npm run lint -- --if-changed — пропустить, если файлы не менялись с последней успешной проверки
 *
 * Линтеры:
 *   1. oxlint      — ошибки в TS/React-коде (.oxlintrc.json)
 *   2. Prettier    — единое форматирование (.prettierrc.json, .prettierignore)
 *   3. knip        — неиспользуемые файлы, экспорты и зависимости (knip.json)
 *   4. hadolint    — Dockerfile
 *   5. actionlint  — GitHub Actions, вместе с ShellCheck для run-шагов
 *
 * hadolint и actionlint запускаются в Docker, ставить их не нужно. Если Docker не запущен,
 * они пропускаются с предупреждением (в CI Docker есть всегда).
 * Код выхода 1, если хоть один линтер нашёл ошибки.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const HADOLINT = "hadolint/hadolint:v2.14.0"
const ACTIONLINT = "rhysd/actionlint:1.7.12"
const STAMP = path.join(ROOT, "node_modules", ".cache", "lint-last-success")

const args = new Set(process.argv.slice(2))
const fix = args.has("--fix")
const ifChanged = args.has("--if-changed")

// Процесс мог стартовать до установки Docker Desktop (например, хук) — добавляем его каталоги в PATH
if (process.platform === "win32") {
  const dirs = [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "DockerDesktop", "resources", "bin"),
    "C:\\Program Files\\Docker\\Docker\\resources\\bin",
  ].filter((d) => existsSync(path.join(d, "docker.exe")))
  if (dirs.length) process.env.PATH = [...dirs, process.env.PATH].join(path.delimiter)
}

const color = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const bold = (s) => color(1, s)
const green = (s) => color(32, s)
const red = (s) => color(31, s)
const yellow = (s) => color(33, s)

function run(cmd, cmdArgs, { capture = false, input } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    // на Windows npx — это npx.cmd, без shell он не запускается
    shell: process.platform === "win32" && cmd === "npx",
    stdio: capture ? ["pipe", "pipe", "pipe"] : [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    // Git Bash на Windows иначе переписывает пути вида /repo в C:/Program Files/Git/repo
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  return r
}

/** Отпечаток состояния проекта: HEAD + изменённые и новые файлы */
function fingerprint() {
  const git = (a) => run("git", a, { capture: true })
  const head = git(["rev-parse", "HEAD"])
  if (head.status !== 0) return null
  const status = git(["status", "--porcelain", "--untracked-files=all"]).stdout
  const h = createHash("sha256").update(head.stdout.trim()).update(status)
  for (const line of status.split("\n").filter(Boolean)) {
    const file = path.join(ROOT, line.slice(3).replace(/^"|"$/g, ""))
    try {
      if (existsSync(file)) h.update(readFileSync(file))
    } catch {
      // папка или файл недоступен — достаточно строки статуса
    }
  }
  return h.digest("hex")
}

const current = ifChanged ? fingerprint() : null
if (current && existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === current) {
  console.log(green("✔ Изменений с последней успешной проверки нет — пропускаю."))
  process.exit(0)
}

function dockerAvailable() {
  try {
    return run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true }).status === 0
  } catch {
    return false
  }
}
const docker = dockerAvailable()

const npx =
  (...a) =>
  () =>
    run("npx", ["--no-install", ...a]).status === 0
const checks = [
  { name: "oxlint — код TS/React", run: npx("oxlint", ...(fix ? ["--fix"] : [])) },
  { name: "Prettier — форматирование", run: npx("prettier", fix ? "--write" : "--check", "--log-level", "warn", ".") },
  { name: "knip — неиспользуемый код и зависимости", run: npx("knip", "--no-progress") },
  {
    name: "hadolint — Dockerfile",
    docker: true,
    run: () => run("docker", ["run", "--rm", "-i", HADOLINT], { input: readFileSync(path.join(ROOT, "Dockerfile"), "utf8") }).status === 0,
  },
  {
    name: "actionlint — GitHub Actions и ShellCheck",
    docker: true,
    run: () => run("docker", ["run", "--rm", "-v", `${ROOT}:/repo`, "-w", "/repo", ACTIONLINT, "-oneline"]).status === 0,
  },
]

const results = []
for (const c of checks) {
  console.log(`\n${bold(`▶ ${c.name}`)}`)
  const started = Date.now()
  let status
  if (c.docker && !docker) {
    console.log(yellow("Docker не запущен — пропускаю."))
    status = "skip"
  } else {
    try {
      status = c.run() ? "pass" : "fail"
    } catch (e) {
      console.error(red(String(e)))
      status = "error"
    }
  }
  results.push({ name: c.name, status, seconds: ((Date.now() - started) / 1000).toFixed(0) })
}

const icon = { pass: green("✔ чисто"), fail: red("✘ есть ошибки"), skip: yellow("– пропущено"), error: red("✘ ошибка запуска") }
console.log(`\n${bold("Итог линтеров")}`)
for (const r of results) console.log(`  ${icon[r.status]}  ${r.name} (${r.seconds} с)`)

const failed = results.some((r) => r.status === "fail" || r.status === "error")
if (failed && !fix) console.log(`  Часть ошибок исправит ${bold("npm run lint -- --fix")}`)
// Пропущенные проверки не засчитываем: с --if-changed они запустятся снова, когда появится Docker
if (current && !failed && !results.some((r) => r.status === "skip")) {
  mkdirSync(path.dirname(STAMP), { recursive: true })
  writeFileSync(STAMP, current)
}
process.exit(failed ? 1 : 0)
