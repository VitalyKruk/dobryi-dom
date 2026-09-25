#!/usr/bin/env node
/*
 * Проверка проекта на уязвимости.
 *
 *   npm run security              — всё: зависимости, исходники, Docker-образ
 *   npm run security -- --quick   — без сборки и сканирования образа (быстро)
 *   npm run security -- --if-changed
 *                                 — пропустить, если файлы не менялись с последней успешной проверки
 *
 * Проверки:
 *   1. npm audit          — известные уязвимости в npm-зависимостях (high и critical)
 *   2. trivy fs           — уязвимости в package-lock.json, секреты в коде, ошибки в Dockerfile/compose
 *   3. trivy image        — уязвимости ОС и пакетов в образах dobryi-dom (сайт) и dobryi-dom-api (API)
 *
 * Trivy запускается в Docker, ставить его не нужно. Отчёты — в .security/.
 * Код выхода 1, если хоть одна проверка нашла проблемы уровня HIGH или CRITICAL.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const OUT = path.join(ROOT, ".security")
const TRIVY = "aquasec/trivy:0.74.0"
const IMAGES = ["dobryi-dom:latest", "dobryi-dom-api:latest"]
const SEVERITY = "HIGH,CRITICAL"
const STAMP = path.join(OUT, "last-success")

const args = new Set(process.argv.slice(2))
const quick = args.has("--quick")
const ifChanged = args.has("--if-changed")

mkdirSync(OUT, { recursive: true })

// Процесс мог стартовать до установки Docker Desktop (например, хук Claude Code) —
// тогда docker и docker-credential-desktop не видны в PATH. Добавляем известные каталоги.
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

function run(cmd, cmdArgs, { capture = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32" && cmd === "npm",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  return r
}

/** Отпечаток состояния проекта: HEAD + изменённые и новые файлы, без node_modules и отчётов */
function fingerprint() {
  const head = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim()
  const status = run("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true }).stdout
  const h = createHash("sha256").update(head).update(status)
  for (const line of status.split("\n").filter(Boolean)) {
    const file = path.join(ROOT, line.slice(3).replace(/^"|"$/g, ""))
    if (existsSync(file)) {
      try {
        h.update(readFileSync(file))
      } catch {
        // каталог или недоступный файл — хватит имени из git status
      }
    }
  }
  return h.update(quick ? "quick" : "full").digest("hex")
}

const current = fingerprint()
if (ifChanged && existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === current) {
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

const results = []

function step(name, fn) {
  console.log(`\n${bold("▶ " + name)}`)
  const started = Date.now()
  let status
  try {
    status = fn()
  } catch (e) {
    console.error(red(`  Не удалось запустить: ${e.message}`))
    status = "error"
  }
  results.push({ name, status, seconds: Math.round((Date.now() - started) / 1000) })
}

// 1. npm audit
step("npm audit — зависимости", () => {
  const r = run("npm", ["audit", "--json"], { capture: true })
  writeFileSync(path.join(OUT, "npm-audit.json"), r.stdout)
  const report = JSON.parse(r.stdout || "{}")
  const v = report.metadata?.vulnerabilities ?? {}
  console.log(
    `  critical: ${v.critical ?? 0}, high: ${v.high ?? 0}, moderate: ${v.moderate ?? 0}, low: ${v.low ?? 0}`,
  )
  for (const [name, info] of Object.entries(report.vulnerabilities ?? {})) {
    if (info.severity === "high" || info.severity === "critical") {
      const fix = info.fixAvailable ? "есть исправление: npm audit fix" : "исправления пока нет"
      console.log(red(`  ✘ ${name} (${info.severity}) — ${fix}`))
    }
  }
  return (v.critical ?? 0) + (v.high ?? 0) > 0 ? "fail" : "pass"
})

const hasDocker = dockerAvailable()
const trivyBase = ["run", "--rm", "-v", "dobryi-dom-trivy-cache:/root/.cache/"]

// 2. trivy fs
step("trivy fs — lock-файл, секреты, Dockerfile и compose", () => {
  if (!hasDocker) {
    console.log(yellow("  Docker не запущен — пропускаю."))
    return "skip"
  }
  const r = run("docker", [
    ...trivyBase,
    "-v", `${ROOT}:/src:ro`,
    TRIVY, "fs",
    "--scanners", "vuln,secret,misconfig",
    "--severity", SEVERITY,
    "--skip-dirs", "node_modules",
    "--skip-dirs", "dist",
    "--skip-dirs", ".security",
    "--skip-dirs", "data",
    "--exit-code", "1",
    "--quiet",
    "/src",
  ])
  return r.status === 0 ? "pass" : "fail"
})

// 3. trivy image
step(`trivy image — образы ${IMAGES.join(", ")}`, () => {
  if (quick) {
    console.log(yellow("  --quick: образ не собираю и не сканирую."))
    return "skip"
  }
  if (!hasDocker) {
    console.log(yellow("  Docker не запущен — пропускаю."))
    return "skip"
  }
  console.log("  Собираю образы…")
  const build = run("docker", ["compose", "build", "--quiet", "web", "api"])
  if (build.status !== 0) return "error"
  let failed = false
  for (const image of IMAGES) {
    console.log(`  Сканирую ${image}…`)
    const r = run("docker", [
      ...trivyBase,
      "-v", "/var/run/docker.sock:/var/run/docker.sock",
      TRIVY, "image",
      "--severity", SEVERITY,
      "--ignore-unfixed",
      "--exit-code", "1",
      "--quiet",
      image,
    ])
    if (r.status !== 0) failed = true
  }
  return failed ? "fail" : "pass"
})

// Итог
const icon = { pass: green("✔ чисто"), fail: red("✘ найдены проблемы"), skip: yellow("– пропущено"), error: red("✘ ошибка запуска") }
console.log(`\n${bold("Итог проверки на уязвимости")}`)
for (const r of results) console.log(`  ${icon[r.status]}  ${r.name} (${r.seconds} с)`)
console.log(`  Отчёты: ${path.relative(ROOT, OUT)}${path.sep}`)

const failed = results.some((r) => r.status === "fail" || r.status === "error")
if (!failed) writeFileSync(STAMP, current)
process.exit(failed ? 1 : 0)
