/* Интеграционные тесты API: npm run test:api (node:test, сервер на временной папке данных) */
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import { createApp } from "./app.ts"
import { Store } from "./store.ts"

let base = ""
let dir = ""
let close: () => void

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "dobryi-dom-test-"))
  const store = await new Store(dir).init()
  const server = createApp(store).listen(0, "127.0.0.1")
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})

after(async () => {
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
  return { status: res.status, json: text ? JSON.parse(text) : null }
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

  test("заявка сохраняется в db.json", async () => {
    const db = JSON.parse(await readFile(path.join(dir, "db.json"), "utf8"))
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
    const volunteer = await api("PATCH", `/api/applications/${created.json.id}/status`, { status: "approved" }, await login("ivan@dobryi-dom.ru"))
    assert.equal(volunteer.status, 403)
    const admin = await api("PATCH", `/api/applications/${created.json.id}/status`, { status: "approved" }, await login("olga@dobryi-dom.ru"))
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

  test("пароли в db.json хранятся хешем", async () => {
    const db = JSON.parse(await readFile(path.join(dir, "db.json"), "utf8"))
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
    Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex"),
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
