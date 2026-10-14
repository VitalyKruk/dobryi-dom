/*
 * Ограничение частоты: счётчик попыток на ключ (IP, email) в окне фиксированной длины,
 * и откуда брать IP клиента за прокси (TRUST_PROXY).
 * Счётчики живут в памяти процесса: API запущен в одном экземпляре, после перезапуска они обнуляются.
 */

/** Больше ключей не держим: при переполнении выбрасываем истёкшие окна, затем самые старые */
const MAX_KEYS = 10_000

export class RateLimit {
  limit: number
  windowMs: number
  #hits = new Map<string, { count: number; since: number }>()

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  #current(key: string, now: number) {
    const w = this.#hits.get(key)
    return w && now - w.since < this.windowMs ? w : undefined
  }

  /** Учесть попытку; возвращает, сколько их было в текущем окне вместе с этой */
  hit(key: string, now = Date.now()) {
    let w = this.#current(key, now)
    if (!w) {
      // Удаляем и добавляем заново, чтобы порядок в Map совпадал с началом окна
      this.#hits.delete(key)
      this.#prune(now)
      w = { count: 0, since: now }
      this.#hits.set(key, w)
    }
    return ++w.count
  }

  /** Лимит исчерпан — через сколько секунд окно закончится; 0 — попытка разрешена */
  blockedFor(key: string, now = Date.now()) {
    const w = this.#current(key, now)
    return w && w.count >= this.limit ? Math.max(1, Math.ceil((w.since + this.windowMs - now) / 1000)) : 0
  }

  /** Не считать последнюю попытку — например, вход оказался успешным */
  undo(key: string, now = Date.now()) {
    const w = this.#current(key, now)
    if (w && w.count > 0) w.count--
  }

  reset(key: string) {
    this.#hits.delete(key)
  }

  #prune(now: number) {
    if (this.#hits.size < MAX_KEYS) return
    for (const [key, w] of this.#hits) if (now - w.since >= this.windowMs) this.#hits.delete(key)
    for (const key of this.#hits.keys()) {
      if (this.#hits.size < MAX_KEYS) break
      this.#hits.delete(key)
    }
  }
}

/**
 * Настройка Express «trust proxy» из TRUST_PROXY. Число — сколько прокси стоит перед API
 * (адрес клиента — столько-то записей с конца X-Forwarded-For); иначе — адреса и подсети через запятую
 * (`loopback`, `uniquelocal`, `10.0.0.0/8`…). Без переменной — `loopback`: dev-сервер Vite на этом же компьютере.
 */
export function trustProxySetting(value: string | undefined) {
  const v = value?.trim()
  if (!v) return "loopback"
  if (/^\d+$/.test(v)) return Number(v)
  // true доверял бы любому X-Forwarded-For — адрес клиента подделывался бы одним заголовком
  if (/^(true|false)$/i.test(v)) throw new Error("TRUST_PROXY: укажите число прокси или подсети, а не true/false")
  return v
}
