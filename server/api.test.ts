/* Интеграционные тесты API: npm run test:api (node:test, сервер на временной папке данных) */
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import { createApp } from "./app.ts"

// Логи запросов в выводе тестов только мешают; LOG_LEVEL=info npm run test:api — чтобы увидеть
process.env.LOG_LEVEL ??= "silent"
import { JsonBackend, seedDb, Store, type Backend } from "./store.ts"
import { PostgresBackend } from "./postgres.ts"
import { testDatabaseUrl } from "./test-db.ts"
import { hashPassword, verifyPassword } from "./auth.ts"
import { RateLimit, trustProxySetting } from "./rate-limit.ts"

let base = ""
let dir = ""
let close: () => void
/** Новый экземпляр того же хранилища — читает сохранённое, а не память API */
let freshBackend: () => Backend
/** Пулы соединений Postgres, открытые тестами, — закрываем в конце, иначе процесс не завершится */
const pools: PostgresBackend[] = []

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "dobryi-dom-test-"))
  // TEST_STORAGE=postgres (npm run test:postgres) — тот же набор тестов на Postgres
  const url = process.env.TEST_STORAGE === "postgres" ? await testDatabaseUrl() : null
  if (process.env.TEST_STORAGE === "postgres" && !url) throw new Error("TEST_STORAGE=postgres, но в окружении нет TEST_DATABASE_URL")
  const postgres = url ? new PostgresBackend(url) : null
  if (postgres) pools.push(postgres)
  const store = await new Store(postgres ?? dir).init()
  if (postgres) await store.reset() // чистые демо-данные, как в новой папке
  freshBackend = () => {
    if (!postgres) return new JsonBackend(dir)
    const b = new PostgresBackend(url!)
    pools.push(b)
    return b
  }
  const server = createApp(store).listen(0, "127.0.0.1")
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})

after(async () => {
  await Promise.all(pools.map((p) => p.close()))
  close()
  await rm(dir, { recursive: true, force: true })
})

async function api(method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Uint8Array ? new Blob([body as Uint8Array<ArrayBuffer>]) : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null, requestId: res.headers.get("x-request-id"), headers: res.headers }
}

const login = async (email: string) => (await api("POST", "/api/auth/login", { email, password: "demo1234" })).json.token as string

const application = {
  petId: "mandarin",
  name: "Тест Тестов",
  phone: "+7 (900) 000-00-00",
  email: "tester@example.com",
  city: "Санкт-Петербург",
  housing: "apartment",
  hasOtherPets: false,
  experience: "some",
  preferredTime: "weekend",
}

describe("питомцы", () => {
  test("фильтры и пагинация", async () => {
    const r = await api("GET", "/api/pets?species=cat&age=baby")
    assert.equal(r.status, 200)
    assert.ok(r.json.total > 0)
    assert.ok(r.json.items.every((p: { species: string }) => p.species === "cat"))
    const page = await api("GET", "/api/pets?pageSize=5&page=2")
    assert.equal(page.json.items.length, 5)
  })

  test("внутренние заметки не уходят гостю, но видны персоналу", async () => {
    const guest = await api("GET", "/api/pets/graf")
    assert.equal(guest.json.internalNotes, undefined)
    const staff = await api("GET", "/api/pets/graf", undefined, await login("ivan@dobryi-dom.ru"))
    assert.ok(staff.json.internalNotes)
  })

  test("несуществующий питомец — 404", async () => {
    assert.equal((await api("GET", "/api/pets/no-such-pet")).status, 404)
  })
})

describe("заявки", () => {
  test("невалидная заявка — 400 с ошибками по полям", async () => {
    const r = await api("POST", "/api/applications", { petId: "mandarin", name: "И", phone: "1", email: "bad" })
    assert.equal(r.status, 400)
    assert.equal(r.json.fields.phone, "Кажется, в номере не хватает цифр")
    assert.ok(r.json.fields.email)
  })

  test("гость подаёт заявку, повтор на того же питомца — 409", async () => {
    const r = await api("POST", "/api/applications", application)
    assert.equal(r.status, 201)
    assert.match(r.json.id, /^A-\d+$/)
    assert.equal(r.json.status, "pending")
    const dup = await api("POST", "/api/applications", { ...application, email: "TESTER@example.com" })
    assert.equal(dup.status, 409)
  })

  test("заявка сохраняется в хранилище", async () => {
    const db = (await freshBackend().load())!
    assert.ok(db.applications.some((a: { email: string }) => a.email === "tester@example.com"))
  })

  test("пользователь видит только свои заявки, персонал — все", async () => {
    const mine = await api("GET", "/api/applications", undefined, await login("anna@example.com"))
    assert.ok(mine.json.length > 0)
    assert.ok(mine.json.every((a: { email: string }) => a.email === "anna@example.com"))
    const all = await api("GET", "/api/applications", undefined, await login("olga@dobryi-dom.ru"))
    assert.ok(all.json.length > mine.json.length)
    assert.equal((await api("GET", "/api/applications")).status, 401)
  })

  test("одобрение бронирует питомца; волонтёр не может менять статус", async () => {
    const created = await api("POST", "/api/applications", { ...application, petId: "sima", email: "sima@example.com" })
    const volunteer = await api(
      "PATCH",
      `/api/applications/${created.json.id}/status`,
      { status: "approved" },
      await login("ivan@dobryi-dom.ru"),
    )
    assert.equal(volunteer.status, 403)
    const admin = await api(
      "PATCH",
      `/api/applications/${created.json.id}/status`,
      { status: "approved" },
      await login("olga@dobryi-dom.ru"),
    )
    assert.equal(admin.status, 200)
    assert.ok(admin.json.decidedAt, "решение датируется — для аналитики")
    assert.equal((await api("GET", "/api/pets/sima")).json.status, "reserved")
  })

  test("отозвать можно только свою заявку", async () => {
    const anna = await login("anna@example.com")
    type App = { id: string; name: string; status: string; petId: string }
    const own = (await api("GET", "/api/applications", undefined, anna)).json as App[]
    const pending = own.find((x) => x.status === "pending")!
    assert.equal((await api("POST", `/api/applications/${pending.id}/cancel`, undefined, anna)).json.status, "cancelled")
    const all = (await api("GET", "/api/applications", undefined, await login("olga@dobryi-dom.ru"))).json as App[]
    const foreign = all.find((x) => x.name === "Дмитрий Орлов")!
    assert.equal((await api("POST", `/api/applications/${foreign.id}/cancel`, undefined, anna)).status, 404)
    const decided = own.find((x) => x.status === "approved")!
    assert.equal((await api("POST", `/api/applications/${decided.id}/cancel`, undefined, anna)).status, 409)
  })
})

describe("аналитика и подбор", () => {
  test("история заявок за три месяца, аналитика — только персоналу", async () => {
    const olga = await login("olga@dobryi-dom.ru")
    assert.ok((await api("GET", "/api/applications", undefined, olga)).json.length >= 60)
    assert.equal((await api("GET", "/api/admin/analytics")).status, 401)
    assert.equal((await api("GET", "/api/admin/analytics", undefined, await login("anna@example.com"))).status, 403)
    const r = await api("GET", "/api/admin/analytics", undefined, await login("ivan@dobryi-dom.ru"))
    assert.equal(r.status, 200)
    assert.equal(r.json.weeks.length, 12)
    const total = r.json.weeks.reduce((sum: number, w: { total: number }) => sum + w.total, 0)
    assert.equal(total, r.json.totals.applications)
    assert.ok(r.json.totals.adopted >= 1 && r.json.totals.avgDaysToHome > 0)
    assert.ok(r.json.rejectReasons.length > 0 && r.json.insights.length > 0)
  })

  test("данные для инвесторов: публичные, сходятся с дашбордом и без персональных данных", async () => {
    const r = await api("GET", "/api/investors")
    assert.equal(r.status, 200)
    const dash = (await api("GET", "/api/admin/analytics", undefined, await login("olga@dobryi-dom.ru"))).json
    assert.deepEqual(r.json.totals, dash.totals)
    assert.deepEqual(r.json.funnel, dash.funnel)
    const stats = (await api("GET", "/api/stats")).json
    assert.equal(r.json.adoptedBeforeSite + r.json.pets.adoptedOnSite, stats.adopted)
    assert.equal(r.json.pets.waiting, stats.waiting)
    assert.equal(r.json.volunteers, stats.volunteers)
    const raw = JSON.stringify(r.json)
    for (const leak of ["@", "+7", "Анна", "rejectReasons", "insights", "staffComments"])
      assert.ok(!raw.includes(leak), `в ответе есть «${leak}»`)
    assert.deepEqual((await api("GET", "/api/investors", undefined, undefined, { "x-demo": "empty" })).json.pets.waiting, 0)
  })

  test("подбор по анкете: не предлагает тех, кто не ладит с детьми и кошками", async () => {
    const r = await api("GET", "/api/recommendations?housing=apartment&kids=yes&other=cat&experience=none&limit=12")
    assert.equal(r.status, 200)
    assert.ok(r.json.items.length > 0)
    for (const m of r.json.items) {
      assert.notEqual(m.pet.goodWithKids, "no")
      assert.notEqual(m.pet.goodWithCats, "no")
      assert.equal(m.pet.status, "available")
      assert.ok(m.score >= 35 && m.score <= 98 && Array.isArray(m.reasons))
    }
    assert.ok(r.json.items.every((m: { score: number }, i: number, a: { score: number }[]) => i === 0 || a[i - 1].score >= m.score))
  })

  test("подбор для вошедшего — по его анкете и избранному, без уже знакомых питомцев", async () => {
    const anna = await login("anna@example.com")
    const r = await api("GET", "/api/recommendations", undefined, anna)
    assert.ok(r.json.basedOn.includes("избранному"))
    const ids = r.json.items.map((m: { pet: { id: string } }) => m.pet.id)
    for (const known of ["persik", "richi", "musya", "vasilisa"]) assert.ok(!ids.includes(known))
    assert.equal((await api("GET", "/api/recommendations?kids=maybe")).status, 400)
    assert.deepEqual((await api("GET", "/api/recommendations")).json.items, [], "гостю без анкеты подбирать не по чему")
  })
})

describe("вход и профиль", () => {
  test("неверный пароль — 401, верный — токен", async () => {
    assert.equal((await api("POST", "/api/auth/login", { email: "anna@example.com", password: "wrong" })).status, 401)
    const token = await login("anna@example.com")
    assert.equal((await api("GET", "/api/me", undefined, token)).json.email, "anna@example.com")
  })

  test("регистрация, занятый email — 409, выход аннулирует токен", async () => {
    const r = await api("POST", "/api/auth/register", { name: "Новый", email: "new@example.com", password: "password1" })
    assert.equal(r.status, 201)
    assert.equal((await api("POST", "/api/auth/register", { name: "Ещё", email: "NEW@example.com", password: "password1" })).status, 409)
    await api("POST", "/api/auth/logout", undefined, r.json.token)
    assert.equal((await api("GET", "/api/me", undefined, r.json.token)).status, 401)
  })

  test("пароли в хранилище — только хеши", async () => {
    const db = (await freshBackend().load())!
    assert.ok(Object.values(db.passwords).every((h) => String(h).startsWith("scrypt$")))
    assert.ok(!JSON.stringify(db).includes("demo1234"))
  })

  test("избранное сохраняется, несуществующие id отбрасываются", async () => {
    const token = await login("anna@example.com")
    const r = await api("PUT", "/api/me/favorites", { favorites: ["persik", "persik", "ghost"] }, token)
    assert.deepEqual(r.json.favorites, ["persik"])
  })
})

describe("питомцы в админке и загрузка фото", () => {
  // Минимальный валидный PNG 1×1
  const png = Uint8Array.from(
    Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082",
      "hex",
    ),
  )

  test("гость и волонтёр не могут загружать фото", async () => {
    const headers = { "content-type": "image/png" }
    assert.equal((await api("POST", "/api/uploads", png, undefined, headers)).status, 401)
    assert.equal((await api("POST", "/api/uploads", png, await login("ivan@dobryi-dom.ru"), headers)).status, 403)
  })

  test("не-изображение с подменённым Content-Type — 415", async () => {
    const fake = new TextEncoder().encode("<script>alert(1)</script>")
    const r = await api("POST", "/api/uploads", fake, await login("olga@dobryi-dom.ru"), { "content-type": "image/png" })
    assert.equal(r.status, 415)
  })

  test("админ загружает фото и создаёт питомца", async () => {
    const admin = await login("olga@dobryi-dom.ru")
    const up = await api("POST", "/api/uploads", png, admin, { "content-type": "image/png" })
    assert.equal(up.status, 201)
    assert.match(up.json.url, /^\/uploads\/[a-f0-9]{32}\.png$/)
    const file = await fetch(base + up.json.url)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get("x-content-type-options"), "nosniff")

    const pet = await api(
      "POST",
      "/api/pets",
      {
        name: "Пушок",
        species: "cat",
        sex: "male",
        birthDate: "2024-05-01",
        breed: "Беспородный",
        size: "medium",
        coat: "long",
        weightKg: 4.5,
        photos: [up.json.url],
        traits: ["Ласковый"],
        vaccinated: true,
        sterilized: true,
        chipped: false,
        goodWithKids: "yes",
        goodWithCats: "yes",
        goodWithDogs: "unknown",
        story: "Пушок пришёл сам и остался — теперь ищет свой дом.",
        careNotes: "",
        status: "available",
      },
      admin,
    )
    assert.equal(pet.status, 201)
    assert.equal(pet.json.id, "pushok")
    assert.equal((await api("GET", "/api/pets/pushok")).json.name, "Пушок")
  })

  test("некорректный статус — 400", async () => {
    const r = await api("PATCH", "/api/pets/pushok/status", { status: "nope" }, await login("olga@dobryi-dom.ru"))
    assert.equal(r.status, 400)
  })

  test("фото со стороннего адреса отклоняется", async () => {
    const admin = await login("olga@dobryi-dom.ru")
    const pet = (await api("GET", "/api/pets/pushok", undefined, admin)).json
    const { id: _id, addedAt: _added, ...body } = pet
    const r = await api("PUT", "/api/pets/pushok", { ...body, photos: ["https://evil.example/x.jpg"] }, admin)
    assert.equal(r.status, 400)
    assert.equal(r.json.fields["photos.0"], "Фото должно быть загружено через форму")
  })
})

describe("журнал действий и логи", () => {
  test("действия попадают в журнал, журнал — только администратору", async () => {
    const olga = await login("olga@dobryi-dom.ru")
    const created = await api("POST", "/api/applications", { ...application, petId: "zefir", email: "audit@example.com" })
    await api("PATCH", `/api/applications/${created.json.id}/status`, { status: "rejected" }, olga)
    await api("POST", "/api/auth/login", { email: "olga@dobryi-dom.ru", password: "не тот" })

    const r = await api("GET", "/api/admin/audit?pageSize=10", undefined, olga)
    assert.equal(r.status, 200)
    const actions = r.json.items.map((e: { action: string }) => e.action)
    assert.ok(actions.includes("application.status") && actions.includes("application.create") && actions.includes("auth.login_failed"))
    const failed = r.json.items.find((e: { action: string }) => e.action === "auth.login_failed")
    assert.equal(failed.details, "o***@dobryi-dom.ru", "email в журнале маскируется")
    const decision = r.json.items.find((e: { action: string }) => e.action === "application.status")
    assert.equal(decision.actor.name, "Ольга Васильева")
    assert.ok(r.json.total > 100, "стартовая история из демо-данных")

    const apps = await api("GET", "/api/admin/audit?group=application&q=" + encodeURIComponent(created.json.id), undefined, olga)
    assert.ok(apps.json.items.length >= 2 && apps.json.items.every((e: { action: string }) => e.action.startsWith("application.")))
    assert.equal((await api("GET", "/api/admin/audit", undefined, await login("ivan@dobryi-dom.ru"))).status, 403)
    assert.equal((await api("GET", "/api/admin/audit?group=nope", undefined, olga)).status, 400)
  })

  test("ошибки из браузера принимаются, query-строка и мусор — нет", async () => {
    const ok = await api("POST", "/api/client-errors", { kind: "error", message: "TypeError: x is undefined", page: "/catalog" })
    assert.equal(ok.status, 204)
    assert.equal((await api("POST", "/api/client-errors", { kind: "error", message: "x", page: "/catalog?q=Анна" })).status, 400)
    assert.equal((await api("POST", "/api/client-errors", { kind: "hack", message: "x" })).status, 400)
  })

  test("у каждого ответа есть X-Request-Id", async () => {
    const r = await api("GET", "/api/pets/count")
    assert.match(r.requestId ?? "", /^[0-9a-f-]{36}$/)
  })
})

describe("фейкдоры", () => {
  test("переходы по кнопкам в разработке считаются и видны только администратору", async () => {
    assert.equal((await api("POST", "/api/fake-doors", { feature: "donate" })).status, 204)
    assert.equal((await api("POST", "/api/fake-doors", { feature: "donate" })).status, 204)
    assert.equal((await api("POST", "/api/fake-doors", { feature: "vk" }, await login("anna@example.com"))).status, 204)
    assert.equal((await api("POST", "/api/fake-doors", { feature: "tiktok" })).status, 400)

    const r = await api("GET", "/api/admin/fake-doors", undefined, await login("svetlana@dobryi-dom.ru"))
    assert.equal(r.status, 200)
    const by = Object.fromEntries(r.json.map((x: { feature: string; count: number }) => [x.feature, x.count]))
    assert.deepEqual(by, { donate: 2, vk: 1, telegram: 0, youtube: 0 })
    assert.equal(r.json[0].feature, "donate", "больше переходов — выше")
    assert.ok(r.json[0].lastAt)

    assert.equal((await api("GET", "/api/admin/fake-doors", undefined, await login("ivan@dobryi-dom.ru"))).status, 403)
    assert.equal((await api("GET", "/api/admin/fake-doors")).status, 401)
  })
})

describe("миграция базы", () => {
  test("демо-аккаунт, которого нет в старом db.json, добавляется при запуске", async () => {
    const old = await mkdtemp(path.join(tmpdir(), "dobryi-dom-migrate-"))
    try {
      const db = await seedDb()
      db.users = db.users.filter((u) => u.id !== "u-svetlana")
      delete db.passwords["svetlana@dobryi-dom.ru"]
      await writeFile(path.join(old, "db.json"), JSON.stringify(db))
      const store = await new Store(old).init()
      assert.ok(store.db.users.some((u) => u.email === "svetlana@dobryi-dom.ru"))
      assert.ok(await verifyPassword("demo1234", store.db.passwords["svetlana@dobryi-dom.ru"]))
      assert.equal(store.db.users.filter((u) => u.email === "olga@dobryi-dom.ru").length, 1, "существующие не дублируются")
    } finally {
      await rm(old, { recursive: true, force: true })
    }
  })
})

describe("прод без демо-входа (DEMO_LOGIN=0)", () => {
  test("демо-пароль не принимается, свой пароль — да, сброс данных его не возвращает", async () => {
    const prodDir = await mkdtemp(path.join(tmpdir(), "dobryi-dom-prod-"))
    const store = await new Store(prodDir).init()
    const server = createApp(store, { demoLogin: false }).listen(0, "127.0.0.1")
    await new Promise((r) => server.once("listening", r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const post = (route: string, body: unknown) =>
      fetch(url + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    try {
      const demo = await post("/api/auth/login", { email: "olga@dobryi-dom.ru", password: "demo1234" })
      assert.equal(demo.status, 401)
      assert.doesNotMatch((await demo.json()).error, /демо/)
      assert.equal((await post("/api/auth/register", { name: "Тест", email: "t@example.com", password: "demo1234" })).status, 400)

      await store.write(async (d) => {
        d.passwords["olga@dobryi-dom.ru"] = await hashPassword("своЙ-пароль-123")
      })
      await store.reset()
      assert.equal((await post("/api/auth/login", { email: "olga@dobryi-dom.ru", password: "своЙ-пароль-123" })).status, 200)
    } finally {
      server.close()
      await rm(prodDir, { recursive: true, force: true })
    }
  })
})

describe("ограничения частоты и адрес клиента", () => {
  // Тестовый сервер доверяет loopback (TRUST_PROXY не задан), поэтому разных посетителей изображаем X-Forwarded-For
  const from = (ip: string) => ({ "x-forwarded-for": ip })
  const tryLogin = (email: string, password: string, ip: string) => api("POST", "/api/auth/login", { email, password }, undefined, from(ip))

  test("5 неудачных входов на email — 429 даже с верным паролем и с других адресов; успешный вход обнуляет счётчик", async () => {
    assert.equal(
      (await api("POST", "/api/auth/register", { name: "Подбор", email: "brute@example.com", password: "password1" })).status,
      201,
    )
    for (let i = 1; i <= 4; i++) assert.equal((await tryLogin("brute@example.com", "wrong", `198.51.100.${i}`)).status, 401)
    assert.equal((await tryLogin("Brute@Example.com", "password1", "198.51.100.9")).status, 200)

    for (let i = 1; i <= 4; i++) assert.equal((await tryLogin("brute@example.com", "wrong", `198.51.100.${i}`)).status, 401)
    const locked = await tryLogin("BRUTE@example.com", "wrong", "198.51.100.5")
    assert.equal(locked.status, 429, "пятая неудача подряд")
    assert.match(locked.json.error, /Слишком много неудачных попыток входа\. Попробуйте снова через 15 мин\./)
    const retry = Number(locked.headers.get("retry-after"))
    assert.ok(retry > 890 && retry <= 900, `Retry-After: ${retry}`)
    assert.equal(
      (await tryLogin("brute@example.com", "password1", "198.51.100.200")).status,
      429,
      "пароль во время блокировки не проверяется",
    )
    assert.equal((await tryLogin("anna@example.com", "wrong", "198.51.100.5")).status, 401, "другие email с этого адреса — как обычно")

    const olga = await login("olga@dobryi-dom.ru")
    const r = await api("GET", "/api/admin/audit?group=auth&q=" + encodeURIComponent("IP 198.51.100"), undefined, olga)
    const entries = r.json.items.filter((e: { action: string }) => e.action === "auth.login_locked")
    assert.equal(entries.length, 1, "блокировка пишется в журнал один раз")
    assert.equal(entries[0].details, "по email: b***@example.com, IP 198.51.100.5")
  })

  test("20 неудачных входов с одного IP — 429 для любых email, незарегистрированные тоже считаются", async () => {
    for (let i = 1; i < 20; i++) assert.equal((await tryLogin(`nobody${i}@example.com`, "wrong", "203.0.113.50")).status, 401)
    assert.equal((await tryLogin("nobody20@example.com", "wrong", "203.0.113.50")).status, 429)
    assert.equal((await tryLogin("anna@example.com", "demo1234", "203.0.113.50")).status, 429)
    assert.equal((await tryLogin("anna@example.com", "demo1234", "203.0.113.51")).status, 200, "соседний адрес не задет")

    const r = await api("GET", "/api/admin/audit?q=" + encodeURIComponent("IP 203.0.113.50"), undefined, await login("olga@dobryi-dom.ru"))
    assert.deepEqual(
      r.json.items.map((e: { action: string; details: string }) => [e.action, e.details]),
      [["auth.login_locked", "по IP: n***@example.com, IP 203.0.113.50"]],
    )
  })

  test("на проде (TRUST_PROXY=2: Caddy → nginx → API) лимит считается по посетителю, X-Forwarded-For от клиента не помогает", async () => {
    const prodDir = await mkdtemp(path.join(tmpdir(), "dobryi-dom-proxy-"))
    const store = await new Store(prodDir).init()
    const server = createApp(store, { trustProxy: "2" }).listen(0, "127.0.0.1")
    await new Promise((r) => server.once("listening", r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    // Так заголовок выглядит после nginx: адрес посетителя от Caddy, затем адрес самого Caddy
    const report = (xff: string) =>
      fetch(url + "/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": xff },
        body: JSON.stringify({ kind: "error", message: "x", page: "/" }),
      })
    try {
      for (let i = 0; i < 20; i++) assert.equal((await report("203.0.113.7, 172.18.0.3")).status, 204)
      const limited = await report("203.0.113.7, 172.18.0.3")
      assert.equal(limited.status, 429)
      assert.ok(Number(limited.headers.get("retry-after")) > 0)
      // Подставной адрес левее настоящего ничего не меняет — даже если бы Caddy его пропустил
      assert.equal((await report("10.9.9.9, 203.0.113.7, 172.18.0.3")).status, 429)
      assert.equal((await report("203.0.113.8, 172.18.0.3")).status, 204, "другой посетитель за теми же прокси")
    } finally {
      server.close()
      await rm(prodDir, { recursive: true, force: true })
    }
  })

  test("TRUST_PROXY: число прокси или подсети; true и мусор не принимаются", () => {
    assert.equal(trustProxySetting(undefined), "loopback")
    assert.equal(trustProxySetting(" 2 "), 2)
    assert.equal(trustProxySetting("loopback, 172.16.0.0/12"), "loopback, 172.16.0.0/12")
    assert.throws(() => trustProxySetting("true"), /TRUST_PROXY/)
    assert.throws(() => createApp({} as Store, { trustProxy: "не-адрес" }))
  })

  test("окно лимита: после него счётчик начинается заново", () => {
    const limit = new RateLimit(2, 60_000)
    assert.equal(limit.hit("a", 0), 1)
    assert.equal(limit.hit("a", 1000), 2)
    assert.equal(limit.blockedFor("a", 1000), 59)
    assert.equal(limit.blockedFor("b", 1000), 0, "у каждого ключа свой счётчик")
    limit.undo("a", 1000)
    assert.equal(limit.blockedFor("a", 1000), 0)
    limit.hit("a", 2000)
    assert.equal(limit.blockedFor("a", 60_000), 0, "окно кончилось")
    assert.equal(limit.hit("a", 60_000), 1)
  })
})

describe("служебное", () => {
  test("демо-режим error — настоящий 503", async () => {
    const r = await api("GET", "/api/pets", undefined, undefined, { "x-demo": "error" })
    assert.equal(r.status, 503)
  })

  test("неизвестный адрес API — 404 в JSON", async () => {
    const r = await api("GET", "/api/nope")
    assert.equal(r.status, 404)
    assert.ok(r.json.error)
  })
})
