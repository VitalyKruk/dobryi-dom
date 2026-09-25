import { useEffect } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Heart, Loader2, MessageCircle } from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field } from "@/components/field"
import { PageHeader } from "@/components/page-header"
import { ApplicationStatusBadge, PetCard, PetCardSkeleton, PetImage } from "@/components/pet"
import { EmptyState, ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { formatDate, formatPhone, visitTimeLabel } from "@/lib/format"
import type { NotifySettings } from "@/lib/types"

const tabs = [
  { value: "applications", label: "Мои заявки" },
  { value: "favorites", label: "Избранное" },
  { value: "profile", label: "Профиль" },
  { value: "notifications", label: "Уведомления" },
] as const

function Applications() {
  const { user } = useAuth()
  // Заявки и питомцы из них — одним запросом за другим: список всех питомцев доступен только персоналу
  const apps = useAsync(async () => {
    const list = await api.listApplications()
    const pets = await api.getPetsByIds([...new Set(list.map((a) => a.petId))])
    return { list, pets }
  }, [user!.id])

  if (apps.status === "error") return <ErrorState onRetry={apps.reload} />
  if (apps.status === "loading")
    return (
      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    )
  if (apps.data.list.length === 0)
    return (
      <EmptyState
        title="Заявок пока нет"
        text="Когда найдёте того самого — оставьте заявку на его странице, и она появится здесь."
        action={
          <Button asChild variant="outline">
            <Link to="/catalog">Смотреть питомцев</Link>
          </Button>
        }
      />
    )

  async function cancel(id: string) {
    await api.cancelApplication(id)
    apps.setData((d) => ({ ...d, list: d.list.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)) }))
    toast("Заявка отозвана. Если передумаете — просто оставьте новую.")
  }

  return (
    <ul className="flex flex-col gap-4">
      {apps.data.list.map((a) => {
        const pet = apps.data.pets.find((p) => p.id === a.petId)
        const lastComment = a.staffComments.at(-1)
        return (
          <li key={a.id} className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/5 sm:flex-row md:p-6">
            <PetImage src={pet?.photos[0]} alt={pet?.name ?? "Питомец"} width={240} className="w-full shrink-0 rounded-xl sm:w-40" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl">
                  {pet ? (
                    <Link to={`/pet/${pet.id}`} className="hover:underline">
                      {pet.name}
                    </Link>
                  ) : (
                    "Питомец"
                  )}
                </h3>
                <ApplicationStatusBadge status={a.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Заявка {a.id} от {formatDate(a.createdAt)} · визит: {visitTimeLabel[a.preferredTime].toLowerCase()}
              </p>
              {a.status === "approved" && (
                <p className="rounded-xl bg-success p-4 text-sm text-success-foreground">
                  Ура, заявка одобрена! Куратор свяжется с вами, чтобы договориться о встрече.
                </p>
              )}
              {lastComment && (
                <div className="flex gap-2 rounded-xl bg-muted p-4 text-sm">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <p>
                    <b>{lastComment.author}:</b> {lastComment.text}
                  </p>
                </div>
              )}
              {a.status === "pending" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-auto self-start">
                      Отозвать заявку
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Отозвать заявку {a.id}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Питомец: {pet?.name}. Мы перестанем рассматривать заявку, но если передумаете — можно будет оставить новую.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Оставить</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => cancel(a.id)}>
                        Отозвать
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function FavoritesGrid() {
  const { favorites } = useAuth()
  const key = [...favorites].sort().join(",")
  const { status, data, reload } = useAsync(() => api.getPetsByIds(favorites), [key])
  if (favorites.length === 0)
    return (
      <EmptyState
        title="Пока здесь пусто — но где-то уже мяукает твой будущий друг 🐱"
        text="Нажимайте на сердечко на карточках питомцев, чтобы не потерять понравившихся."
        action={
          <Button asChild variant="outline">
            <Link to="/catalog">
              <Heart /> Найти друга
            </Link>
          </Button>
        }
      />
    )
  if (status === "error") return <ErrorState onRetry={reload} />
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {status === "loading"
        ? favorites.map((id) => <PetCardSkeleton key={id} />)
        : data.map((p) => <PetCard key={p.id} pet={p} />)}
    </div>
  )
}

const profileSchema = z.object({
  name: z.string().trim().min(2, { error: "Нужно хотя бы 2 буквы" }),
  email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
  phone: z
    .string()
    .refine((v) => v === "" || v.replace(/\D/g, "").length === 11, { error: "Кажется, в номере не хватает цифр" }),
  city: z.string().trim(),
})

function Profile() {
  const { user, updateProfile } = useAuth()
  const { register, handleSubmit, formState, reset, setValue } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: { name: user!.name, email: user!.email, phone: user!.phone ?? "", city: user!.city ?? "" },
  })
  const onSubmit = handleSubmit(async (v) => {
    await updateProfile(v)
    reset(v)
    toast.success("Профиль сохранён")
  })
  const phone = register("phone")
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-6 rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8">
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Имя" error={formState.errors.name?.message}>
          <Input autoComplete="name" {...register("name")} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Телефон" error={formState.errors.phone?.message} hint="Подставим в заявки автоматически">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 (___) ___-__-__"
            {...phone}
            onChange={(e) => {
              setValue("phone", e.target.value ? formatPhone(e.target.value) : "", { shouldDirty: true })
            }}
          />
        </Field>
        <Field label="Город">
          <Input autoComplete="address-level2" {...register("city")} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={!formState.isDirty || formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Сохранить
        </Button>
        {formState.isDirty && (
          <Button type="button" variant="ghost" size="lg" onClick={() => reset()}>
            Отменить изменения
          </Button>
        )}
      </div>
    </form>
  )
}

function Notifications() {
  const { user, updateProfile } = useAuth()
  const items: { key: keyof NotifySettings; title: string; text: string }[] = [
    { key: "newPets", title: "Новые питомцы", text: "Раз в неделю — подборка новеньких, похожих на ваше избранное." },
    { key: "applicationUpdates", title: "Статус заявок", text: "Сообщим, когда куратор ответит или статус изменится." },
    { key: "email", title: "Дублировать на почту", text: `Письма придут на ${user!.email}.` },
  ]
  return (
    <ul className="flex max-w-2xl flex-col divide-y rounded-3xl bg-card px-6 ring-1 ring-foreground/5 md:px-8">
      {items.map((i) => (
        <li key={i.key} className="flex items-center justify-between gap-4 py-6">
          <label htmlFor={`n-${i.key}`} className="flex cursor-pointer flex-col gap-1">
            <span className="font-bold">{i.title}</span>
            <span className="text-sm text-muted-foreground">{i.text}</span>
          </label>
          <Switch
            id={`n-${i.key}`}
            checked={user!.notify[i.key]}
            onCheckedChange={async (c) => {
              await updateProfile({ notify: { ...user!.notify, [i.key]: c } })
              toast.success("Настройки сохранены")
            }}
          />
        </li>
      ))}
    </ul>
  )
}

export default function AccountPage() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tab = tabs.some((t) => t.value === sp.get("tab")) ? sp.get("tab")! : "applications"
  return (
    <>
      <PageHeader
        title={`Привет, ${user!.name.split(" ")[0]}! 👋`}
        subtitle="Здесь ваши заявки, избранные питомцы и настройки."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Личный кабинет" }]}
      />
      <div className="container-page py-8 md:py-12">
        <Tabs value={tab} onValueChange={(v) => setSp(v === "applications" ? {} : { tab: v }, { replace: true })} className="gap-8">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList className="h-12! bg-secondary p-1">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-10 px-4 text-[15px] font-semibold text-secondary-foreground data-active:bg-card data-active:text-foreground"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="applications">
            <Applications />
          </TabsContent>
          <TabsContent value="favorites">
            <FavoritesGrid />
          </TabsContent>
          <TabsContent value="profile">
            <Profile />
          </TabsContent>
          <TabsContent value="notifications">
            <Notifications />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

/** Избранное гостя: вошедшего отправляем во вкладку кабинета */
export function GuestFavoritesPage() {
  const { user } = useAuth()
  useEffect(() => {
    document.title = "Избранное — Добрый дом"
  }, [])
  if (user) return <Navigate to="/account?tab=favorites" replace />
  return (
    <>
      <PageHeader
        title="Избранное ❤️"
        subtitle={
          <>
            Сохранено в этом браузере.{" "}
            <Link to="/login" state={{ from: "/account?tab=favorites" }} className="font-semibold text-secondary-foreground underline">
              Войдите
            </Link>
            , чтобы не потерять список.
          </>
        }
        crumbs={[{ label: "Главная", to: "/" }, { label: "Избранное" }]}
      />
      <div className="container-page py-8 md:py-12">
        <FavoritesGrid />
      </div>
    </>
  )
}
