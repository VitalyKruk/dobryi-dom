#!/usr/bin/env node
/*
 * npm run dev — API (server/, с автоперезапуском) и Vite одновременно.
 * Аргументы передаются Vite: npm run dev -- --host 0.0.0.0
 */
import { spawn } from "node:child_process"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js")

const children = [
  spawn(process.execPath, ["--watch", "server/index.ts"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [viteBin, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" }),
]

// Упал один — останавливаем второй, чтобы не остался «полуживой» dev-сервер
const stop = (code = 0) => {
  for (const c of children) if (c.exitCode === null) c.kill()
  process.exit(code)
}
for (const c of children) c.on("exit", (code) => stop(code ?? 1))
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0))
