import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { PetCard, PetCardSkeleton } from "@/components/pet"
import { EmptyState, ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import { useDebounce } from "@/hooks/use-debounce"
import { readLS, writeLS } from "@/hooks/use-local-storage"
import * as api from "@/lib/api"
import { plural } from "@/lib/format"
import type { PetFilters, SortKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 12

type ArrayKey = Exclude<keyof PetFilters, "q" | "sort">

const groups: { key: ArrayKey; title: string; options: { value: string; label: string }[] }[] = [
  { key: "species", title: "Кто нужен", options: [{ value: "cat", label: "Кошки 🐱" }, { value: "dog", label: "Собаки 🐶" }] },
  {
    key: "age",
    title: "Возраст",
    options: [
      { value: "baby", label: "До 1 года" },
      { value: "adult", label: "1–5 лет" },
      { value: "senior", label: "Старше 5 лет" },
    ],
  },
  {
    key: "size",
    title: "Размер",
    options: [
      { value: "small", label: "Маленький" },
      { value: "medium", label: "Средний" },
      { value: "large", label: "Крупный" },
    ],
  },
  { key: "sex", title: "Пол", options: [{ value: "male", label: "Мальчик" }, { value: "female", label: "Девочка" }] },
  {
    key: "coat",
    title: "Шерсть",
    options: [
      { value: "short", label: "Короткая" },
      { value: "long", label: "Длинная" },
    ],
  },
  {
    key: "health",
    title: "Здоровье",
    options: [
      { value: "vaccinated", label: "Привит" },
      { value: "sterilized", label: "Стерилизован" },
      { value: "specialNeeds", label: "Особые потребности" },
    ],
  },
  {
    key: "compat",
    title: "Уживчивость",
    options: [
      { value: "kids", label: "Ладит с детьми" },
      { value: "cats", label: "Ладит с кошками" },
      { value: "dogs", label: "Ладит с собаками" },
    ],
  },
  {
    key: "status",
    title: "Статус",
    options: [
      { value: "available", label: "Свободен" },
      { value: "reserved", label: "Забронирован" },
    ],
  },
]

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Дольше всех ждут" },
  { value: "age-asc", label: "Сначала младшие" },
  { value: "age-desc", label: "Сначала старшие" },
]

function parseFilters(sp: URLSearchParams): PetFilters {
  const f: PetFilters = {}
  for (const g of groups) {
    const v = sp.get(g.key)
    if (v) (f[g.key] as string[]) = v.split(",")
  }
  const q = sp.get("q")
  if (q) f.q = q
  const sort = sp.get("sort") as SortKey | null
  if (sort && sortOptions.some((o) => o.value === sort)) f.sort = sort
  return f
}

function countActive(f: PetFilters) {
  return groups.reduce((n, g) => n + (f[g.key]?.length ?? 0), 0)
}

function FilterPanel({ value, onChange, idPrefix }: { value: PetFilters; onChange: (f: PetFilters) => void; idPrefix: string }) {
  const toggle = (key: ArrayKey, option: string, checked: boolean) => {
    const current = (value[key] as string[] | undefined) ?? []
    const next = checked ? [...current, option] : current.filter((x) => x !== option)
    onChange({ ...value, [key]: next.length ? next : undefined })
  }
  return (
    <Accordion type="multiple" defaultValue={groups.map((g) => g.key)} className="flex flex-col">
      {groups.map((g) => {
        const selected = (value[g.key] as string[] | undefined) ?? []
        return (
          <AccordionItem key={g.key} value={g.key} className="border-secondary-border/70">
            <AccordionTrigger className="py-4 text-base font-bold hover:no-underline">
              <span className="flex items-center gap-2">
                {g.title}
                {selected.length > 0 && (
                  <span className="flex size-6 items-center justify-center rounded-full bg-secondary-foreground text-xs text-white">
                    {selected.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">{g.title}</legend>
                {g.options.map((o) => {
                  const id = `${idPrefix}-${g.key}-${o.value}`
                  return (
                    <label
                      key={o.value}
                      htmlFor={id}
                      className="flex min-h-10 cursor-pointer items-center gap-4 rounded-lg px-2 text-[15px] hover:bg-card/60"
                    >
                      <Checkbox
                        id={id}
                        checked={selected.includes(o.value)}
                        onCheckedChange={(c) => toggle(g.key, o.value, c === true)}
                        className="bg-card"
                      />
                      {o.label}
                    </label>
                  )
                })}
              </fieldset>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

/** Мобильные фильтры: черновик применяется только по жёлтой кнопке «Показать N» */
function MobileFilters({ value, onApply }: { value: PetFilters; onApply: (f: PetFilters) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const debounced = useDebounce(draft, 200)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setCount(null)
    api.countPets(debounced).then((n) => alive && setCount(n))
    return () => {
      alive = false
    }
  }, [debounced, open])

  const active = countActive(value)
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(value)
        setOpen(o)
      }}
    >
      <SheetTrigger asChild>
        <Button variant="secondary" className="lg:hidden">
          <SlidersHorizontal /> Фильтры{active > 0 && ` (${active})`}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90svh] gap-0 rounded-t-3xl bg-secondary p-0">
        <SheetHeader className="border-b border-secondary-border px-4 py-4">
          <SheetTitle className="text-xl font-bold">Фильтры</SheetTitle>
          <SheetDescription className="text-foreground/80">Выберите, кого ищете — покажем подходящих.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4">
          <FilterPanel value={draft} onChange={setDraft} idPrefix="m" />
        </div>
        <SheetFooter className="sticky bottom-0 flex-row gap-2 border-t border-secondary-border bg-secondary px-4 py-4">
          <Button variant="ghost" size="lg" onClick={() => setDraft({ q: draft.q, sort: draft.sort })}>
            Сбросить
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={count === 0}
            onClick={() => {
              onApply(draft)
              setOpen(false)
            }}
          >
            {count === null
              ? "Считаем…"
              : count === 0
                ? "Никого не нашли"
                : `Показать ${count} ${plural(count, ["питомца", "питомца", "питомцев"])}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default function CatalogPage() {
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => parseFilters(sp), [sp])
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const [view, setView] = useState<"grid" | "list">(() => readLS("dd:view", "grid"))
  const [search, setSearch] = useState(filters.q ?? "")
  const debouncedSearch = useDebounce(search, 300)
  const topRef = useRef<HTMLDivElement>(null)

  const update = (next: PetFilters, nextPage = 1) => {
    const p = new URLSearchParams()
    for (const g of groups) {
      const v = next[g.key] as string[] | undefined
      if (v?.length) p.set(g.key, v.join(","))
    }
    if (next.q) p.set("q", next.q)
    if (next.sort && next.sort !== "newest") p.set("sort", next.sort)
    if (nextPage > 1) p.set("page", String(nextPage))
    setSp(p)
  }

  // Поиск с debounce пишем в URL
  useEffect(() => {
    if ((filters.q ?? "") !== debouncedSearch) update({ ...filters, q: debouncedSearch || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const key = sp.toString()
  const { status, data, reload } = useAsync(() => api.getPets(filters, page, PAGE_SIZE), [key])

  const reset = () => {
    setSearch("")
    update({ sort: filters.sort })
  }
  const active = countActive(filters)
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const chips = groups.flatMap((g) =>
    ((filters[g.key] as string[] | undefined) ?? []).map((v) => ({
      key: g.key,
      value: v,
      label: g.options.find((o) => o.value === v)?.label ?? v,
    })),
  )

  return (
    <>
      <PageHeader
        title="Каталог питомцев"
        subtitle="Кошки и собаки, которые ждут свой дом. Фильтруйте по характеру и условиям — и знакомьтесь!"
        crumbs={[{ label: "Главная", to: "/" }, { label: "Каталог" }]}
      />
      <div className="container-page grid gap-8 py-8 md:py-12 lg:grid-cols-[288px_1fr] lg:gap-12">
        <aside aria-label="Фильтры" className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100svh-120px)] flex-col overflow-y-auto rounded-3xl bg-secondary px-6 py-4">
            <div className="flex items-center justify-between py-2">
              <h2 className="text-xl">Фильтры</h2>
              {active > 0 && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  Сбросить
                </Button>
              )}
            </div>
            <FilterPanel value={filters} onChange={(f) => update(f)} idPrefix="d" />
          </div>
        </aside>

        <div ref={topRef} className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Имя или порода"
                aria-label="Поиск по имени или породе"
                className="h-12 pl-10 text-base md:h-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <MobileFilters value={filters} onApply={(f) => update(f)} />
              <Select value={filters.sort ?? "newest"} onValueChange={(v) => update({ ...filters, sort: v as SortKey })}>
                <SelectTrigger className="flex-1 md:w-48 md:flex-none" aria-label="Сортировка">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => {
                  if (!v) return
                  setView(v as "grid" | "list")
                  writeLS("dd:view", v)
                }}
                aria-label="Вид списка"
                className="hidden rounded-lg bg-card sm:flex"
              >
                <ToggleGroupItem value="grid" aria-label="Сетка" className="size-10">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Список" className="size-10">
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {chips.length > 0 && (
            <ul aria-label="Выбранные фильтры" className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c.key + c.value}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = ((filters[c.key] as string[]) ?? []).filter((x) => x !== c.value)
                      update({ ...filters, [c.key]: next.length ? next : undefined })
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary pr-2 pl-3 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary-border/40"
                    aria-label={`Убрать фильтр «${c.label}»`}
                  >
                    {c.label} <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <Button variant="link" size="sm" onClick={reset} className="h-8">
                  Сбросить всё
                </Button>
              </li>
            </ul>
          )}

          <p aria-live="polite" className="text-sm text-muted-foreground">
            {status === "success" &&
              data.total > 0 &&
              `Нашли ${data.total} ${plural(data.total, ["питомца", "питомца", "питомцев"])}`}
          </p>

          {status === "error" ? (
            <ErrorState onRetry={reload} />
          ) : status === "success" && data.total === 0 ? (
            <EmptyState
              title="Никого не нашли по этим фильтрам 🐾"
              text="Попробуйте убрать пару условий — возможно, ваш друг просто чуть старше или пушистее, чем вы думали."
              action={
                <Button variant="outline" onClick={reset}>
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <div
              aria-busy={status === "loading"}
              className={cn(
                "grid gap-4 md:gap-6",
                view === "grid" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
              )}
            >
              {status === "loading"
                ? Array.from({ length: 6 }, (_, i) => <PetCardSkeleton key={i} layout={view} />)
                : data.items.map((p, i) => <PetCard key={p.id} pet={p} layout={view} eager={i < 3} />)}
            </div>
          )}

          {status === "success" && (
            <div className="pt-4">
              <Pager
                page={page}
                total={totalPages}
                onChange={(p) => {
                  update(filters, p)
                  topRef.current?.scrollIntoView({ behavior: "smooth" })
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
