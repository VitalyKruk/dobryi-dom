/*
 * Аналитика для дашборда: динамика заявок, воронка, спрос по видам, причины отказов
 * и подсказки команде — что сделать на этой неделе. Считается на сервере по всей базе,
 * клиент получает готовые цифры.
 */
import { plural } from "../src/lib/format.ts"
import type { Analytics, Application, Insight, Pet, PetRef, WeekPoint } from "../src/lib/types.ts"

const DAY = 86_400_000
const WEEKS = 12

/** Понедельник 00:00 для даты */
function weekStart(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)

/** Что делать с частой причиной отказа; null — причина не про ошибку процесса (выбрали другую семью) */
const reasonAdvice: [RegExp, string | null][] = [
  [/выбрали семью|другую семью/i, null],
  [/съёмн|арендодат|хозяин против/i, "Добавьте в анкету вопрос о согласии арендодателя — такие заявки будут отсеиваться сразу."],
  [/на улице|вольер|цеп/i, "Напишите на странице «Как взять питомца», что питомцы живут только в доме."],
  [/связаться|не отвеча/i, "Спрашивайте в анкете удобное время для звонка и дублируйте приглашение в мессенджер."],
  [/командиров|оставить .* не с кем/i, "Предлагайте таким кандидатам стать волонтёрами или взять питомца на передержку."],
  [/кошк|собак|детей|дет[иья]/i, "Показывайте совместимость с детьми и животными крупнее — подбор «Подходят вам» уже не предлагает таких питомцев."],
  [/тесно|квартир/i, "Подбор «Подходят вам» учитывает жильё — советуйте кандидатам начинать с него."],
]
const adviceFor = (reason: string) => {
  const hit = reasonAdvice.find(([re]) => re.test(reason))
  return hit ? hit[1] : "Расскажите об этом требовании заранее — на странице «Как взять питомца» и в анкете."
}

/** «Съёмная квартира, хозяин против животных. Договорились…» → «Съёмная квартира, хозяин против животных» */
function reasonKey(text: string) {
  const first = text.split(/[.—:]/)[0].trim()
  return first.length > 70 ? `${first.slice(0, 67)}…` : first
}

export function buildAnalytics(pets: Pet[], apps: Application[], now = Date.now()): Analytics {
  const ref = (p: Pet, value: number): PetRef => ({ id: p.id, name: p.name, photo: p.photos[0], species: p.species, value })
  const time = (iso: string) => new Date(iso).getTime()

  // ——— По неделям ———
  const firstWeek = weekStart(now) - (WEEKS - 1) * 7 * DAY
  const weeks: WeekPoint[] = Array.from({ length: WEEKS }, (_, i) => ({
    start: new Date(firstWeek + i * 7 * DAY).toISOString(),
    total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, adopted: 0,
  }))
  const weekOf = (t: number) => Math.floor((weekStart(t) - firstWeek) / (7 * DAY))
  const inPeriod = apps.filter((a) => time(a.createdAt) >= firstWeek)
  for (const a of inPeriod) {
    const w = weeks[weekOf(time(a.createdAt))]
    if (!w) continue
    w.total++
    w[a.status]++
  }
  const adoptedPets = pets.filter((p) => p.status === "adopted" && p.adoptedAt)
  for (const p of adoptedPets) {
    const w = weeks[weekOf(time(p.adoptedAt!))]
    if (w && time(p.adoptedAt!) >= firstWeek) w.adopted++
  }

  // ——— Итоги ———
  const decided = inPeriod.filter((a) => a.status === "approved" || a.status === "rejected")
  const approved = inPeriod.filter((a) => a.status === "approved")
  const since = (days: number) => now - days * DAY
  const last4 = apps.filter((a) => time(a.createdAt) >= since(28)).length
  const prev4 = apps.filter((a) => time(a.createdAt) >= since(56) && time(a.createdAt) < since(28)).length
  const decisionDays = apps
    .filter((a) => a.decidedAt && a.status !== "cancelled")
    .map((a) => (time(a.decidedAt!) - time(a.createdAt)) / DAY)
  const daysToHome = adoptedPets.map((p) => (time(p.adoptedAt!) - time(p.addedAt)) / DAY)
  const adoptedInPeriod = adoptedPets.filter((p) => time(p.adoptedAt!) >= firstWeek).length

  // ——— Воронка ———
  const funnel = [
    { label: "Подано заявок", value: inPeriod.length },
    { label: "Рассмотрено", value: inPeriod.filter((a) => a.status !== "pending").length },
    { label: "Одобрено", value: approved.length },
    { label: "Уехали домой", value: adoptedInPeriod },
  ]

  // ——— Спрос по видам ———
  const petById = new Map(pets.map((p) => [p.id, p]))
  const species = (["cat", "dog"] as const).map((s) => ({
    species: s,
    waiting: pets.filter((p) => p.species === s && p.status !== "adopted").length,
    applications: inPeriod.filter((a) => petById.get(a.petId)?.species === s).length,
  }))

  // ——— Причины отказов ———
  const reasons = new Map<string, number>()
  for (const a of inPeriod.filter((x) => x.status === "rejected")) {
    const text = a.staffComments.at(-1)?.text
    if (!text) continue
    const key = reasonKey(text)
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }
  const rejectReasons = [...reasons]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ——— Популярные и «забытые» питомцы ———
  const perPet = new Map<string, number>()
  for (const a of inPeriod) perPet.set(a.petId, (perPet.get(a.petId) ?? 0) + 1)
  const topPets = [...perPet]
    .map(([id, n]) => [petById.get(id), n] as const)
    .filter((x): x is readonly [Pet, number] => !!x[0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, n]) => ref(p, n))
  const recent = new Set(apps.filter((a) => time(a.createdAt) >= since(30)).map((a) => a.petId))
  const forgotten = pets
    .filter((p) => p.status === "available" && !recent.has(p.id) && time(p.addedAt) < since(21))
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((p) => ref(p, Math.floor((now - time(p.addedAt)) / DAY)))

  // ——— Подсказки команде ———
  const insights: Insight[] = []
  const stale = apps
    .filter((a) => a.status === "pending" && time(a.createdAt) < since(3))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (stale.length) {
    insights.push({
      tone: "warning",
      title: `${stale.length} ${plural(stale.length, ["заявка ждёт", "заявки ждут", "заявок ждут"])} ответа дольше 3 дней`,
      text: `Самая старая — ${stale[0].id} (${stale[0].name}). Кандидаты остывают: позвоните сегодня.`,
      link: `/admin/applications?id=${stale[0].id}`,
    })
  }
  if (forgotten.length) {
    const names = forgotten.slice(0, 3).map((p) => p.name).join(", ")
    insights.push({
      tone: "warning",
      title: `${forgotten.length} ${plural(forgotten.length, ["питомец", "питомца", "питомцев"])} без заявок за последний месяц`,
      text: `${names}${forgotten.length > 3 ? " и другие" : ""}. Новые фото, видео с прогулки и пост в соцсетях обычно возвращают интерес.`,
      link: "/admin/pets",
    })
  }
  // Самая частая причина, с которой можно что-то сделать
  const rejectedTotal = [...reasons.values()].reduce((s, n) => s + n, 0)
  const fixable = rejectReasons.find((r) => adviceFor(r.reason) !== null)
  if (fixable && rejectedTotal >= 5) {
    const share = Math.round((fixable.count / rejectedTotal) * 100)
    insights.push({
      tone: "info",
      title: `${share}% отказов: «${fixable.reason}»`,
      text: adviceFor(fixable.reason)!,
    })
  }
  const [cats, dogs] = species
  const demand = (x: (typeof species)[number]) => (x.waiting ? x.applications / x.waiting : 0)
  if (cats.waiting && dogs.waiting && Math.abs(demand(cats) - demand(dogs)) > 0.5) {
    const low = demand(cats) < demand(dogs) ? cats : dogs
    insights.push({
      tone: "info",
      title: low.species === "cat" ? "На кошек заявок меньше" : "На собак заявок меньше",
      text: `${demand(low).toFixed(1).replace(".", ",")} заявки на одного ${low.species === "cat" ? "кота" : "пса"} против ${demand(low === cats ? dogs : cats).toFixed(1).replace(".", ",")}. Поднимите их в «Питомцах недели» на главной.`,
    })
  }
  if (prev4 > 0) {
    const change = Math.round(((last4 - prev4) / prev4) * 100)
    if (Math.abs(change) >= 10) {
      insights.push({
        tone: change > 0 ? "success" : "warning",
        title: change > 0 ? `Заявок стало больше на ${change}%` : `Заявок стало меньше на ${-change}%`,
        text: `${last4} за последние 4 недели против ${prev4} за 4 недели до этого.`,
      })
    }
  }

  return {
    weeks,
    totals: {
      applications: inPeriod.length,
      last4,
      prev4,
      approvalRate: decided.length ? Math.round((approved.length / decided.length) * 100) : 0,
      rejected: rejectedTotal,
      avgDecisionDays: avg(decisionDays),
      avgDaysToHome: avg(daysToHome),
      adopted: adoptedInPeriod,
    },
    funnel,
    species,
    rejectReasons,
    topPets,
    forgotten: forgotten.slice(0, 5),
    insights,
  }
}
