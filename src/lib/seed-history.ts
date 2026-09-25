/*
 * История заявок за ~3 месяца до «сегодня» — чтобы дашборд и таблицы показывали
 * живую картину, а не пару строк. Генератор детерминированный (фиксированное зерно):
 * при каждом сбросе демо-данных получается та же история, сдвинутая к текущей дате.
 *
 * Правила, как в настоящем приюте:
 *  - у каждого пристроенного питомца есть одобренная заявка за несколько дней до отъезда домой;
 *  - остальные заявки отклонены или отозваны, причины согласованы с анкетой
 *    (кошка дома + питомец не ладит с кошками, малыши + питомец боится детей…);
 *  - на рассмотрении остаются только свежие заявки;
 *  - поток заявок постепенно растёт, по выходным их больше.
 * Все заявки (и сгенерированные, и написанные вручную в seed.ts) нумеруются по дате поступления.
 * Импортирует только сервер (server/store.ts), в клиентский бандл не попадает.
 */
import { ageInMonths } from "./format.ts"
import { seedPets } from "./seed.ts"
import type { Application, Experience, Housing, Pet, StaffComment, VisitTime } from "./types.ts"

const DAY = 86_400_000
/** Самая ранняя заявка — столько дней назад */
const TO_DAYS = 95
/** Последние дни частично заполнены заявками из seed.ts — там генерируем реже */
const RECENT_DAYS = 13
const FIRST_ID = 1001

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const maleNames = ["Алексей", "Андрей", "Артём", "Владимир", "Григорий", "Денис", "Евгений", "Илья", "Кирилл", "Михаил", "Никита", "Олег", "Роман", "Станислав", "Тимофей", "Фёдор", "Юрий", "Глеб"]
const femaleNames = ["Алина", "Валерия", "Вера", "Дарья", "Елена", "Ксения", "Людмила", "Марина", "Надежда", "Оксана", "Полина", "Светлана", "Татьяна", "Юлия", "Яна", "Софья", "Виктория", "Анастасия", "Ольга", "Кристина"]
/** Фамилии в мужской форме; женская получается окончанием */
const surnames = ["Кузнецов", "Попов", "Соколов", "Зайцев", "Павлов", "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв", "Фролов", "Медведев", "Беляев", "Тарасов", "Белов", "Комаров", "Орехов", "Киселёв", "Макаров", "Андреев", "Ковалёв", "Ильин", "Гусев", "Титов", "Кудрявцев", "Баранов", "Куликов", "Алексеев", "Степанов", "Яковлев", "Сорокин", "Романов", "Захаров", "Борисов", "Королёв", "Герасимов", "Пономарёв", "Григорьев", "Лазарев", "Высоцкий", "Дементьев", "Жуков"]
const femaleSurname = (s: string) => (s.endsWith("ий") ? s.slice(0, -2) + "ая" : s + "а")

const cities: [string, number][] = [
  ["Санкт-Петербург", 60], ["Пушкин", 6], ["Колпино", 5], ["Гатчина", 5], ["Всеволожск", 5], ["Кудрово", 6], ["Мурино", 7], ["Петергоф", 3], ["Сестрорецк", 3],
]
const staff = ["Ольга Васильева", "Иван Петров", "Светлана Орлова"]

const otherPetsNotes = {
  cat: ["Кошка 3 года", "Два кота, оба спокойные", "Кот 7 лет, домосед", "Кошка и попугай"],
  dog: ["Спаниель 6 лет", "Пожилая такса", "Лабрадор 2 года", "Дворняжка 4 года, очень дружелюбная"],
}
const commentsPool = [
  "Давно хотим взять питомца из приюта.",
  "Работаю из дома, смогу уделять много времени.",
  "Рядом большой парк для прогулок.",
  "Увидели в вашем паблике — влюбились с первого фото.",
  "Готовы к адаптации, почитали про первые недели дома.",
  "Можем приехать в любой день, на машине.",
  "Прошлый кот прожил с нами 16 лет, очень скучаем.",
]
const kidsComments = ["Дети очень ждут!", "Сыну 9 лет, давно просит друга."]

const approvedNotes = [
  "Знакомство прошло отлично, договор подписан 🎉",
  "Проверили условия дома — всё в порядке. Передали паспорт и рекомендации по корму.",
  "Созвонились через неделю: адаптация идёт хорошо, уже спит на диване.",
]
const genericRejects = [
  "Не удалось связаться: три звонка и письмо без ответа.",
  "Съёмная квартира, хозяин против животных. Договорились вернуться к разговору после переезда.",
  "Планировали держать питомца на улице круглый год — ему это не подходит.",
  "Кандидат часто в командировках, оставить питомца не с кем. Посоветовали стать волонтёром.",
  "Выбрали семью, которая подошла чуть больше. Кандидат готов посмотреть других питомцев.",
]
const cancelReasons = [
  "Кандидат отозвал заявку: переезд откладывается.",
  "Кандидат отозвал заявку: взяли котёнка у знакомых.",
  "Кандидат отозвал заявку: решили подождать до следующего года.",
  "Кандидат отозвал заявку: после знакомства поняли, что нужен питомец поспокойнее.",
  "Кандидат отозвал заявку: не договорились в семье.",
]

const translit: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}
const latin = (s: string) => s.toLowerCase().split("").map((c) => translit[c] ?? c).join("")

type NewApplication = Omit<Application, "id">

export function buildApplications(recent: NewApplication[], now = Date.now(), pets: Pet[] = seedPets) {
  const rnd = mulberry32(20_160_401) // день основания приюта
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]
  const chance = (p: number) => rnd() < p
  const between = (a: number, b: number) => a + rnd() * (b - a)
  function weighted<T>(items: [T, number][]) {
    let r = rnd() * items.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of items) if ((r -= w) < 0) return v
    return items[items.length - 1][0]
  }
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString()
  const ago = (iso: string) => (now - new Date(iso).getTime()) / DAY

  function person() {
    const female = chance(0.62) // заявки в приюты чаще оставляют женщины
    const first = pick(female ? femaleNames : maleNames)
    const lastM = pick(surnames)
    const last = female ? femaleSurname(lastM) : lastM
    const phone = `+7 (9${Math.floor(between(0, 10))}${Math.floor(between(0, 10))}) ${String(Math.floor(between(100, 1000)))}-${String(Math.floor(between(10, 100)))}-${String(Math.floor(between(10, 100)))}`
    const email = `${latin(first)}.${latin(last)}${chance(0.4) ? Math.floor(between(1, 99)) : ""}@example.com`
    return { name: `${first} ${last}`, phone, email }
  }

  function answers(pet: Pet) {
    const bigDog = pet.species === "dog" && pet.size === "large"
    const housing = weighted<Housing>([["apartment", bigDog ? 40 : 65], ["house", bigDog ? 55 : 30], ["other", 5]])
    const hasKids = chance(0.35)
    const otherKind = chance(0.35) ? weighted<"cat" | "dog">([["cat", 60], ["dog", 40]]) : null
    const experience = weighted<Experience>([["none", 30], ["some", 45], ["experienced", 25]])
    const preferredTime = weighted<VisitTime>([["weekend", 55], ["weekday-evening", 35], ["weekday-morning", 10]])
    const comment = chance(0.45) ? (hasKids && chance(0.4) ? pick(kidsComments) : pick(commentsPool)) : undefined
    return {
      city: weighted(cities),
      housing,
      hasKids,
      hasOtherPets: !!otherKind,
      otherPetsNote: otherKind ? pick(otherPetsNotes[otherKind]) : undefined,
      otherKind,
      experience,
      preferredTime,
      comment,
    }
  }

  /** Причина отказа — из того, что не сошлось в анкете, иначе одна из типичных */
  function rejectReason(pet: Pet, a: ReturnType<typeof answers>) {
    if (a.otherKind === "cat" && pet.goodWithCats === "no") return "Питомец не ладит с кошками, а дома уже живёт кошка. Предложили посмотреть других."
    if (a.otherKind === "dog" && pet.goodWithDogs === "no") return "Питомец конфликтует с собаками, а дома уже есть собака. Предложили других."
    if (a.hasKids && pet.goodWithKids === "no") return "Питомец побаивается маленьких детей — в семье с малышами ему будет тяжело."
    if (a.housing === "apartment" && pet.species === "dog" && pet.size === "large")
      return "Крупной активной собаке будет тесно в небольшой квартире. Предложили собак поменьше."
    if (a.experience === "none" && pet.specialNeeds) return "Питомцу нужен особый уход, для первого опыта это сложно. Подобрали более простых кандидатов."
    return pick(genericRejects)
  }

  const out: NewApplication[] = [...recent]
  const add = (
    pet: Pet,
    createdDaysAgo: number,
    status: Application["status"],
    note?: string,
    decidedDaysAgo?: number,
  ) => {
    const a = answers(pet)
    const createdAt = at(createdDaysAgo)
    const decidedAt = status === "pending" ? undefined : at(decidedDaysAgo ?? Math.max(createdDaysAgo - between(0.5, 5), 0.2))
    const comments: StaffComment[] = []
    if (status === "rejected") comments.push({ author: pick(staff), text: note ?? rejectReason(pet, a), at: decidedAt! })
    if (status === "cancelled" && chance(0.6)) comments.push({ author: pick(staff), text: pick(cancelReasons), at: decidedAt! })
    if (status === "approved") {
      comments.push({ author: pick(staff), text: "Позвонили, договорились о знакомстве в приюте.", at: at(createdDaysAgo - 0.8) })
      comments.push({ author: pick(staff), text: note ?? pick(approvedNotes), at: decidedAt! })
    }
    const { otherKind: _k, ...rest } = a
    out.push({ ...person(), ...rest, petId: pet.id, status, staffComments: comments, createdAt, decidedAt })
  }

  // 1. Счастливые истории: одобренная заявка перед отъездом домой
  for (const pet of pets.filter((p) => p.adoptedAt)) {
    const home = ago(pet.adoptedAt!)
    add(pet, home + between(5, 10), "approved", undefined, home + between(1, 3))
  }

  // 2. Обычный поток заявок: растёт от ~3 до ~8 в неделю, в выходные больше
  const perPet = new Map<string, number>()
  for (let d = TO_DAYS; d >= 1; d--) {
    const weekday = new Date(now - d * DAY).getDay()
    const growth = 0.4 + 0.75 * Math.min(1, (TO_DAYS - d) / (TO_DAYS - RECENT_DAYS))
    const rate = growth * (weekday === 0 || weekday === 6 ? 1.5 : 0.85) * (d < RECENT_DAYS ? 0.45 : 1)
    let n = 0
    // Пуассон по Кнуту
    for (let L = Math.exp(-rate), p = rnd(); p > L; p *= rnd()) n++
    for (let i = 0; i < n; i++) {
      const createdDaysAgo = d - rnd() * 0.9
      const candidates = pets.filter(
        (p) => ago(p.addedAt) > createdDaysAgo && (!p.adoptedAt || ago(p.adoptedAt) < createdDaysAgo - 2),
      )
      if (candidates.length === 0) continue
      const pet = weighted(
        candidates.map((p): [Pet, number] => {
          const m = ageInMonths(p.birthDate)
          // Чем больше заявок у питомца уже было, тем реже на него пишут снова
          const seen = perPet.get(p.id) ?? 0
          return [p, ((m < 12 ? 1.6 : m > 84 ? 0.5 : 1) * (p.specialNeeds ? 0.5 : 1) * (p.species === "dog" && p.size === "small" ? 1.3 : 1)) / (1 + seen)]
        }),
      )
      perPet.set(pet.id, (perPet.get(pet.id) ?? 0) + 1)
      // Свежие ещё рассматриваем, по старым решение уже принято
      const pending = createdDaysAgo < 1.5 || (createdDaysAgo < 6 && chance(0.7)) || (createdDaysAgo < 20 && chance(0.15))
      const status = pending ? "pending" : weighted<Application["status"]>([["rejected", 60], ["cancelled", 40]])
      add(pet, createdDaysAgo, status)
    }
  }

  // 3. У Анны (демо-пользователь) — старая отозванная заявка, чтобы в кабинете была история
  const leva = pets.find((p) => p.id === "leva")
  if (leva) {
    out.push({
      petId: leva.id, userId: "u-anna", name: "Анна Смирнова", phone: "+7 (921) 555-12-34", email: "anna@example.com", city: "Санкт-Петербург",
      housing: "house", hasKids: true, hasOtherPets: false, experience: "some", preferredTime: "weekend", status: "cancelled",
      staffComments: [{ author: "Светлана Орлова", text: "Анна отозвала заявку: решили сначала закончить ремонт.", at: at(38) }],
      createdAt: at(41), decidedAt: at(38),
    })
  }

  // Номера по порядку поступления; новые заявки продолжат нумерацию с seq
  const sorted = out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const applications: Application[] = sorted.map((a, i) => ({ id: `A-${FIRST_ID + i}`, ...a })).reverse()
  return { applications, seq: FIRST_ID + sorted.length }
}
