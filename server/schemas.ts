/* Проверка входных данных API. Сообщения — те же человеческие формулировки, что в формах. */
import { z } from "zod"

// Стандартные сообщения zod («поле обязательно» и т. п.) — по-русски
z.config(z.locales.ru())

const phone = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, "").length === 11, { error: "Кажется, в номере не хватает цифр" })
const email = z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }).max(254)
const name = z.string().trim().min(2, { error: "Нужно хотя бы 2 буквы" }).max(80)
const id = z.string().regex(/^[a-z0-9-]{1,60}$/, { error: "Некорректный идентификатор" })

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Введите пароль" }).max(200),
})

export const registerSchema = z.object({
  name,
  email,
  password: z.string().min(8, { error: "Пароль — минимум 8 символов" }).max(200),
})

export const profileSchema = z
  .object({
    name,
    email,
    phone: z.union([z.literal(""), phone]),
    city: z.string().trim().max(80),
    notify: z.object({ newPets: z.boolean(), applicationUpdates: z.boolean(), email: z.boolean() }),
  })
  .partial()

export const favoritesSchema = z.object({ favorites: z.array(id).max(200) })

export const applicationSchema = z
  .object({
    petId: id,
    name,
    phone,
    email,
    city: z.string().trim().min(2, { error: "Укажите город" }).max(80),
    housing: z.enum(["apartment", "house", "other"], { error: "Выберите тип жилья" }),
    hasOtherPets: z.boolean(),
    otherPetsNote: z.string().trim().max(300).optional(),
    experience: z.enum(["none", "some", "experienced"], { error: "Выберите вариант" }),
    comment: z.string().trim().max(1000, { error: "Давайте уместимся в 1000 символов" }).optional(),
    preferredTime: z.enum(["weekday-morning", "weekday-evening", "weekend"], { error: "Когда вам удобно приехать?" }),
  })
  .refine((d) => !d.hasOtherPets || (d.otherPetsNote?.length ?? 0) >= 2, {
    path: ["otherPetsNote"],
    error: "Расскажите в двух словах, кто живёт с вами",
  })

export const applicationStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
})

export const commentSchema = z.object({ text: z.string().trim().min(1, { error: "Комментарий пустой" }).max(1000) })

const compat = z.enum(["yes", "no", "unknown"])
/** Фото — либо загруженный файл (/uploads/…), либо Unsplash */
const photoUrl = z
  .string()
  .max(500)
  .refine((u) => /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(u) || u.startsWith("https://images.unsplash.com/"), {
    error: "Фото должно быть загружено через форму",
  })

export const petSchema = z.object({
  name: z.string().trim().min(2, { error: "Минимум 2 буквы" }).max(40),
  species: z.enum(["cat", "dog"]),
  sex: z.enum(["male", "female"]),
  birthDate: z.iso.date({ error: "Укажите дату рождения" }).refine((v) => new Date(v).getTime() <= Date.now(), {
    error: "Дата рождения не может быть в будущем",
  }),
  breed: z.string().trim().min(2).max(80),
  size: z.enum(["small", "medium", "large"]),
  coat: z.enum(["short", "long", "none"]),
  weightKg: z.number().positive({ error: "Вес должен быть больше нуля" }).max(100),
  photos: z.array(photoUrl).min(1, { error: "Добавьте хотя бы одно фото" }).max(8),
  traits: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  vaccinated: z.boolean(),
  sterilized: z.boolean(),
  chipped: z.boolean(),
  specialNeeds: z.string().trim().max(500).optional(),
  goodWithKids: compat,
  goodWithCats: compat,
  goodWithDogs: compat,
  story: z.string().trim().min(20, { error: "Расскажите историю хотя бы в паре предложений" }).max(1000),
  careNotes: z.string().trim().max(1000),
  internalNotes: z.string().trim().max(1000).optional(),
  status: z.enum(["available", "reserved", "adopted"]),
})

export const petStatusSchema = z.object({ status: z.enum(["available", "reserved", "adopted"]) })

export const roleSchema = z.object({ role: z.enum(["user", "volunteer", "admin"]) })

export const volunteersSchema = z.object({
  volunteers: z
    .array(
      z.object({
        id: z.string().max(40),
        name,
        phone: z.string().max(40),
        email,
        role: z.enum(["walker", "caretaker", "photographer", "driver"]),
        shifts: z.array(z.object({ day: z.number().int().min(0).max(6), slot: z.enum(["morning", "evening"]) })).max(14),
      }),
    )
    .max(200),
})

export const volunteerRequestSchema = z.object({
  name,
  phone,
  email,
  direction: z.enum(["walker", "caretaker", "photographer", "driver"], { error: "Выберите, чем хотите помогать" }),
  days: z.array(z.string().max(4)).min(1, { error: "Отметьте хотя бы один удобный день" }).max(7),
})

export const subscribeSchema = z.object({ email })

export const feedbackSchema = z.object({
  name,
  email,
  message: z.string().trim().min(10, { error: "Напишите чуть подробнее — хотя бы пару слов" }).max(2000),
})
