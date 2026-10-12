/*
 * Весь набор тестов API (api.test.ts) — на Supabase вместо JSON-файла: npm run test:supabase.
 * Нужен запущенный Supabase и .env. Данные в этом Supabase сбрасываются к демо.
 */
process.env.TEST_STORAGE = "supabase"
await import("./api.test.ts")
