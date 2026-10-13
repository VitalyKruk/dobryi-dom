/*
 * Проверка хранения в Postgres: npm run test:postgres (нужен запущенный Postgres и TEST_DATABASE_URL, см. README).
 * Без TEST_DATABASE_URL тесты пропускаются. Тест сбрасывает данные к демо — только в отдельной базе …_test.
 */
import assert from "node:assert/strict"
import { after, describe, test } from "node:test"
import { Store } from "./store.ts"
import { PostgresBackend } from "./postgres.ts"
import { testDatabaseUrl } from "./test-db.ts"

process.env.LOG_LEVEL ??= "silent"
const url = (await testDatabaseUrl()) ?? ""
const backend = url ? new PostgresBackend(url) : null
const opened: PostgresBackend[] = backend ? [backend] : []
const fresh = () => {
  const b = new PostgresBackend(url)
  opened.push(b)
  return b
}
after(() => Promise.all(opened.map((b) => b.close())))

/** Данные так, как их увидит API после загрузки: через JSON, без undefined-полей */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v))

describe("Postgres", { skip: backend ? false : "нет TEST_DATABASE_URL — пропускаю" }, () => {
  test("демо-данные, изменения и удаления сохраняются в таблицах и читаются обратно", async () => {
    const store = await new Store(backend!).init()
    await store.reset()

    await store.write((d) => {
      d.applications.unshift({ ...structuredClone(d.applications[0]), id: "A-TEST-1", email: "pg@example.com", status: "pending" })
      d.fakeDoors.donate = { count: 3, lastAt: new Date().toISOString() }
      d.pets = d.pets.filter((p) => p.id !== "keks")
      d.subscribers.push("pg@example.com")
      d.seq += 1
    })

    // Свежий бэкенд — ничего не помнит, читает всё из базы
    const reloaded = await fresh().load()
    assert.ok(reloaded)
    assert.equal(reloaded.pets.length, store.db.pets.length)
    assert.ok(!reloaded.pets.some((p) => p.id === "keks"), "удалённый питомец удалён и в базе")
    assert.deepEqual(
      plain(reloaded.applications.find((a) => a.id === "A-TEST-1")),
      plain(store.db.applications.find((a) => a.id === "A-TEST-1")),
    )
    assert.equal(reloaded.fakeDoors.donate?.count, 3)
    assert.ok(reloaded.subscribers.includes("pg@example.com"))
    assert.equal(reloaded.seq, store.db.seq)
    assert.equal(reloaded.users.length, store.db.users.length)
    assert.equal(Object.keys(reloaded.passwords).length, Object.keys(store.db.passwords).length)
    assert.equal(reloaded.audit.length, store.db.audit.length)
    assert.deepEqual(plain(reloaded.pets.find((p) => p.id === "persik")), plain(store.db.pets.find((p) => p.id === "persik")))

    await store.reset()
    const afterReset = await fresh().load()
    assert.ok(!afterReset!.applications.some((a) => a.id === "A-TEST-1"), "сброс убирает лишние строки")
    assert.ok(afterReset!.pets.some((p) => p.id === "keks"))
  })

  test("фото сохраняются в таблице uploads и читаются обратно", async () => {
    const name = `${"ab".repeat(16)}.png`
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")
    await backend!.saveUpload(name, png, "image/png")
    assert.deepEqual(await backend!.readUpload(name), png)
    assert.ok((await backend!.listUploads()).includes(name))
    assert.equal(await backend!.readUpload(`${"cd".repeat(16)}.png`), null)
  })
})
