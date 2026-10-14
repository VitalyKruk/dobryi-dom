#!/usr/bin/env node
/*
 * Журнал промптов: хук Claude Code (UserPromptSubmit в .claude/settings.json) дописывает
 * каждый отправленный промпт в PROMPTS.txt в корне проекта — тем же форматом, что уже в файле:
 * номер по порядку, дата и время (UTC), текст как есть. Счётчик «Всего: …» в шапке обновляется.
 * Ответы на вопросы с вариантами (AskUserQuestion) пишет тот же скрипт из хука PostToolUse —
 * записью «Ответ на вопрос»: вопрос в кавычках, под ним «→ ответ».
 *
 * Файл лежит в git, поэтому:
 *   — секреты (токены, ключи, пароли, пароли в адресах подключения) заменяются на *** (scripts/redact.mjs);
 *   — служебные сообщения приложения (<task-notification>…</task-notification> и подобные) не пишутся:
 *     это не промпты пользователя, и в них бывают локальные пути.
 *
 * Хук никогда не мешает работе: любая ошибка — выход с кодом 0 без записи.
 * Проверить вручную:  echo {"prompt":"тест"} | node scripts/log-prompt.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { redact } from "./redact.mjs"

const FILE = path.join(path.resolve(import.meta.dirname, ".."), "PROMPTS.txt")
const RULE = "-".repeat(72)

const HEADER = `Промпты проекта «Добрый дом»
============================

Все запросы к Claude Code в этом проекте по порядку, текст — как был написан.
«Ответ на вопрос» — выбор из вариантов, которые предлагал Claude.
Всего: 0 промптов и 0 ответов на вопросы.
`

function plural(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

const pad = (n) => String(n).padStart(2, "0")
function stamp(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Пары «вопрос → ответ» из AskUserQuestion: ответы — объект { вопрос: ответ } или текст "вопрос"="ответ", … */
function questionAnswers(data) {
  for (const src of [data.tool_response, data.tool_input]) {
    const answers = src && typeof src === "object" ? src.answers : undefined
    if (answers && typeof answers === "object") return Object.entries(answers)
  }
  const text = typeof data.tool_response === "string" ? data.tool_response : JSON.stringify(data.tool_response ?? "")
  return [...text.matchAll(/"((?:[^"\\]|\\.)+)"="((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]])
}

try {
  let input = ""
  for await (const chunk of process.stdin) input += chunk
  const data = JSON.parse(input || "{}")
  const isAnswer = data.tool_name === "AskUserQuestion"
  const prompt = isAnswer
    ? questionAnswers(data)
        .map(([q, a]) => `"${String(q).trim()}"\n→ "${String(a).trim()}"`)
        .join("\n\n")
    : String(data.prompt ?? "").trim()
  if (!prompt) process.exit(0)
  // Служебное сообщение приложения — весь текст в одном теге вида <task-notification>…</task-notification>
  if (/^<([a-z][\w-]*)>[\s\S]*<\/\1>$/.test(prompt)) process.exit(0)
  // at — только для ручной дозаписи старых промптов; хук его не передаёт, берём текущее время
  const when = data.at && !Number.isNaN(Date.parse(data.at)) ? new Date(data.at) : new Date()

  // Файл хранится с LF (см. .gitattributes); BOM в начале — чтобы Блокнот узнал UTF-8
  let text = existsSync(FILE) ? readFileSync(FILE, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n") : HEADER
  const headings = [...text.matchAll(/^(\d+)\. (Ответ на вопрос — )?\d{4}-\d{2}-\d{2} /gm)]
  const next = headings.reduce((max, m) => Math.max(max, Number(m[1])), 0) + 1

  const title = `${next}. ${isAnswer ? "Ответ на вопрос — " : ""}${stamp(when)}`
  text = `${text.trimEnd()}\n\n${RULE}\n${title}\n${RULE}\n\n${redact(prompt).replace(/[ \t]+$/gm, "")}\n`

  const answers = headings.filter((m) => m[2]).length + (isAnswer ? 1 : 0)
  const prompts = headings.length + 1 - answers
  text = text.replace(
    /^Всего: .*$/m,
    `Всего: ${prompts} ${plural(prompts, ["промпт", "промпта", "промптов"])} и ${answers} ${plural(answers, ["ответ", "ответа", "ответов"])} на вопросы.`,
  )
  writeFileSync(FILE, "﻿" + text)
} catch {
  // журнал — вспомогательная функция: не записали, но и промпт не блокируем
}
process.exit(0)
