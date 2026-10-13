/*
 * Весь набор тестов API (api.test.ts) — на Postgres вместо JSON-файла: npm run test:postgres.
 * Нужен запущенный Postgres и DATABASE_URL (см. .env.example). Данные в этой базе сбрасываются к демо.
 */
process.env.TEST_STORAGE = "postgres"
await import("./api.test.ts")
