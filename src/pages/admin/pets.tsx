import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowDownUp, ExternalLink, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminHeading } from "@/components/layout/admin-layout"
import { Pager } from "@/components/pager"
import { PetImage, PetStatusBadge } from "@/components/pet"
import { EmptyState, ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatAge, formatDate, petStatusLabel, speciesLabel } from "@/lib/format"
import type { Pet, PetStatus } from "@/lib/types"

const PAGE = 10

function StatusSelect({ pet, onChange }: { pet: Pet; onChange: (s: PetStatus) => void }) {
  return (
    <Select value={pet.status} onValueChange={(v) => onChange(v as PetStatus)}>
      <SelectTrigger size="sm" className="w-40" aria-label={`Статус: ${pet.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["available", "reserved", "adopted"] as const).map((s) => (
          <SelectItem key={s} value={s}>
            {petStatusLabel(s, pet.sex)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function AdminPetsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const { status, data, reload, setData } = useAsync(() => api.listAllPets(), [])
  const [q, setQ] = useState("")
  const [species, setSpecies] = useState("all")
  const [petStatus, setPetStatus] = useState("all")
  const [sort, setSort] = useState<{ key: "name" | "addedAt"; dir: 1 | -1 }>({ key: "addedAt", dir: -1 })
  const [page, setPage] = useState(1)
  const [toDelete, setToDelete] = useState<Pet | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    return data
      .filter((p) => (species === "all" || p.species === species) && (petStatus === "all" || p.status === petStatus))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.breed.toLowerCase().includes(s))
      .sort((a, b) => a[sort.key].localeCompare(b[sort.key], "ru") * sort.dir)
  }, [data, q, species, petStatus, sort])
  const pages = Math.ceil(filtered.length / PAGE)
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE)

  async function changeStatus(pet: Pet, s: PetStatus) {
    const updated = await api.setPetStatus(pet.id, s)
    setData((list) => list.map((p) => (p.id === pet.id ? updated : p)))
    toast.success(`${pet.name}: ${petStatusLabel(s, pet.sex).toLowerCase()}`)
  }

  async function remove(pet: Pet) {
    await api.deletePet(pet.id)
    setData((list) => list.filter((p) => p.id !== pet.id))
    toast(`Карточка «${pet.name}» удалена`)
  }

  const toggleSort = (key: "name" | "addedAt") =>
    setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : key === "name" ? 1 : -1 }))

  const ariaSort = (key: "name" | "addedAt") =>
    sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"

  const actions = (p: Pet) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Действия: ${p.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/pet/${p.id}`)}>
          <ExternalLink /> Открыть на сайте
        </DropdownMenuItem>
        {can("pets.edit") && (
          <>
            <DropdownMenuItem onSelect={() => navigate(`/admin/pets/${p.id}/edit`)}>
              <Pencil /> Редактировать
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(p)}>
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <AdminHeading
        title="Питомцы"
        subtitle={can("pets.edit") ? "Карточки, статусы и фото." : "Вы можете менять статусы питомцев."}
        actions={
          can("pets.edit") && (
            <Button asChild size="lg">
              <Link to="/admin/pets/new">
                <Plus /> Добавить питомца
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Имя или порода"
            aria-label="Поиск питомцев"
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={species}
            onValueChange={(v) => {
              setSpecies(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full md:w-40" aria-label="Вид">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все виды</SelectItem>
              <SelectItem value="cat">Кошки</SelectItem>
              <SelectItem value="dog">Собаки</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={petStatus}
            onValueChange={(v) => {
              setPetStatus(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full md:w-44" aria-label="Статус">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="available">Свободны</SelectItem>
              <SelectItem value="reserved">Забронированы</SelectItem>
              <SelectItem value="adopted">Уже дома</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {status === "error" ? (
        <ErrorState onRetry={reload} />
      ) : status === "loading" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Никого не нашли" text="Попробуйте изменить поиск или фильтры." />
      ) : (
        <>
          {/* Desktop: таблица */}
          <div className="hidden overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/5 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead className="w-20 pl-6">Фото</TableHead>
                  <TableHead aria-sort={ariaSort("name")}>
                    <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort("name")}>
                      Имя <ArrowDownUp className="size-3.5" />
                    </Button>
                  </TableHead>
                  <TableHead>Вид</TableHead>
                  <TableHead>Возраст</TableHead>
                  <TableHead aria-sort={ariaSort("addedAt")}>
                    <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort("addedAt")}>
                      Добавлен <ArrowDownUp className="size-3.5" />
                    </Button>
                  </TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-16 pr-6">
                    <span className="sr-only">Действия</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <PetImage src={p.photos[0]} alt="" width={96} ratio={1} className="size-12 rounded-lg" />
                    </TableCell>
                    <TableCell>
                      <p className="font-bold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.breed}</p>
                    </TableCell>
                    <TableCell>{speciesLabel[p.species]}</TableCell>
                    <TableCell>{formatAge(p.birthDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(p.addedAt)}</TableCell>
                    <TableCell>
                      {can("pets.status") ? (
                        <StatusSelect pet={p} onChange={(s) => changeStatus(p, s)} />
                      ) : (
                        <PetStatusBadge status={p.status} sex={p.sex} />
                      )}
                    </TableCell>
                    <TableCell className="pr-6">{actions(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: карточки */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/5">
                <div className="flex items-center gap-4">
                  <PetImage src={p.photos[0]} alt="" width={96} ratio={1} className="size-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{p.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {speciesLabel[p.species]} · {formatAge(p.birthDate)}
                    </p>
                  </div>
                  {actions(p)}
                </div>
                {can("pets.status") ? (
                  <StatusSelect pet={p} onChange={(s) => changeStatus(p, s)} />
                ) : (
                  <PetStatusBadge status={p.status} sex={p.sex} />
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-2">
            <Pager page={page} total={pages} onChange={setPage} />
            <p className="text-sm text-muted-foreground">Всего: {filtered.length}</p>
          </div>
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить карточку «{toDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Карточка пропадёт с сайта вместе с фото. Если питомец нашёл дом — лучше поставьте статус «Уже дома», чтобы он
              остался в статистике.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => toDelete && remove(toDelete)}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
