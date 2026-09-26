#!/usr/bin/env node
/*
 * Статическая версия «Доброго дома» — без сервера, одной страницей:
 *
 *   npm run build:static
 *
 * 1. vite build --mode static: API подменяется на src/lib/api-static.ts (работает в браузере),
 *    код и стили — одним файлом, шрифты встроены.
 * 2. Фото питомцев скачиваются с Unsplash один раз (кеш в .static-cache/) и кладутся в
 *    dist-static/photos/ — страница не обращается к чужим доменам.
 * 3. dist-static/artifact.html — страница целиком с встроенными JS и CSS (для публикации
 *    как Artifact), рядом photos/. dist-static/index.html — то же, с обычной обёрткой <html>.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { missionPhoto, seedPets } from "../src/lib/seed.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const OUT = path.join(ROOT, "dist-static")
const CACHE = path.join(ROOT, ".static-cache", "photos")

// 1. Сборка
// vite запускаем через тот же node, без оболочки — аргументы не проходят через shell
const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js")
const build = spawnSync(process.execPath, [vite, "build", "--mode", "static"], { cwd: ROOT, stdio: "inherit" })
if (build.status !== 0) process.exit(build.status ?? 1)

// 2. Фото: у каждого питомца основной кадр и крупный план (тот же снимок, другое кадрирование)
mkdirSync(CACHE, { recursive: true })
mkdirSync(path.join(OUT, "photos"), { recursive: true })
const jobs = [
  ...seedPets.flatMap((p) =>
    p.photos.map((url, i) => {
      const id = /photo-([0-9a-f-]+)\?/.exec(url)?.[1]
      if (!id) throw new Error(`Неожиданный адрес фото у ${p.id}: ${url}`)
      return { url, file: `${id}${i > 0 ? "-zoom" : ""}.jpg` }
    }),
  ),
  { url: missionPhoto, file: "mission.jpg" },
]
let downloaded = 0
for (const { url, file } of jobs) {
  const cached = path.join(CACHE, file)
  if (!existsSync(cached)) {
    const res = await fetch(`${url}&w=960&h=720&fit=crop&fm=jpg&q=72`)
    if (!res.ok) throw new Error(`Не скачалось ${file}: HTTP ${res.status}`)
    const type = res.headers.get("content-type") ?? ""
    if (!type.startsWith("image/jpeg")) throw new Error(`${file}: ожидали JPEG, пришло ${type}`)
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
    downloaded++
  }
  copyFileSync(cached, path.join(OUT, "photos", file))
}
console.log(`Фото: ${jobs.length} (скачано сейчас: ${downloaded}, из кеша: ${jobs.length - downloaded})`)

// 3. Одна страница: JS и CSS внутри
const assets = readdirSync(path.join(OUT, "assets"))
const js = readFileSync(path.join(OUT, "assets", assets.find((f) => f.endsWith(".js"))), "utf8")
const css = readFileSync(path.join(OUT, "assets", assets.find((f) => f.endsWith(".css"))), "utf8")
// Закрывающий тег внутри кода оборвал бы встроенный блок
const safeJs = js.replaceAll("</script", "<\\/script")
const safeCss = css.replaceAll("</style", "<\\/style")

const body = `<div id="root"></div>
<script type="module">${safeJs}</script>`
const fragment = `<title>Добрый дом</title>
<meta name="description" content="Приют для кошек и собак: каталог, подбор питомца, заявки и кабинет сотрудника. Демо без сервера.">
<style>${safeCss}</style>
${body}
`
writeFileSync(path.join(OUT, "artifact.html"), fragment)
writeFileSync(
  path.join(OUT, "index.html"),
  `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Добрый дом</title>
<style>${safeCss}</style>
</head>
<body>
${body}
</body>
</html>
`,
)
rmSync(path.join(OUT, "assets"), { recursive: true, force: true })

const kb = (f) => Math.round(readFileSync(path.join(OUT, f)).length / 1024)
console.log(`Готово: dist-static/artifact.html (${kb("artifact.html")} КБ) и dist-static/photos/`)
