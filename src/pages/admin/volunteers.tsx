import { useState } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminHeading } from "@/components/layout/admin-layout"
import { ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { initials, roleLabel, volunteerRoleLabel, weekdays } from "@/lib/format"
import type { Role, ShiftSlot, Volunteer } from "@/lib/types"

const slots: { value: ShiftSlot; label: string; time: string }[] = [
  { value: "morning", label: "Утро", time: "10:00–14:00" },
  { value: "evening", label: "Вечер", time: "15:00–19:00" },
]

function VolunteersTable({ list }: { list: Volunteer[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/5">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/60 hover:bg-secondary/60">
            <TableHead className="pl-6">Волонтёр</TableHead>
            <TableHead>Направление</TableHead>
            <TableHead>Контакты</TableHead>
            <TableHead className="pr-6">Смен в неделю</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="pl-6">
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">{initials(v.name)}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold whitespace-nowrap">{v.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{volunteerRoleLabel[v.role]}</Badge>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} className="block hover:underline">
                  {v.phone}
                </a>
                <a href={`mailto:${v.email}`} className="text-muted-foreground hover:underline">
                  {v.email}
                </a>
              </TableCell>
              <TableCell className="pr-6">{v.shifts.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Schedule({ list, onChange }: { list: Volunteer[]; onChange: (l: Volunteer[]) => void }) {
  const on = (v: Volunteer, day: number, slot: ShiftSlot) => v.shifts.some((s) => s.day === day && s.slot === slot)
  const toggle = (id: string, day: number, slot: ShiftSlot) =>
    onChange(
      list.map((v) =>
        v.id !== id
          ? v
          : {
              ...v,
              shifts: on(v, day, slot) ? v.shifts.filter((s) => !(s.day === day && s.slot === slot)) : [...v.shifts, { day, slot }],
            },
      ),
    )

  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/5">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <caption className="sr-only">Расписание дежурств на неделю</caption>
        <thead>
          <tr className="bg-secondary/60">
            <th scope="col" className="w-28 p-4 text-left">
              Смена
            </th>
            {weekdays.map((d) => (
              <th key={d} scope="col" className="p-4 text-left">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.value} className="border-t align-top">
              <th scope="row" className="p-4 text-left">
                <p>{s.label}</p>
                <p className="font-normal text-muted-foreground">{s.time}</p>
              </th>
              {weekdays.map((d, day) => {
                const assigned = list.filter((v) => on(v, day, s.value))
                const free = list.filter((v) => !on(v, day, s.value))
                return (
                  <td key={d} className="p-2">
                    <div className="flex min-h-24 flex-col gap-1 rounded-xl bg-muted/60 p-2">
                      {assigned.map((v) => (
                        <span
                          key={v.id}
                          className="flex items-center justify-between gap-1 rounded-lg bg-secondary py-1 pr-1 pl-2 text-xs font-semibold text-secondary-foreground"
                        >
                          <span className="truncate">{v.name.split(" ")[0]}</span>
                          <button
                            type="button"
                            onClick={() => toggle(v.id, day, s.value)}
                            className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-card/60"
                            aria-label={`Снять со смены (${d}, ${s.label.toLowerCase()}): ${v.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                      {assigned.length === 0 && <span className="px-2 py-1 text-xs text-warning-foreground">Никого</span>}
                      {free.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="mt-auto justify-start text-muted-foreground"
                              aria-label={`Назначить на ${d}, ${s.label.toLowerCase()}`}
                            >
                              <Plus /> Назначить
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>
                              {d}, {s.label.toLowerCase()}
                            </DropdownMenuLabel>
                            {free.map((v) => (
                              <DropdownMenuItem key={v.id} onSelect={() => toggle(v.id, day, s.value)}>
                                {v.name} · {volunteerRoleLabel[v.role].toLowerCase()}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Users() {
  const { user } = useAuth()
  const { status, data, reload, setData } = useAsync(() => api.listUsers(), [])
  if (status === "error") return <ErrorState onRetry={reload} />
  if (status === "loading") return <Skeleton className="h-48 w-full rounded-2xl" />
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/5">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/60 hover:bg-secondary/60">
            <TableHead className="pl-6">Пользователь</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="pr-6">Роль</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="pl-6 font-semibold whitespace-nowrap">
                {u.name} {u.id === user?.id && <span className="font-normal text-muted-foreground">(вы)</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell className="pr-6">
                <Select
                  value={u.role}
                  disabled={u.id === user?.id}
                  onValueChange={async (r) => {
                    const updated = await api.setUserRole(u.id, r as Role)
                    setData((l) => l.map((x) => (x.id === u.id ? updated : x)))
                    toast.success(`${u.name}: ${roleLabel[r as Role].toLowerCase()}`)
                  }}
                >
                  <SelectTrigger size="sm" className="w-44" aria-label={`Роль: ${u.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["user", "volunteer", "admin"] as const).map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function AdminVolunteersPage() {
  const { status, data, reload, setData } = useAsync(() => api.listVolunteers(), [])
  const [tab, setTab] = useState("list")

  async function saveSchedule(list: Volunteer[]) {
    setData(() => list)
    await api.saveVolunteers(list)
    toast.success("Расписание обновлено")
  }

  return (
    <>
      <AdminHeading title="Волонтёры и роли" subtitle="Команда, дежурства и права доступа." />
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-12! bg-secondary p-1">
            {[
              ["list", "Волонтёры"],
              ["schedule", "Расписание"],
              ["users", "Пользователи и роли"],
            ].map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 px-4 font-semibold text-secondary-foreground data-active:bg-card data-active:text-foreground"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {status === "error" ? (
          <ErrorState onRetry={reload} />
        ) : status === "loading" ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <>
            <TabsContent value="list">
              <VolunteersTable list={data} />
            </TabsContent>
            <TabsContent value="schedule">
              <Schedule list={data} onChange={saveSchedule} />
            </TabsContent>
          </>
        )}
        <TabsContent value="users">
          <Users />
        </TabsContent>
      </Tabs>
    </>
  )
}
