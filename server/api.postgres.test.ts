/*
 * Весь набор тестов API (api.test.ts) — на Postgres вместо JSON-файла: npm run test:postgres.
 * Нужен запущенный Postgres и TEST_DATABASE_URL (см. .env.example) — отдельная база …_test, данные в ней сбрасываются к демо.
 */
process.env.TEST_STORAGE = "postgres"
await import("./api.test.ts")
