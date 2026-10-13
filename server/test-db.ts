/*
 * Тестовая база Postgres для npm run test:postgres. Тесты стирают в ней данные, поэтому
 * берём отдельный адрес TEST_DATABASE_URL (не DATABASE_URL) и требуем, чтобы имя базы
 * оканчивалось на _test: так тесты не доберутся до базы с настоящими данными.
 */
import pg from "pg"

/** Адрес тестовой базы или null, если TEST_DATABASE_URL не задан. Базу создаёт, если её ещё нет. */
export async function testDatabaseUrl(env = process.env): Promise<string | null> {
  const url = env.TEST_DATABASE_URL?.trim()
  if (!url) return null
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`TEST_DATABASE_URL должен указывать на базу с именем …_test — тесты стирают в ней данные (сейчас: «${name}»)`)
  }
  // Подключаемся к служебной базе postgres того же сервера и создаём тестовую, если её нет
  const admin = new URL(url)
  admin.pathname = "/postgres"
  const client = new pg.Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const exists = await client.query("select 1 from pg_database where datname = $1", [name])
    if (!exists.rowCount) await client.query(`create database ${name}`)
  } finally {
    await client.end()
  }
  return url
}
