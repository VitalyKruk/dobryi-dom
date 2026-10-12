/*
 * Фейкдоры: кнопки функций, которых ещё нет (оплата доната, соцсети). Переход ведёт на страницу
 * «в разработке», а сервер считает переходы — по ним видно, на что есть спрос, до того как строить.
 * Общий для сервера и клиента: без зависимостей от браузера.
 */
export const FAKE_DOORS = {
  donate: "Оплата доната картой",
  vk: "ВКонтакте",
  telegram: "Telegram",
  youtube: "YouTube",
} as const

export type FakeDoor = keyof typeof FAKE_DOORS

/** Благодарность на странице «в разработке»: тем, кто хотел помочь деньгами, — отдельные слова */
export const fakeDoorThanks = (feature: FakeDoor) =>
  feature === "donate" ? "Спасибо, что решили помочь нам." : "Спасибо, что заинтересовались."

export const FAKE_DOOR_IDS = Object.keys(FAKE_DOORS) as FakeDoor[]

export const isFakeDoor = (v: unknown): v is FakeDoor => typeof v === "string" && v in FAKE_DOORS

export type FakeDoorStat = { feature: FakeDoor; label: string; count: number; lastAt: string | null }

/** Счётчики в базе: { donate: { count, lastAt }, … } */
export type FakeDoorCounters = Partial<Record<FakeDoor, { count: number; lastAt: string }>>

export function recordFakeDoor(counters: FakeDoorCounters, feature: FakeDoor, at = new Date().toISOString()) {
  const c = counters[feature] ?? { count: 0, lastAt: at }
  counters[feature] = { count: c.count + 1, lastAt: at }
}

/** Все фейкдоры, даже без переходов, — больше переходов выше */
export function fakeDoorStats(counters: FakeDoorCounters): FakeDoorStat[] {
  return FAKE_DOOR_IDS.map((feature) => ({
    feature,
    label: FAKE_DOORS[feature],
    count: counters[feature]?.count ?? 0,
    lastAt: counters[feature]?.lastAt ?? null,
  })).sort((a, b) => b.count - a.count)
}
