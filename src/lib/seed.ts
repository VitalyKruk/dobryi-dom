import type { Application, Pet, User, Volunteer } from "./types"

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
/** Дата рождения «N месяцев назад» — возраст считается от сегодняшнего дня */
const bornMonthsAgo = (m: number) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - m)
  return d.toISOString().slice(0, 10)
}

/** [x, y, zoom]: центр мордочки в долях кадра и приближение для мелких фигурок */
type Focus = [number, number, number]

/** Кадрируем вокруг мордочки, а не по «энтропии» — иначе на вертикальных фото срезается голова */
const photo = (id: string, [x, y, z]: Focus, zoom = 1) =>
  `https://images.unsplash.com/photo-${id}?crop=focalpoint&fp-x=${x}&fp-y=${y}&fp-z=${Math.max(1, z * zoom)}`

type Seed = Omit<Pet, "photos" | "birthDate" | "addedAt" | "vaccinated" | "sterilized" | "chipped"> & {
  photo: string
  focus: Focus
  months: number
  added: number
  vaccinated?: boolean
  sterilized?: boolean
  chipped?: boolean
}

function pet(s: Seed): Pet {
  const { photo: id, focus, months, added, ...rest } = s
  return {
    vaccinated: true,
    sterilized: true,
    chipped: true,
    ...rest,
    // Второй кадр галереи — крупный план той же мордочки
    photos: [photo(id, focus), photo(id, focus, 1.8)],
    birthDate: bornMonthsAgo(months),
    addedAt: daysAgo(added),
  }
}

export const seedPets: Pet[] = [
  // ——— Кошки ———
  pet({
    id: "persik", name: "Персик", species: "cat", sex: "male", months: 38, breed: "Беспородный", size: "medium", coat: "short", weightKg: 5.2,
    photo: "1519052537078-e6302a4968d4", focus: [0.62, 0.42, 1.2], traits: ["Ласковый", "Спокойный", "Мурчалка"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "unknown",
    story: "Персика нашли зимой у подъезда: он сидел на коврике и вежливо ждал, пока кто-нибудь откроет дверь. С тех пор уверен, что все двери открываются ради него.",
    careNotes: "Обычный корм для взрослых кошек, любит лежанки у батареи.", status: "available", added: 40,
  }),
  pet({
    id: "musya", name: "Муся", species: "cat", sex: "female", months: 4, breed: "Беспородная", size: "small", coat: "short", weightKg: 1.6,
    photo: "1529778873920-4da4926a72c2", focus: [0.45, 0.27, 1], traits: ["Любопытная", "Игривая"], sterilized: false,
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Муся приехала к нам из дачного посёлка вместе с братьями. Братья уже дома, а Муся всё ещё изучает мир — и очень ждёт, чтобы кто-то изучал его вместе с ней.",
    careNotes: "Корм для котят 3–4 раза в день. Стерилизация — по возрасту, приют поможет.", status: "available", added: 3,
  }),
  pet({
    id: "graf", name: "Граф", species: "cat", sex: "male", months: 62, breed: "Беспородный", size: "medium", coat: "short", weightKg: 5.8,
    photo: "1514888286974-6c03e2ca1dba", focus: [0.52, 0.28, 1], traits: ["Независимый", "Спокойный", "Умный"],
    goodWithKids: "unknown", goodWithCats: "no", goodWithDogs: "no",
    story: "Граф жил у пожилой хозяйки, пока она не переехала к детям. Он настоящий аристократ: любит тишину, порядок и чтобы гладили строго по расписанию.",
    careNotes: "Лучше единственным питомцем в доме. Нужна пара недель на адаптацию.", status: "available", added: 95,
    internalNotes: "Не любит переноски — брать вдвоём.",
  }),
  pet({
    id: "mandarin", name: "Мандарин", species: "cat", sex: "male", months: 26, breed: "Мейн-кун (метис)", size: "large", coat: "long", weightKg: 7.4,
    photo: "1573865526739-10659fec78a5", focus: [0.36, 0.4, 1.1], traits: ["Дружелюбный", "Разговорчивый", "Большой"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Мандарин — большой рыжий кот с характером плюшевой игрушки. Встречает всех у двери и рассказывает, как прошёл его день.",
    careNotes: "Длинную шерсть нужно вычёсывать 2–3 раза в неделю.", status: "available", added: 10,
  }),
  pet({
    id: "snezhka", name: "Снежка", species: "cat", sex: "female", months: 14, breed: "Беспородная", size: "medium", coat: "long", weightKg: 3.6,
    photo: "1606214174585-fe31582dc6ee", focus: [0.5, 0.5, 1], traits: ["Нежная", "Спокойная"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "unknown",
    story: "Снежку сдали в приют, когда у хозяйки появилась аллергия. Она очень ждёт новый дом и тёплые колени.",
    careNotes: "Регулярное вычёсывание. Чистит уши раз в неделю.", status: "available", added: 21,
  }),
  pet({
    id: "tuchka", name: "Тучка", species: "cat", sex: "female", months: 28, breed: "Британская (метис)", size: "medium", coat: "short", weightKg: 4.1,
    photo: "1494256997604-768d1f608cac", focus: [0.6, 0.4, 1.3], traits: ["Стеснительная", "Ласковая"],
    goodWithKids: "no", goodWithCats: "yes", goodWithDogs: "no",
    story: "Тучка поначалу прячется под пледом — но стоит дать ей пару дней, и она выходит мурчать на подушку рядом.",
    careNotes: "Лучше дом без маленьких детей и громких звуков. Нужны укрытия.", status: "available", added: 60,
    specialNeeds: "Пугливая: нужна спокойная обстановка и терпение первые недели.",
  }),
  pet({
    id: "vasilisa", name: "Василиса", species: "cat", sex: "female", months: 50, breed: "Беспородная", size: "medium", coat: "short", weightKg: 4.4,
    photo: "1518791841217-8f162f1e1131", focus: [0.36, 0.33, 1.1], traits: ["Умная", "Ласковая", "Спокойная"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Василису нашли на стройке с котятами. Котята давно пристроены, теперь её очередь.",
    careNotes: "Без особенностей. Любит когтеточки-столбики.", status: "reserved", added: 33,
  }),
  pet({
    id: "ryzhik", name: "Рыжик", species: "cat", sex: "male", months: 88, breed: "Беспородный", size: "medium", coat: "short", weightKg: 6.1,
    photo: "1511044568932-338cba0ad803", focus: [0.6, 0.45, 1.2], traits: ["Спокойный", "Ласковый", "Соня"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "unknown",
    story: "Рыжику семь лет, и он уверен, что лучшее в жизни — это солнечный подоконник. Ищет дом, где подоконник будет его.",
    careNotes: "Лечебный корм для почек, контроль у ветеринара раз в полгода.", status: "available", added: 180,
    specialNeeds: "Хроническая болезнь почек в ремиссии: нужен лечебный корм.",
  }),
  pet({
    id: "knopka", name: "Кнопка", species: "cat", sex: "female", months: 5, breed: "Британская (метис)", size: "small", coat: "short", weightKg: 2.0,
    photo: "1592194996308-7b43878e84a6", focus: [0.5, 0.38, 1.2], traits: ["Игривая", "Активная", "Любопытная"], sterilized: false,
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Кнопка пробует лапой всё: воду, тапки, солнечных зайчиков. Отличная компания для семьи с детьми.",
    careNotes: "Корм для котят. Нужны игрушки — энергии очень много!", status: "available", added: 6,
  }),
  pet({
    id: "baron", name: "Барон", species: "cat", sex: "male", months: 74, breed: "Экзотическая (метис)", size: "medium", coat: "short", weightKg: 5.5,
    photo: "1513245543132-31f507417b26", focus: [0.5, 0.22, 1], traits: ["Важный", "Спокойный"],
    goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "no",
    story: "Барон попал к нам после переезда хозяев за границу. Держится солидно, но за вкусняшку готов на всё.",
    careNotes: "Протирать глаза раз в день — особенность породы.", status: "reserved", added: 48,
  }),
  pet({
    id: "sima", name: "Сима", species: "cat", sex: "female", months: 36, breed: "Беспородная", size: "medium", coat: "long", weightKg: 3.9,
    photo: "1495360010541-f48722b34f7d", focus: [0.42, 0.28, 1.7], traits: ["Дружелюбная", "Любопытная"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Сима всегда первой выходит знакомиться с гостями приюта. Кажется, она уже выбрала — осталось, чтобы выбрали её.",
    careNotes: "Вычёсывание раз в неделю.", status: "available", added: 25,
  }),
  pet({
    id: "pirat", name: "Пират", species: "cat", sex: "male", months: 22, breed: "Беспородный", size: "medium", coat: "short", weightKg: 4.8,
    photo: "1574158622682-e40e69881006", focus: [0.55, 0.35, 1], traits: ["Активный", "Смелый"],
    goodWithKids: "unknown", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Пирата сняли с дерева спасатели. Высоты он по-прежнему не боится — зато теперь очень любит людей.",
    careNotes: "Нужен игровой комплекс и сетки на окнах — обязательно!", status: "available", added: 12,
  }),
  pet({
    id: "zefir", name: "Зефир", species: "cat", sex: "male", months: 13, breed: "Беспородный", size: "medium", coat: "short", weightKg: 4.2,
    photo: "1596854407944-bf87f6fdd49e", focus: [0.26, 0.3, 1.6], traits: ["Дружелюбный", "Игривый"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "unknown",
    story: "Зефир — подросток с хвостом-трубой и бесконечным интересом ко всему, что шуршит.",
    careNotes: "Без особенностей.", status: "available", added: 2,
  }),

  // ——— Собаки ———
  pet({
    id: "bublik", name: "Бублик", species: "dog", sex: "male", months: 27, breed: "Бигль (метис)", size: "medium", coat: "short", weightKg: 13,
    photo: "1543466835-00a7907e9de1", focus: [0.45, 0.4, 1], traits: ["Весёлый", "Активный", "Дружелюбный"],
    goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "yes",
    story: "Бублик улыбается всем подряд и отлично ходит на поводке. Идеальный напарник для прогулок по парку.",
    careNotes: "Минимум две длинные прогулки в день. Любит нюхательные коврики.", status: "available", added: 15,
  }),
  pet({
    id: "laki", name: "Лаки", species: "dog", sex: "male", months: 50, breed: "Джек-рассел (метис)", size: "small", coat: "short", weightKg: 8,
    photo: "1477884213360-7e9d7dcc1e48", focus: [0.5, 0.35, 1], traits: ["Энергичный", "Умный", "Весёлый"],
    goodWithKids: "yes", goodWithCats: "no", goodWithDogs: "yes",
    story: "Лаки знает команды «сидеть», «лежать» и «дай лапу» — и готов выучить ещё десяток за кусочек сыра.",
    careNotes: "Активные игры, аджилити приветствуется.", status: "available", added: 70,
  }),
  pet({
    id: "richi", name: "Ричи", species: "dog", sex: "male", months: 38, breed: "Ретривер (метис)", size: "medium", coat: "long", weightKg: 19,
    photo: "1530281700549-e82e7bf110d6", focus: [0.45, 0.45, 1.4], traits: ["Активный", "Дружелюбный", "Обожает воду"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Ричи найден на берегу залива. С тех пор ни одна лужа не осталась без его внимания.",
    careNotes: "Много движения, плавание — лучший подарок.", status: "available", added: 30,
  }),
  pet({
    id: "dzhessi", name: "Джесси", species: "dog", sex: "female", months: 62, breed: "Бордер-колли (метис)", size: "medium", coat: "long", weightKg: 17,
    photo: "1587300003388-59208cc962cb", focus: [0.5, 0.4, 1], traits: ["Умная", "Преданная", "Активная"],
    goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "yes",
    story: "Джесси жила в деревне и пасла кур. Теперь ищет семью, которая займёт её умную голову задачками.",
    careNotes: "Нужны интеллектуальные игры и занятия, иначе заскучает.", status: "available", added: 55,
  }),
  pet({
    id: "sanni", name: "Санни", species: "dog", sex: "female", months: 3, breed: "Ретривер (метис)", size: "large", coat: "long", weightKg: 6,
    photo: "1611003228941-98852ba62227", focus: [0.55, 0.45, 1.2], traits: ["Ласковая", "Игривая"], sterilized: false,
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Санни — солнечный щенок, который засыпает прямо посреди игры. Вырастет большой и очень доброй.",
    careNotes: "Щенячьи прививки завершены. Нужна социализация и курс ОКД.", status: "available", added: 4,
  }),
  pet({
    id: "baddi", name: "Бадди", species: "dog", sex: "male", months: 5, breed: "Ретривер (метис)", size: "large", coat: "long", weightKg: 11,
    photo: "1507146426996-ef05306b995a", focus: [0.45, 0.32, 1.1], traits: ["Игривый", "Дружелюбный"], sterilized: false,
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Бадди нашли в коробке у ветклиники. Он уже выучил своё имя и команду «ко мне».",
    careNotes: "Щенок: много сна, игр и обучения.", status: "reserved", added: 9,
  }),
  pet({
    id: "funtik", name: "Фунтик", species: "dog", sex: "male", months: 98, breed: "Мопс", size: "small", coat: "short", weightKg: 9,
    photo: "1517849845537-4d257902454a", focus: [0.5, 0.6, 1], traits: ["Спокойный", "Ласковый", "Диванный"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Фунтику восемь, и он точно знает, что лучшая прогулка — короткая, а лучший диван — рядом с человеком.",
    careNotes: "Не перегревать, прогулки в прохладное время. Контроль веса.", status: "available", added: 120,
    specialNeeds: "Брахицефал: избегать жары и долгих нагрузок.",
  }),
  pet({
    id: "marta", name: "Марта", species: "dog", sex: "female", months: 72, breed: "Кавалер-кинг-чарльз-спаниель", size: "small", coat: "long", weightKg: 7,
    photo: "1560807707-8cc77767d783", focus: [0.5, 0.72, 1], traits: ["Нежная", "Ласковая", "Спокойная"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Марта — компаньон до кончиков ушей. Ей нужно одно: быть рядом со своим человеком.",
    careNotes: "Плановое наблюдение у кардиолога раз в год.", status: "available", added: 44,
  }),
  pet({
    id: "tosha", name: "Тоша", species: "dog", sex: "male", months: 15, breed: "Терьер (метис)", size: "small", coat: "short", weightKg: 7,
    photo: "1561037404-61cd46aa615b", focus: [0.5, 0.35, 1], traits: ["Весёлый", "Смелый"],
    goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "yes",
    story: "Тоша попал к нам с трассы. Он пережил многое, но не разучился радоваться каждому человеку.",
    careNotes: "Без особенностей, любит мячики.", status: "available", added: 18,
  }),
  pet({
    id: "lisa", name: "Лиса", species: "dog", sex: "female", months: 7, breed: "Корги (метис)", size: "small", coat: "short", weightKg: 8,
    photo: "1537151625747-768eb6cf92b2", focus: [0.55, 0.45, 1], traits: ["Игривая", "Любопытная", "Умная"], sterilized: false,
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Лиса уши держит локаторами и слышит шуршание пакета с лакомством из любой комнаты.",
    careNotes: "Контроль веса и умеренные прыжки — бережём спину.", status: "available", added: 5,
  }),
  pet({
    id: "baks", name: "Бакс", species: "dog", sex: "male", months: 26, breed: "Французский бульдог", size: "small", coat: "short", weightKg: 12,
    photo: "1583511655857-d19b40a7a54e", focus: [0.55, 0.45, 1.8], traits: ["Дружелюбный", "Упрямый", "Смешной"],
    goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "yes",
    story: "Бакса оставили у ворот приюта с запиской «Он хороший». Мы проверили — правда хороший.",
    careNotes: "Не перегревать, зимой — комбинезон.", status: "available", added: 28,
    specialNeeds: "Брахицефал: избегать жары.",
  }),
  pet({
    id: "alma", name: "Альма", species: "dog", sex: "female", months: 50, breed: "Золотистый ретривер", size: "large", coat: "long", weightKg: 27,
    photo: "1552053831-71594a27632d", focus: [0.45, 0.4, 1.3], traits: ["Ласковая", "Воспитанная"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Альма приносит цветы всем, кто ей нравится. Нам она уже принесла целый букет.",
    careNotes: "Регулярное вычёсывание и активные прогулки.", status: "reserved", added: 38,
  }),
  pet({
    id: "umka", name: "Умка", species: "dog", sex: "male", months: 110, breed: "Ретривер (метис)", size: "large", coat: "long", weightKg: 30,
    photo: "1558788353-f76d92427f16", focus: [0.5, 0.45, 1], traits: ["Мудрый", "Спокойный", "Ласковый"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Умке девять лет, и он самый спокойный житель приюта. Мечтает провести оставшиеся годы на мягкой лежанке в семье.",
    careNotes: "Препараты для суставов, неспешные прогулки.", status: "available", added: 210,
    specialNeeds: "Артрит: нужны хондропротекторы и прогулки без нагрузки.",
  }),
  pet({
    id: "professor", name: "Профессор", species: "dog", sex: "male", months: 70, breed: "Ретривер (метис)", size: "medium", coat: "long", weightKg: 21,
    photo: "1535930891776-0c2dfb7fda1a", focus: [0.6, 0.38, 1.2], traits: ["Умный", "Спокойный", "Послушный"],
    goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Профессор получил прозвище за серьёзный взгляд и привычку лежать на журналах волонтёров.",
    careNotes: "Без особенностей.", status: "available", added: 65,
  }),

  // ——— Уже дома ———
  pet({
    id: "leva", name: "Лёва", species: "cat", sex: "male", months: 30, breed: "Беспородный", size: "medium", coat: "short", weightKg: 5,
    photo: "1543852786-1cf6624b9987", focus: [0.45, 0.3, 1], traits: ["Весёлый"], goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Лёва уехал домой к семье Кравцовых.", careNotes: "", status: "adopted", added: 90,
  }),
  pet({
    id: "sonya", name: "Соня", species: "cat", sex: "female", months: 20, breed: "Беспородная", size: "medium", coat: "short", weightKg: 3.8,
    photo: "1541781774459-bb2af2f05b55", focus: [0.47, 0.55, 1.6], traits: ["Соня"], goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "unknown",
    story: "Соня нашла дом весной.", careNotes: "", status: "adopted", added: 150,
  }),
  pet({
    id: "charli", name: "Чарли", species: "dog", sex: "male", months: 40, breed: "Йоркширский терьер (метис)", size: "small", coat: "long", weightKg: 4,
    photo: "1548199973-03cce0bbc87b", focus: [0.6, 0.38, 1.3], traits: ["Весёлый"], goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Чарли уехал домой вместе с лучшей подругой.", careNotes: "", status: "adopted", added: 200,
  }),
  pet({
    id: "nika", name: "Ника", species: "dog", sex: "female", months: 8, breed: "Ретривер (метис)", size: "large", coat: "long", weightKg: 14,
    photo: "1576201836106-db1758fd1c97", focus: [0.55, 0.5, 2], traits: ["Игривая"], goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Ника теперь живёт в загородном доме.", careNotes: "", status: "adopted", added: 100,
  }),
  pet({
    id: "bonya", name: "Боня", species: "dog", sex: "female", months: 34, breed: "Французский бульдог", size: "small", coat: "short", weightKg: 11,
    photo: "1583337130417-3346a1be7dee", focus: [0.62, 0.45, 1], traits: ["Модница"], goodWithKids: "yes", goodWithCats: "yes", goodWithDogs: "yes",
    story: "Боня уехала домой в новом жёлтом худи.", careNotes: "", status: "adopted", added: 130,
  }),
  pet({
    id: "keks", name: "Кекс", species: "dog", sex: "male", months: 18, breed: "Французский бульдог", size: "small", coat: "short", weightKg: 12,
    photo: "1598133894008-61f7fdb8cc3a", focus: [0.42, 0.6, 1.1], traits: ["Дружелюбный"], goodWithKids: "yes", goodWithCats: "unknown", goodWithDogs: "yes",
    story: "Кекс нашёл дом летом.", careNotes: "", status: "adopted", added: 160,
  }),
]

/** Пристроено за всё время до запуска сайта (для счётчика на главной) */
export const ADOPTED_BEFORE_SITE = 121

export const DEMO_PASSWORD = "demo1234"

export const seedUsers: User[] = [
  {
    id: "u-anna", name: "Анна Смирнова", email: "anna@example.com", phone: "+7 (921) 555-12-34", city: "Санкт-Петербург",
    role: "user", favorites: ["persik", "richi", "musya"], notify: { newPets: true, applicationUpdates: true, email: true },
  },
  {
    id: "u-ivan", name: "Иван Петров", email: "ivan@dobryi-dom.ru", phone: "+7 (911) 222-33-44", city: "Санкт-Петербург",
    role: "volunteer", favorites: [], notify: { newPets: false, applicationUpdates: true, email: true },
  },
  {
    id: "u-olga", name: "Ольга Васильева", email: "olga@dobryi-dom.ru", phone: "+7 (900) 111-22-33", city: "Санкт-Петербург",
    role: "admin", favorites: [], notify: { newPets: false, applicationUpdates: true, email: true },
  },
]

export const seedApplications: Application[] = [
  {
    id: "A-1042", petId: "richi", userId: "u-anna", name: "Анна Смирнова", phone: "+7 (921) 555-12-34", email: "anna@example.com", city: "Санкт-Петербург",
    housing: "house", hasOtherPets: false, experience: "some", comment: "Живём за городом, рядом озеро — Ричи понравится!", preferredTime: "weekend",
    status: "pending", staffComments: [], createdAt: daysAgo(1),
  },
  {
    id: "A-1031", petId: "vasilisa", userId: "u-anna", name: "Анна Смирнова", phone: "+7 (921) 555-12-34", email: "anna@example.com", city: "Санкт-Петербург",
    housing: "house", hasOtherPets: false, experience: "some", preferredTime: "weekday-evening",
    status: "approved", staffComments: [{ author: "Ольга Васильева", text: "Ждём вас в субботу в 12:00, возьмите переноску 🙂", at: daysAgo(3) }], createdAt: daysAgo(6),
  },
  {
    id: "A-1044", petId: "bublik", name: "Дмитрий Орлов", phone: "+7 (912) 345-67-89", email: "orlov@example.com", city: "Санкт-Петербург",
    housing: "apartment", hasOtherPets: true, otherPetsNote: "Кошка 5 лет, спокойная", experience: "experienced", preferredTime: "weekend",
    status: "pending", staffComments: [], createdAt: daysAgo(0.3),
  },
  {
    id: "A-1043", petId: "mandarin", name: "Екатерина Лебедева", phone: "+7 (905) 111-00-22", email: "kate.l@example.com", city: "Пушкин",
    housing: "apartment", hasOtherPets: false, experience: "none", comment: "Давно мечтаем о рыжем коте!", preferredTime: "weekday-evening",
    status: "pending", staffComments: [{ author: "Иван Петров", text: "Позвонил, договорились на четверг.", at: daysAgo(0.5) }], createdAt: daysAgo(2),
  },
  {
    id: "A-1038", petId: "alma", name: "Сергей Никитин", phone: "+7 (931) 765-43-21", email: "nikitin@example.com", city: "Санкт-Петербург",
    housing: "house", hasOtherPets: true, otherPetsNote: "Лабрадор 3 года", experience: "experienced", preferredTime: "weekend",
    status: "approved", staffComments: [], createdAt: daysAgo(5),
  },
  {
    id: "A-1036", petId: "baron", name: "Мария Козлова", phone: "+7 (921) 000-11-22", email: "kozlova@example.com", city: "Колпино",
    housing: "apartment", hasOtherPets: false, experience: "some", preferredTime: "weekday-morning",
    status: "approved", staffComments: [], createdAt: daysAgo(8),
  },
  {
    id: "A-1029", petId: "laki", name: "Павел Громов", phone: "+7 (999) 888-77-66", email: "gromov@example.com", city: "Санкт-Петербург",
    housing: "apartment", hasOtherPets: true, otherPetsNote: "Две кошки", experience: "some", preferredTime: "weekend",
    status: "rejected", staffComments: [{ author: "Ольга Васильева", text: "Лаки не ладит с кошками — предложили посмотреть Тошу.", at: daysAgo(9) }], createdAt: daysAgo(12),
  },
  {
    id: "A-1045", petId: "sanni", name: "Ирина Фёдорова", phone: "+7 (904) 222-11-00", email: "irina.f@example.com", city: "Гатчина",
    housing: "house", hasOtherPets: false, experience: "some", comment: "Есть большой огороженный участок.", preferredTime: "weekend",
    status: "pending", staffComments: [], createdAt: daysAgo(0.1),
  },
  {
    id: "A-1040", petId: "baddi", name: "Алексей Морозов", phone: "+7 (911) 999-00-11", email: "morozov@example.com", city: "Санкт-Петербург",
    housing: "apartment", hasOtherPets: false, experience: "none", preferredTime: "weekday-evening",
    status: "approved", staffComments: [], createdAt: daysAgo(4),
  },
]

export const seedVolunteers: Volunteer[] = [
  { id: "v1", name: "Иван Петров", phone: "+7 (911) 222-33-44", email: "ivan@dobryi-dom.ru", role: "walker", shifts: [{ day: 0, slot: "morning" }, { day: 2, slot: "morning" }, { day: 5, slot: "evening" }] },
  { id: "v2", name: "Алина Соколова", phone: "+7 (921) 101-20-30", email: "alina@example.com", role: "caretaker", shifts: [{ day: 1, slot: "morning" }, { day: 3, slot: "morning" }] },
  { id: "v3", name: "Максим Волков", phone: "+7 (931) 404-50-60", email: "maxim@example.com", role: "driver", shifts: [{ day: 5, slot: "morning" }] },
  { id: "v4", name: "Дарья Новикова", phone: "+7 (905) 707-80-90", email: "dasha@example.com", role: "photographer", shifts: [{ day: 6, slot: "morning" }, { day: 6, slot: "evening" }] },
  { id: "v5", name: "Тимур Ахметов", phone: "+7 (999) 303-40-50", email: "timur@example.com", role: "walker", shifts: [{ day: 1, slot: "evening" }, { day: 3, slot: "evening" }, { day: 4, slot: "evening" }] },
  { id: "v6", name: "Полина Зайцева", phone: "+7 (912) 606-70-80", email: "polina@example.com", role: "caretaker", shifts: [{ day: 4, slot: "morning" }, { day: 0, slot: "evening" }] },
]

export const reviews = [
  { name: "Семья Кравцовых", petId: "leva", text: "Лёва за неделю стал главным в доме. Спасибо волонтёрам, что так подробно рассказали про его привычки — адаптация прошла легко." },
  { name: "Наталья и Чарли", petId: "charli", text: "Шли «просто посмотреть», уехали с Чарли. Процесс оказался совсем не страшным: заявка, знакомство, и через три дня он уже спал на нашем диване." },
  { name: "Олег, хозяин Бони", petId: "bonya", text: "Приют помог даже после усыновления — подсказали ветеринара и корм. Чувствуешь, что тебя не бросают." },
]

export const partners = ["ВетКлиника «Айболит»", "Зоомагазин «Хвосты»", "Корм «Сытый нос»", "Грумминг «Пушистик»", "Фонд «Лапа помощи»"]

export const team = [
  { name: "Ольга Васильева", role: "Директор приюта", about: "Основала «Добрый дом» в 2016 году с тремя вольерами." },
  { name: "Андрей Ким", role: "Ветеринарный врач", about: "Следит за здоровьем всех хвостов и отвечает на ваши вопросы." },
  { name: "Иван Петров", role: "Координатор волонтёров", about: "Составляет расписание и знает, кто из собак любит лужи." },
  { name: "Светлана Орлова", role: "Куратор пристройства", about: "Помогает подобрать питомца и остаётся на связи после." },
]

export const needs = [
  { title: "Сухой корм для взрослых кошек", unit: "кг", have: 12, goal: 40 },
  { title: "Корм для щенков", unit: "кг", have: 18, goal: 30 },
  { title: "Наполнитель древесный", unit: "мешков", have: 6, goal: 20 },
  { title: "Одноразовые пелёнки 60×90", unit: "шт.", have: 150, goal: 300 },
  { title: "Старые пледы и полотенца", unit: "шт.", have: 22, goal: 50 },
  { title: "Поводки и шлейки", unit: "шт.", have: 4, goal: 15 },
]
