/*
 * REST API «Добрый дом». Все ответы — JSON; ошибки — { error, fields? } с кодом 4xx/5xx.
 * createApp не слушает порт — так его удобно поднимать в тестах.
 */
import { randomBytes } from "node:crypto"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import express, { type Request } from "express"
import { ADOPTED_BEFORE_SITE } from "../src/lib/seed.ts"
import { isEmptyProfile, matchPets, profileFromApplication, profileFromFavorites, type MatchProfile } from "../src/lib/match.ts"
import { featuredPets, filtersFromQuery, matchesFilters, similarPets, sortPets } from "../src/lib/pets-query.ts"
import type { Application, InvestorReport, Pet, Species, User } from "../src/lib/types.ts"
import { buildAnalytics } from "./analytics.ts"
import { authenticate, can, hashPassword, hashToken, newToken, requirePermission, requireUser, verifyPassword } from "./auth.ts"
import { errorHandler, HttpError, parse } from "./errors.ts"
import * as s from "./schemas.ts"
import type { Store } from "./store.ts"

const now = () => new Date().toISOString()

/** Внутренние заметки видит только персонал */
function publicPet(pet: Pet, viewer?: User): Pet {
  if (can(viewer, "pets.status")) return pet
  const { internalNotes: _hidden, ...rest } = pet
  return rest
}

function slugify(name: string, taken: (id: string) => boolean) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya",
  }
  const base =
    name
      .toLowerCase()
      .split("")
      .map((c) => map[c] ?? (/[a-z0-9]/.test(c) ? c : c === " " ? "-" : ""))
      .join("")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "pet"
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  return id
}

/** Сигнатуры файлов: по расширению или Content-Type верить нельзя */
function detectImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp"
  return null
}

export function createApp(store: Store) {
  const app = express()
  app.disable("x-powered-by")
  app.set("trust proxy", "loopback")
  app.use(express.json({ limit: "200kb" }))
  app.use(authenticate(store))

  const db = () => store.db

  // Демо-режим интерфейса (?demo=…): заголовок X-Demo от клиента.
  // error — настоящий HTTP 503, slow — задержка, empty — пустые списки.
  app.use("/api", async (req, _res, next) => {
    const mode = req.get("x-demo")
    if (req.path === "/health") return next()
    if (mode === "slow") await new Promise((r) => setTimeout(r, 2500))
    if (mode === "error") return next(new HttpError(503, "Сервер не отвечает. Проверьте соединение и попробуйте ещё раз."))
    next()
  })
  const demoEmpty = (req: Request) => req.get("x-demo") === "empty"

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, pets: db().pets.length })
  })

  // ——— Питомцы ———

  app.get("/api/pets", (req, res) => {
    const viewer = req.user
    if (typeof req.query.ids === "string") {
      const ids = req.query.ids.split(",").slice(0, 200)
      const items = demoEmpty(req) ? [] : db().pets.filter((p) => ids.includes(p.id))
      res.json({ items: items.map((p) => publicPet(p, viewer)), total: items.length })
      return
    }
    const filters = filtersFromQuery(req.query as Record<string, unknown>)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(48, Math.max(1, Number(req.query.pageSize) || 12))
    const all = demoEmpty(req) ? [] : sortPets(db().pets.filter((p) => matchesFilters(p, filters)), filters.sort)
    res.json({ items: all.slice((page - 1) * pageSize, page * pageSize).map((p) => publicPet(p, viewer)), total: all.length })
  })

  app.get("/api/pets/count", (req, res) => {
    const filters = filtersFromQuery(req.query as Record<string, unknown>)
    res.json({ count: demoEmpty(req) ? 0 : db().pets.filter((p) => matchesFilters(p, filters)).length })
  })

  app.get("/api/pets/featured", (req, res) => {
    const limit = Math.min(12, Number(req.query.limit) || 6)
    res.json(demoEmpty(req) ? [] : featuredPets(db().pets, limit).map((p) => publicPet(p, req.user)))
  })

  app.get("/api/pets/:id", (req, res) => {
    const pet = demoEmpty(req) ? undefined : db().pets.find((p) => p.id === req.params.id)
    if (!pet) throw new HttpError(404, "Такого питомца мы не нашли")
    res.json(publicPet(pet, req.user))
  })

  app.get("/api/pets/:id/similar", (req, res) => {
    const pet = db().pets.find((p) => p.id === req.params.id)
    if (!pet) throw new HttpError(404, "Такого питомца мы не нашли")
    res.json(demoEmpty(req) ? [] : similarPets(db().pets, pet, 4).map((p) => publicPet(p, req.user)))
  })

  app.post("/api/pets", async (req, res) => {
    requirePermission(req, "pets.edit")
    const input = parse(s.petSchema, req.body)
    const pet = await store.write((d) => {
      const created: Pet = { ...input, id: slugify(input.name, (id) => d.pets.some((p) => p.id === id)), addedAt: now() }
      d.pets.unshift(created)
      return created
    })
    res.status(201).json(pet)
  })

  app.put("/api/pets/:id", async (req, res) => {
    requirePermission(req, "pets.edit")
    const input = parse(s.petSchema, req.body)
    const pet = await store.write((d) => {
      const i = d.pets.findIndex((p) => p.id === req.params.id)
      if (i < 0) throw new HttpError(404, "Питомец не найден")
      const prev = d.pets[i]
      d.pets[i] = { ...input, id: prev.id, addedAt: prev.addedAt }
      if (input.status === "adopted") d.pets[i].adoptedAt = prev.adoptedAt ?? now()
      return d.pets[i]
    })
    res.json(pet)
  })

  app.patch("/api/pets/:id/status", async (req, res) => {
    requirePermission(req, "pets.status")
    const { status } = parse(s.petStatusSchema, req.body)
    const pet = await store.write((d) => {
      const p = d.pets.find((x) => x.id === req.params.id)
      if (!p) throw new HttpError(404, "Питомец не найден")
      if (status === "adopted" && p.status !== "adopted") p.adoptedAt = now()
      if (status !== "adopted") delete p.adoptedAt
      p.status = status
      return p
    })
    res.json(pet)
  })

  app.delete("/api/pets/:id", async (req, res) => {
    requirePermission(req, "pets.edit")
    await store.write((d) => {
      const before = d.pets.length
      d.pets = d.pets.filter((p) => p.id !== req.params.id)
      if (d.pets.length === before) throw new HttpError(404, "Питомец не найден")
    })
    res.status(204).end()
  })

  app.get("/api/admin/pets", (req, res) => {
    requirePermission(req, "admin.access")
    res.json(demoEmpty(req) ? [] : sortPets(db().pets, "newest"))
  })

  // ——— Загрузка фото ———
  // Тело — сам файл (image/jpeg|png|webp), до 5 МБ. Имя генерирует сервер — путь от клиента не используется.

  app.post(
    "/api/uploads",
    // Права — до чтения тела: анонимный клиент не должен заставлять сервер принимать 5 МБ
    (req, _res, next) => {
      requirePermission(req, "pets.edit")
      next()
    },
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
    async (req, res) => {
      const body = req.body as unknown
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(415, "Загрузите изображение JPG, PNG или WebP")
      }
      const ext = detectImage(body)
      if (!ext) throw new HttpError(415, "Файл не похож на изображение JPG, PNG или WebP")
      const name = `${randomBytes(16).toString("hex")}.${ext}`
      await writeFile(path.join(store.uploadsDir, name), body)
      res.status(201).json({ url: `/uploads/${name}` })
    },
  )

  app.use(
    "/uploads",
    express.static(store.uploadsDir, {
      fallthrough: false,
      immutable: true,
      maxAge: "365d",
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  )

  // ——— Статистика ———

  app.get("/api/stats", (req, res) => {
    const empty = demoEmpty(req)
    const pets = empty ? [] : db().pets
    const apps = empty ? [] : db().applications
    const weekAgo = Date.now() - 7 * 86_400_000
    res.json({
      adopted: (empty ? 0 : ADOPTED_BEFORE_SITE) + pets.filter((p) => p.status === "adopted").length,
      waiting: pets.filter((p) => p.status !== "adopted").length,
      available: pets.filter((p) => p.status === "available").length,
      reserved: pets.filter((p) => p.status === "reserved").length,
      newApplications: apps.filter((a) => new Date(a.createdAt).getTime() > weekAgo).length,
      pendingApplications: apps.filter((a) => a.status === "pending").length,
      volunteers: empty ? 0 : db().volunteers.length,
    })
  })

  /**
   * Раздел для инвесторов: те же расчёты, что на дашборде (buildAnalytics), но только
   * обезличенные агрегаты — без причин отказов, имён питомцев и подсказок команде.
   */
  app.get("/api/investors", (req, res) => {
    const empty = demoEmpty(req)
    const pets = empty ? [] : db().pets
    const apps = empty ? [] : db().applications
    const a = buildAnalytics(pets, apps)
    const report: InvestorReport = {
      generatedAt: now(),
      adoptedBeforeSite: empty ? 0 : ADOPTED_BEFORE_SITE,
      pets: {
        adoptedOnSite: pets.filter((p) => p.status === "adopted").length,
        waiting: pets.filter((p) => p.status !== "adopted").length,
        available: pets.filter((p) => p.status === "available").length,
        reserved: pets.filter((p) => p.status === "reserved").length,
      },
      volunteers: empty ? 0 : db().volunteers.length,
      applicationsAllTime: apps.length,
      dataSince: apps.reduce<string | null>((min, x) => (!min || x.createdAt < min ? x.createdAt : min), null),
      weeks: a.weeks,
      totals: a.totals,
      funnel: a.funnel,
      species: a.species,
    }
    res.json(report)
  })

  /** Дашборд: динамика, воронка, причины отказов и подсказки команде */
  app.get("/api/admin/analytics", (req, res) => {
    requirePermission(req, "applications.view")
    const empty = demoEmpty(req)
    res.json(buildAnalytics(empty ? [] : db().pets, empty ? [] : db().applications))
  })

  // ——— Подбор «Подходят вам» ———
  // Профиль берётся из параметров (?housing=house&kids=yes&other=cat&experience=none&species=dog)
  // или, если их нет, из последней заявки и избранного вошедшего пользователя.

  app.get("/api/recommendations", (req, res) => {
    const q = parse(s.recommendationsQuerySchema, req.query)
    const user = req.user
    const own = user
      ? db()
          .applications.filter((a) => a.userId === user.id || a.email.toLowerCase() === user.email.toLowerCase())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : []
    const favPets = user ? db().pets.filter((p) => user.favorites.includes(p.id)) : []

    const explicit: MatchProfile = {
      housing: q.housing,
      hasKids: q.kids === undefined ? undefined : q.kids === "yes",
      otherPets: q.other?.filter((x): x is Species => x !== "none"),
      experience: q.experience,
      species: q.species as Species[] | undefined,
    }
    const basedOn: string[] = []
    let profile = explicit
    if (isEmptyProfile(explicit)) {
      profile = own[0] ? profileFromApplication(own[0]) : {}
      if (own[0]) basedOn.push(`анкете ${own[0].id}`)
    } else basedOn.push("вашим ответам")
    // Вид и размер — из избранного, если человек не выбрал их явно
    if (!explicit.species?.length && favPets.length) {
      profile = { ...profile, ...profileFromFavorites(favPets) }
      basedOn.push("избранному")
    }

    // Тех, на кого уже есть заявка или кто в избранном, не предлагаем — их человек и так знает
    const exclude = [...(q.exclude ?? []), ...own.map((a) => a.petId), ...favPets.map((p) => p.id)]
    const items = demoEmpty(req) || isEmptyProfile(profile) ? [] : matchPets(db().pets, profile, { limit: q.limit, exclude })
    res.json({
      basedOn,
      profile,
      items: items.map((m) => ({ ...m, pet: publicPet(m.pet, user) })),
    })
  })

  // ——— Заявки ———

  app.post("/api/applications", async (req, res) => {
    const input = parse(s.applicationSchema, req.body)
    const created = await store.write((d) => {
      const pet = d.pets.find((p) => p.id === input.petId)
      if (!pet || pet.status === "adopted") throw new HttpError(404, "Этот питомец уже дома или не найден")
      const email = input.email.toLowerCase()
      const duplicate = d.applications.find(
        (a) => a.petId === input.petId && a.email.toLowerCase() === email && a.status === "pending",
      )
      if (duplicate) {
        throw new HttpError(409, `У вас уже есть заявка на этого питомца (№ ${duplicate.id}) — мы её рассматриваем.`)
      }
      const app: Application = {
        ...input,
        otherPetsNote: input.hasOtherPets ? input.otherPetsNote : undefined,
        userId: req.user?.id, // из токена, а не из тела запроса
        id: `A-${d.seq++}`,
        status: "pending",
        staffComments: [],
        createdAt: now(),
      }
      d.applications.unshift(app)
      return app
    })
    res.status(201).json(created)
  })

  /** Персонал видит все заявки, пользователь — только свои (по аккаунту или email) */
  app.get("/api/applications", (req, res) => {
    const user = requireUser(req)
    const list = demoEmpty(req)
      ? []
      : db().applications.filter(
          (a) => can(user, "applications.view") || a.userId === user.id || a.email.toLowerCase() === user.email.toLowerCase(),
        )
    res.json([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  })

  app.patch("/api/applications/:id/status", async (req, res) => {
    requirePermission(req, "applications.status")
    const { status } = parse(s.applicationStatusSchema, req.body)
    const updated = await store.write((d) => {
      const app = d.applications.find((a) => a.id === req.params.id)
      if (!app) throw new HttpError(404, "Заявка не найдена")
      app.status = status
      if (status === "pending") delete app.decidedAt
      else app.decidedAt = now()
      // Бизнес-правило: одобрение бронирует питомца
      if (status === "approved") {
        const pet = d.pets.find((p) => p.id === app.petId)
        if (pet?.status === "available") pet.status = "reserved"
      }
      return app
    })
    res.json(updated)
  })

  /** Отозвать свою заявку, пока она на рассмотрении */
  app.post("/api/applications/:id/cancel", async (req, res) => {
    const user = requireUser(req)
    const updated = await store.write((d) => {
      const app = d.applications.find((a) => a.id === req.params.id)
      const own = app && (app.userId === user.id || app.email.toLowerCase() === user.email.toLowerCase())
      if (!app || !own) throw new HttpError(404, "Заявка не найдена")
      if (app.status !== "pending") throw new HttpError(409, "Отозвать можно только заявку на рассмотрении")
      app.status = "cancelled"
      app.decidedAt = now()
      return app
    })
    res.json(updated)
  })

  app.post("/api/applications/:id/comments", async (req, res) => {
    const user = requirePermission(req, "applications.view")
    const { text } = parse(s.commentSchema, req.body)
    const updated = await store.write((d) => {
      const app = d.applications.find((a) => a.id === req.params.id)
      if (!app) throw new HttpError(404, "Заявка не найдена")
      app.staffComments.push({ author: user.name, text, at: now() })
      return app
    })
    res.status(201).json(updated)
  })

  // ——— Вход и профиль ———

  async function startSession(userId: string) {
    const token = newToken()
    await store.write((d) => {
      d.sessions.push({ token: hashToken(token), userId, createdAt: now() })
      d.sessions = d.sessions.slice(-500)
    })
    return token
  }

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = parse(s.loginSchema, req.body)
    const user = db().users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    const ok = await verifyPassword(password, user && db().passwords[user.email])
    if (!user || !ok) throw new HttpError(401, "Неверный email или пароль. Попробуйте ещё раз или войдите через демо-аккаунт.")
    res.json({ token: await startSession(user.id), user })
  })

  app.post("/api/auth/register", async (req, res) => {
    const input = parse(s.registerSchema, req.body)
    const email = input.email.toLowerCase()
    const hash = await hashPassword(input.password)
    const user = await store.write((d) => {
      if (d.users.some((u) => u.email.toLowerCase() === email)) {
        throw new HttpError(409, "Этот email уже зарегистрирован — попробуйте войти.")
      }
      const u: User = {
        id: `u-${randomBytes(6).toString("hex")}`,
        name: input.name,
        email,
        role: "user",
        favorites: [],
        notify: { newPets: true, applicationUpdates: true, email: true },
      }
      d.users.push(u)
      d.passwords[email] = hash
      return u
    })
    res.status(201).json({ token: await startSession(user.id), user })
  })

  app.post("/api/auth/logout", async (req, res) => {
    if (req.token) {
      const hashed = hashToken(req.token)
      await store.write((d) => {
        d.sessions = d.sessions.filter((x) => x.token !== hashed)
      })
    }
    res.status(204).end()
  })

  app.get("/api/me", (req, res) => {
    res.json(requireUser(req))
  })

  app.patch("/api/me", async (req, res) => {
    const me = requireUser(req)
    const patch = parse(s.profileSchema, req.body)
    const user = await store.write((d) => {
      const u = d.users.find((x) => x.id === me.id)!
      if (patch.email && patch.email.toLowerCase() !== u.email.toLowerCase()) {
        const email = patch.email.toLowerCase()
        if (d.users.some((x) => x.email.toLowerCase() === email)) throw new HttpError(409, "Этот email уже занят")
        d.passwords[email] = d.passwords[u.email]
        delete d.passwords[u.email]
        patch.email = email
      }
      Object.assign(u, patch)
      return u
    })
    res.json(user)
  })

  app.put("/api/me/favorites", async (req, res) => {
    const me = requireUser(req)
    const { favorites } = parse(s.favoritesSchema, req.body)
    const user = await store.write((d) => {
      const u = d.users.find((x) => x.id === me.id)!
      u.favorites = Array.from(new Set(favorites)).filter((id) => d.pets.some((p) => p.id === id))
      return u
    })
    res.json(user)
  })

  // ——— Пользователи и волонтёры (админ) ———

  app.get("/api/users", (req, res) => {
    requirePermission(req, "users.manage")
    res.json(db().users)
  })

  app.patch("/api/users/:id/role", async (req, res) => {
    const me = requirePermission(req, "users.manage")
    const { role } = parse(s.roleSchema, req.body)
    if (req.params.id === me.id) throw new HttpError(400, "Нельзя поменять роль самому себе")
    const user = await store.write((d) => {
      const u = d.users.find((x) => x.id === req.params.id)
      if (!u) throw new HttpError(404, "Пользователь не найден")
      u.role = role
      return u
    })
    res.json(user)
  })

  app.get("/api/volunteers", (req, res) => {
    requirePermission(req, "volunteers.manage")
    res.json(demoEmpty(req) ? [] : db().volunteers)
  })

  app.put("/api/volunteers", async (req, res) => {
    requirePermission(req, "volunteers.manage")
    const { volunteers } = parse(s.volunteersSchema, req.body)
    await store.write((d) => {
      d.volunteers = volunteers
    })
    res.json(volunteers)
  })

  app.post("/api/volunteer-requests", async (req, res) => {
    const input = parse(s.volunteerRequestSchema, req.body)
    await store.write((d) => {
      d.volunteerRequests.push({ ...input, at: now() })
    })
    res.status(201).json({ ok: true })
  })

  app.post("/api/subscribe", async (req, res) => {
    const { email } = parse(s.subscribeSchema, req.body)
    await store.write((d) => {
      if (!d.subscribers.includes(email.toLowerCase())) d.subscribers.push(email.toLowerCase())
    })
    res.status(201).json({ ok: true })
  })

  app.post("/api/feedback", async (req, res) => {
    const input = parse(s.feedbackSchema, req.body)
    await store.write((d) => {
      d.feedback.push({ ...input, at: now() })
    })
    res.status(201).json({ ok: true })
  })

  /** Вернуть демо-данные к исходному состоянию */
  app.post("/api/admin/reset", async (req, res) => {
    requirePermission(req, "users.manage")
    await store.reset()
    res.status(204).end()
  })

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Такого адреса в API нет")))
  app.use(errorHandler)
  return app
}
