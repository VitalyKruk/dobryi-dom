/*
 * Проверка хранения в Supabase: npm run test:supabase (нужен запущенный Supabase и .env, см. README).
 * Без SUPABASE_URL тесты пропускаются. ВНИМАНИЕ: тест сбрасывает данные в этом Supabase к демо —
 * не запускайте его на базе с настоящими данными.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Store } from "./store.ts"
import { SupabaseBackend, supabaseFromEnv } from "./supabase.ts"

process.env.LOG_LEVEL ??= "silent"
const backend = supabaseFromEnv()
const url = process.env.SUPABASE_URL ?? ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

/** Данные так, как их увидит API после загрузки: через JSON, без undefined-полей */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v))

describe("Supabase", { skip: backend ? false : "нет SUPABASE_URL — пропускаю" }, () => {
  test("демо-данные, изменения и удаления сохраняются в таблицах и читаются обратно", async () => {
    const store = await new Store(backend!).init()
    await store.reset()

    await store.write((d) => {
      d.applications.unshift({ ...structuredClone(d.applications[0]), id: "A-TEST-1", email: "sb@example.com", status: "pending" })
      d.fakeDoors.donate = { count: 3, lastAt: new Date().toISOString() }
      d.pets = d.pets.filter((p) => p.id !== "keks")
      d.subscribers.push("sb@example.com")
      d.seq += 1
    })

    // Свежий бэкенд — ничего не помнит, читает всё из базы
    const reloaded = await new SupabaseBackend(url, key).load()
    assert.ok(reloaded)
    assert.equal(reloaded.pets.length, store.db.pets.length)
    assert.ok(!reloaded.pets.some((p) => p.id === "keks"), "удалённый питомец удалён и в базе")
    assert.deepEqual(plain(reloaded.applications.find((a) => a.id === "A-TEST-1")), plain(store.db.applications.find((a) => a.id === "A-TEST-1")))
    assert.equal(reloaded.fakeDoors.donate?.count, 3)
    assert.ok(reloaded.subscribers.includes("sb@example.com"))
    assert.equal(reloaded.seq, store.db.seq)
    assert.equal(reloaded.users.length, store.db.users.length)
    assert.equal(Object.keys(reloaded.passwords).length, Object.keys(store.db.passwords).length)
    assert.equal(reloaded.audit.length, store.db.audit.length, "журнал больше 1000 записей читается постранично")
    assert.deepEqual(plain(reloaded.pets.find((p) => p.id === "persik")), plain(store.db.pets.find((p) => p.id === "persik")))

    await store.reset()
    const afterReset = await new SupabaseBackend(url, key).load()
    assert.ok(!afterReset!.applications.some((a) => a.id === "A-TEST-1"), "сброс убирает лишние строки")
    assert.ok(afterReset!.pets.some((p) => p.id === "keks"))
  })

  test("фото сохраняются в Storage и читаются обратно", async () => {
    const name = `${"ab".repeat(16)}.png`
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")
    await backend!.saveUpload(name, png, "image/png")
    assert.deepEqual(await backend!.readUpload(name), png)
    assert.ok((await backend!.listUploads()).includes(name))
    assert.equal(await backend!.readUpload(`${"cd".repeat(16)}.png`), null)
  })
})
