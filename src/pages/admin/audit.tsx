import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminHeading } from "@/components/layout/admin-layout"
import { Pager } from "@/components/pager"
import { EmptyState, ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import { useDebounce } from "@/hooks/use-debounce"
import * as api from "@/lib/api"
import { auditActionLabel, auditGroups } from "@/lib/audit"
import { roleLabel } from "@/lib/format"
import type { AuditEntry } from "@/lib/types"

const PAGE_SIZE = 25

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

/** Неудачный вход и сброс данных — то, на что администратору стоит обратить внимание */
const tone = (e: AuditEntry) =>
  e.action === "auth.login_failed" || e.action === "data.reset" || e.action === "pet.delete" ? "warning" : "secondary"

function Actor({ e }: { e: AuditEntry }) {
  if (!e.actor) return <span className="text-muted-foreground">Не определён</span>
  return (
    <span className="flex flex-col">
      <span className="font-semibold">{e.actor.name}</span>
      <span className="text-xs text-muted-foreground">{e.actor.role ? roleLabel[e.actor.role] : "Гость"}</span>
    </span>
  )
}

/** Ссылка на то, с чем работали: заявку открываем в админке, питомца — на сайте */
function Target({ e }: { e: AuditEntry }) {
  const t = e.target
  if (!t) return <span className="text-muted-foreground">—</span>
  const label = t.label ?? t.id ?? "—"
  if (t.type === "application" && t.id) {
    return (
      <Link to={`/admin/applications?status=all&id=${t.id}`} className="font-semibold hover:underline">
        {label}
      </Link>
    )
  }
  if (t.type === "pet" && t.id && e.action !== "pet.delete") {
    return (
      <Link to={`/pet/${t.id}`} className="font-semibold hover:underline">
        {label}
      </Link>
    )
  }
  return <span className="font-semibold">{label}</span>
}

export default function AdminAuditPage() {
  const [sp, setSp] = useSearchParams()
  const group = sp.get("group") ?? ""
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const [q, setQ] = useState(sp.get("q") ?? "")
  const debounced = useDebounce(q, 300)

  const data = useAsync(
    () => api.listAudit({ group: group || undefined, q: debounced, page, pageSize: PAGE_SIZE }),
    [group, debounced, page],
  )

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== "page") next.delete("page")
    setSp(next, { replace: true })
  }

  const items = data.data?.items ?? []
  const total = data.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <AdminHeading title="Журнал действий" subtitle="Кто и когда менял данные приюта: заявки, питомцев, роли, входы в систему." />

      <Tabs value={group || "all"} onValueChange={(v) => setParam("group", v === "all" ? null : v)}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-12! bg-secondary p-1">
            {[{ value: "all", label: "Все" }, ...auditGroups].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-10 px-4 font-semibold text-secondary-foreground data-active:bg-card data-active:text-foreground"
              >
                {t.label}
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
          onChange={(e) => {
            setQ(e.target.value)
            setParam("q", e.target.value.trim() || null)
          }}
          placeholder="Сотрудник, № заявки или питомец"
          aria-label="Поиск по журналу"
          className="h-12 bg-card pl-12"
        />
      </div>

      {data.status === "error" ? (
        <ErrorState onRetry={data.reload} />
      ) : data.status === "loading" && !data.data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Записей нет"
          text={debounced || group ? "По этим условиям в журнале ничего не нашлось." : "Здесь появятся действия команды и посетителей."}
          action={
            (debounced || group) && (
              <Button
                variant="outline"
                onClick={() => {
                  setQ("")
                  setSp(new URLSearchParams(), { replace: true })
                }}
              >
                Сбросить фильтры
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/5 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead className="pl-6">Когда</TableHead>
                  <TableHead>Кто</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Что</TableHead>
                  <TableHead className="pr-6">Подробности</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 whitespace-nowrap text-muted-foreground tabular-nums">{when(e.at)}</TableCell>
                    <TableCell>
                      <Actor e={e} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={tone(e)}>{auditActionLabel[e.action]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Target e={e} />
                    </TableCell>
                    <TableCell className="pr-6 text-sm">{e.details ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/5">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant={tone(e)}>{auditActionLabel[e.action]}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">{when(e.at)}</span>
                </div>
                <Actor e={e} />
                <div className="text-sm">
                  <Target e={e} />
                  {e.details && <p className="text-muted-foreground">{e.details}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2">
            <Pager page={Math.min(page, pages)} total={pages} onChange={(n) => setParam("page", n === 1 ? null : String(n))} />
            <p className="text-sm text-muted-foreground">
              Показаны {(Math.min(page, pages) - 1) * PAGE_SIZE + 1}–{(Math.min(page, pages) - 1) * PAGE_SIZE + items.length} из {total}
            </p>
          </div>
        </>
      )}
    </>
  )
}
