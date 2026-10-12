/*
 * Журнал действий: кто и когда менял данные приюта. Общий для сервера и статической версии:
 * запись события, подписи для интерфейса и стартовая история для демо-данных.
 * Без зависимостей от браузера, импорты с расширением — модуль подключает и Node.
 */
import { applicationStatusLabel, petStatusLabel, roleLabel } from "./format.ts"
import type { Application, AuditAction, AuditEntry, Pet, User } from "./types.ts"

/** Сколько записей хранить: старые удаляются, чтобы база не росла бесконечно */
export const AUDIT_LIMIT = 2000

export const auditActionLabel: Record<AuditAction, string> = {
  "auth.login": "Вход",
  "auth.login_failed": "Неудачный вход",
  "auth.register": "Регистрация",
  "application.create": "Новая заявка",
  "application.status": "Статус заявки",
  "application.comment": "Комментарий к заявке",
  "application.cancel": "Заявка отозвана",
  "pet.create": "Питомец добавлен",
  "pet.update": "Карточка изменена",
  "pet.delete": "Питомец удалён",
  "pet.status": "Статус питомца",
  "user.role": "Роль пользователя",
  "volunteers.update": "Расписание волонтёров",
  "data.reset": "Сброс демо-данных",
}

/** Группы для фильтра в интерфейсе — по началу кода действия */
export const auditGroups = [
  { value: "application", label: "Заявки" },
  { value: "pet", label: "Питомцы" },
  { value: "auth", label: "Входы" },
  { value: "user", label: "Роли" },
  { value: "volunteers", label: "Волонтёры" },
  { value: "data", label: "Данные" },
] as const

export type AuditGroup = (typeof auditGroups)[number]["value"]

export const actorOf = (u?: User | null): AuditEntry["actor"] => (u ? { id: u.id, name: u.name, role: u.role } : null)

/** Добавить запись в начало журнала и обрезать хвост */
export function pushAudit(list: AuditEntry[], entry: Omit<AuditEntry, "id" | "at"> & { at?: string }, id: string) {
  list.unshift({ id, at: entry.at ?? new Date().toISOString(), ...entry })
  if (list.length > AUDIT_LIMIT) list.length = AUDIT_LIMIT
}

/** «olga@dobryi-dom.ru» → «o***@dobryi-dom.ru»: в журнале видно попытку, но не весь адрес */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@")
  if (!domain) return "***"
  return `${name.slice(0, 1)}***@${domain}`
}

export const statusChange = (from: Application["status"], to: Application["status"]) =>
  `${applicationStatusLabel[from]} → ${applicationStatusLabel[to]}`.toLowerCase().replace(/^./, (c) => c.toUpperCase())

export const petStatusChange = (pet: Pet, from: Pet["status"], to: Pet["status"]) =>
  `${petStatusLabel(from, pet.sex)} → ${petStatusLabel(to, pet.sex).toLowerCase()}`

export const roleChange = (from: User["role"], to: User["role"]) => `${roleLabel[from]} → ${roleLabel[to].toLowerCase()}`

export function filterAudit(list: AuditEntry[], group?: string, q?: string) {
  const needle = q?.trim().toLowerCase()
  return list.filter(
    (e) =>
      (!group || e.action.startsWith(`${group}.`)) &&
      (!needle ||
        [e.actor?.name, e.target?.label, e.target?.id, e.details, auditActionLabel[e.action]]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))),
  )
}

/**
 * Стартовая история для демо: решения по заявкам и отъезды домой из сгенерированных данных,
 * чтобы журнал не был пустым. Авторы решений — из комментариев сотрудников.
 */
export function seedAudit(applications: Application[], pets: Pet[], users: User[]): AuditEntry[] {
  const staff = (name: string) => {
    const u = users.find((x) => x.name === name)
    return u ? actorOf(u) : { name, role: "admin" as const }
  }
  const petName = (id: string) => pets.find((p) => p.id === id)?.name
  const entries: AuditEntry[] = []
  for (const a of applications) {
    entries.push({
      id: `seed-${a.id}-create`,
      at: a.createdAt,
      actor: a.userId ? (actorOf(users.find((u) => u.id === a.userId)) ?? { name: a.name }) : { name: a.name },
      action: "application.create",
      target: { type: "application", id: a.id, label: `${a.id} · ${petName(a.petId) ?? a.petId}` },
    })
    if (a.decidedAt && a.status !== "pending") {
      const author = a.staffComments.at(-1)?.author
      entries.push({
        id: `seed-${a.id}-decision`,
        at: a.decidedAt,
        // Без комментария автор решения неизвестен — статусы заявок меняет администратор
        actor: a.status === "cancelled" ? { name: a.name } : staff(author ?? "Ольга Васильева"),
        action: a.status === "cancelled" ? "application.cancel" : "application.status",
        target: { type: "application", id: a.id, label: `${a.id} · ${petName(a.petId) ?? a.petId}` },
        details: a.status === "cancelled" ? undefined : statusChange("pending", a.status),
      })
    }
  }
  for (const p of pets) {
    if (p.status === "adopted" && p.adoptedAt) {
      entries.push({
        id: `seed-${p.id}-adopted`,
        at: p.adoptedAt,
        actor: staff("Ольга Васильева"),
        action: "pet.status",
        target: { type: "pet", id: p.id, label: p.name },
        details: petStatusChange(p, "reserved", "adopted"),
      })
    }
  }
  return entries.sort((x, y) => y.at.localeCompare(x.at)).slice(0, AUDIT_LIMIT)
}
