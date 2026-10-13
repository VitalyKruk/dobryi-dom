import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ExternalLink, Loader2, Mail, Phone, Search, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AdminHeading } from "@/components/layout/admin-layout"
import { Pager } from "@/components/pager"
import { ApplicationStatusBadge, PetImage, petMeta } from "@/components/pet"
import { EmptyState, ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { applicationStatusLabel, experienceLabel, formatDate, housingLabel, visitTimeLabel } from "@/lib/format"
import type { Application, ApplicationStatus, Pet } from "@/lib/types"

const PAGE_SIZE = 15

const statusTabs: { value: ApplicationStatus | "all"; label: string }[] = [
  { value: "pending", label: "На рассмотрении" },
  { value: "approved", label: "Одобрены" },
  { value: "rejected", label: "Отклонены" },
  { value: "cancelled", label: "Отозваны" },
  { value: "all", label: "Все" },
]

function Details({ app, pet, onUpdate }: { app: Application; pet?: Pet; onUpdate: (a: Application) => void }) {
  const { can } = useAuth()
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  async function changeStatus(s: ApplicationStatus) {
    const updated = await api.updateApplicationStatus(app.id, s)
    onUpdate(updated)
    toast.success(
      s === "approved" && pet?.status === "available"
        ? `Заявка одобрена, ${pet.name} теперь забронирован(а)`
        : `Статус: ${applicationStatusLabel[s].toLowerCase()}`,
    )
  }

  async function addComment() {
    if (!comment.trim()) return
    setBusy(true)
    try {
      onUpdate(await api.addStaffComment(app.id, comment.trim()))
      setComment("")
    } finally {
      setBusy(false) // ошибку покажет общий обработчик в App.tsx
    }
  }

  const rows: [string, string][] = [
    ["Город", app.city],
    ["Жильё", housingLabel[app.housing]],
    ["Дети до 10 лет", app.hasKids === undefined ? "Не спросили" : app.hasKids ? "Есть" : "Нет"],
    ["Другие животные", app.hasOtherPets ? app.otherPetsNote || "Да" : "Нет"],
    ["Опыт", experienceLabel[app.experience]],
    ["Время визита", visitTimeLabel[app.preferredTime]],
    ["Комментарий", app.comment || "—"],
  ]

  return (
    <div className="flex flex-col gap-6">
      {pet && (
        <div className="flex items-center gap-4 rounded-2xl bg-secondary p-4">
          <PetImage src={pet.photos[0]} alt="" width={120} ratio={1} className="size-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{pet.name}</p>
            <p className="text-sm text-foreground/80">{petMeta(pet)}</p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label={`Открыть карточку: ${pet.name}`}>
            <Link to={`/pet/${pet.id}`} target="_blank">
              <ExternalLink />
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {can("applications.status") ? (
          <Select value={app.status} onValueChange={(v) => changeStatus(v as ApplicationStatus)}>
            <SelectTrigger className="w-56" aria-label="Статус заявки">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["pending", "approved", "rejected", "cancelled"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {applicationStatusLabel[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <ApplicationStatusBadge status={app.status} />
        )}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${app.phone.replace(/[^\d+]/g, "")}`}>
              <Phone /> {app.phone}
            </a>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label={`Написать на ${app.email}`}>
            <a href={`mailto:${app.email}`}>
              <Mail />
            </a>
          </Button>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-[160px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="comments-title">
        <h3 id="comments-title" className="text-lg">
          Комментарии команды
        </h3>
        {app.staffComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока без комментариев.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {app.staffComments.map((c, i) => (
              <li key={i} className="rounded-xl bg-muted p-4 text-sm">
                <p className="mb-1 font-bold">
                  {c.author} <span className="font-normal text-muted-foreground">· {formatDate(c.at)}</span>
                </p>
                <p>{c.text}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="new-comment" className="text-sm font-semibold">
            Новый комментарий
          </label>
          <Textarea
            id="new-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Позвонил(а), договорились на субботу…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment()
            }}
          />
          <Button variant="secondary" className="self-end" disabled={!comment.trim() || busy} onClick={addComment}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Добавить
          </Button>
        </div>
      </section>
    </div>
  )
}

export default function AdminApplicationsPage() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get("status") as ApplicationStatus | "all" | null) ?? "pending"
  const openId = sp.get("id")
  const q = sp.get("q") ?? ""
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const data = useAsync(async () => {
    const [apps, pets] = await Promise.all([api.listApplications(), api.listAllPets()])
    return { apps, pets }
  }, [])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp)
    if (value === null || value === "") next.delete(key)
    else next.set(key, value)
    // Сменили фильтр — возвращаемся на первую страницу
    if (key === "status" || key === "q") next.delete("page")
    setSp(next, { replace: key === "id" ? false : true })
  }

  if (data.status === "error") return <ErrorState onRetry={data.reload} />
  const apps = data.data?.apps ?? []
  const pets = data.data?.pets ?? []
  const petOf = (a: Application) => pets.find((p) => p.id === a.petId)
  const count = (s: ApplicationStatus | "all") => (s === "all" ? apps.length : apps.filter((a) => a.status === s).length)
  const needle = q.trim().toLowerCase()
  const list = apps.filter(
    (a) =>
      (tab === "all" || a.status === tab) &&
      (!needle || [a.id, a.name, a.city, a.email, petOf(a)?.name ?? ""].some((v) => v.toLowerCase().includes(needle))),
  )
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const opened = apps.find((a) => a.id === openId)

  const update = (a: Application) => {
    data.setData((d) => ({ ...d, apps: d.apps.map((x) => (x.id === a.id ? a : x)) }))
    if (a.status === "approved") {
      // одобрение бронирует питомца — подтягиваем свежие статусы
      api.listAllPets().then((p) => data.setData((d) => ({ ...d, pets: p })))
    }
  }

  return (
    <>
      <AdminHeading title="Заявки" subtitle="Откройте заявку, чтобы увидеть ответы, связаться и оставить комментарий." />
      <Tabs value={tab} onValueChange={(v) => setParam("status", v === "pending" ? null : v)}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-12! bg-secondary p-1">
            {statusTabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-10 gap-2 px-4 font-semibold text-secondary-foreground data-active:bg-card data-active:text-foreground"
              >
                {t.label}
                {data.status === "success" && (
                  <span className="rounded-full bg-secondary px-2 text-xs text-secondary-foreground">{count(t.value)}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="№ заявки, кандидат, город или питомец"
          aria-label="Поиск по заявкам"
          className="h-12 bg-card pl-12"
        />
      </div>

      {data.status === "loading" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        needle ? (
          <EmptyState
            title="Ничего не нашли"
            text={`По запросу «${q.trim()}» в этой вкладке заявок нет. Проверьте написание или поищите во вкладке «Все».`}
            action={
              <Button variant="outline" onClick={() => setParam("q", null)}>
                Сбросить поиск
              </Button>
            }
          />
        ) : (
          <EmptyState title="Здесь пусто" text="Заявок с таким статусом нет. Отличный повод выпить чаю ☕" />
        )
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/5 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead className="pl-6">№</TableHead>
                  <TableHead>Питомец</TableHead>
                  <TableHead>Кандидат</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="pr-6">
                    <span className="sr-only">Открыть</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((a) => {
                  const pet = petOf(a)
                  return (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => setParam("id", a.id)}>
                      <TableCell className="pl-6 font-mono text-sm">{a.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PetImage src={pet?.photos[0]} alt="" width={80} ratio={1} className="size-10 rounded-lg" />
                          <span className="font-semibold">{pet?.name ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.city}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                      <TableCell>
                        <ApplicationStatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setParam("id", a.id)
                          }}
                        >
                          Открыть
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((a) => {
              const pet = petOf(a)
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setParam("id", a.id)}
                    className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/5"
                  >
                    <PetImage src={pet?.photos[0]} alt="" width={96} ratio={1} className="size-12 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {a.name} → {pet?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {a.id} · {formatDate(a.createdAt)}
                      </p>
                    </div>
                    <ApplicationStatusBadge status={a.status} />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-col items-center gap-2">
            <Pager page={current} total={pages} onChange={(n) => setParam("page", n === 1 ? null : String(n))} />
            <p className="text-sm text-muted-foreground">
              Показаны {(current - 1) * PAGE_SIZE + 1}–{(current - 1) * PAGE_SIZE + visible.length} из {list.length}
            </p>
          </div>
        </>
      )}

      <Dialog open={!!opened} onOpenChange={(o) => !o && setParam("id", null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">
                  Заявка {opened.id} · {opened.name}
                </DialogTitle>
                <DialogDescription>
                  Получена {formatDate(opened.createdAt)}
                  {opened.decidedAt && ` · решение ${formatDate(opened.decidedAt)}`}
                </DialogDescription>
              </DialogHeader>
              <Details app={opened} pet={petOf(opened)} onUpdate={update} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
