/*
 * Ошибки в браузере посетителя → серверный лог (POST /api/client-errors).
 * Без этого о сломанной у кого-то странице мы бы узнали, только если человек напишет сам.
 *
 * Что отправляем: тип, текст ошибки, стек и путь страницы — без query-строки (в ней бывает поиск
 * по имени), без содержимого форм и без данных пользователя. Ошибки API (ApiError) не шлём:
 * сервер их уже записал сам. За одну загрузку страницы — не больше 10 сообщений, повторы отбрасываем.
 */
import * as api from "./api"

const MAX_PER_PAGE = 10
const sent = new Set<string>()

export type ClientErrorKind = "error" | "unhandledrejection" | "render"

export function reportError(kind: ClientErrorKind, error: unknown) {
  if (error instanceof api.ApiError) return
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Неизвестная ошибка")
  const key = `${kind}:${err.message}`
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return
  sent.add(key)
  api.reportClientError({
    kind,
    message: err.message.slice(0, 500) || "Без текста",
    stack: err.stack?.slice(0, 4000),
    page: window.location.pathname.slice(0, 300) || "/",
    release: import.meta.env.MODE,
  })
}

let installed = false

/** Ловим всё, что не обработали сами страницы */
export function installErrorReporting() {
  if (installed) return
  installed = true
  window.addEventListener("error", (e) => {
    // Ошибка загрузки картинки или скрипта приходит без error — это не сбой кода
    if (e.error) reportError("error", e.error)
  })
  window.addEventListener("unhandledrejection", (e) => reportError("unhandledrejection", e.reason))
}
