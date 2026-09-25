/*
 * Демо-режим для показа состояний интерфейса без настоящего сервера.
 * Включается параметром в адресе и держится до закрытия вкладки:
 *
 *   ?demo=error  — каждый запрос к API падает («сервер не отвечает») → экраны ошибок
 *   ?demo=empty  — списки приходят пустыми → пустые состояния
 *   ?demo=slow   — ответы идут ~2.5 с → хорошо видны скелетоны загрузки
 *   ?demo=off    — обычная работа
 */
export type DemoMode = "error" | "empty" | "slow"

const KEY = "dd:demo"
const MODES: DemoMode[] = ["error", "empty", "slow"]

function read(): DemoMode | null {
  try {
    const param = new URLSearchParams(window.location.search).get("demo")
    if (param === "off") sessionStorage.removeItem(KEY)
    else if (param && MODES.includes(param as DemoMode)) sessionStorage.setItem(KEY, param)
    const v = sessionStorage.getItem(KEY)
    return MODES.includes(v as DemoMode) ? (v as DemoMode) : null
  } catch {
    return null
  }
}

export function demoMode() {
  return read()
}

export function setDemoMode(mode: DemoMode | null) {
  try {
    if (mode) sessionStorage.setItem(KEY, mode)
    else sessionStorage.removeItem(KEY)
  } catch {
    // без sessionStorage демо-режим просто не сохранится
  }
}

export const demoModeLabel: Record<DemoMode, string> = {
  error: "сервер не отвечает",
  empty: "пустые данные",
  slow: "медленная сеть",
}
