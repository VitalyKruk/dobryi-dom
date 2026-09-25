import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, ChevronLeft, ChevronRight, ImagePlus, Loader2, Lock, Trash2, X } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/field"
import { AdminHeading } from "@/components/layout/admin-layout"
import { PetImage } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAsync } from "@/hooks/use-async"
import * as api from "@/lib/api"
import { coatLabel, compatLabel, petStatusLabel, sizeLabel } from "@/lib/format"
import type { Pet } from "@/lib/types"
import { cn } from "@/lib/utils"
import NotFoundPage from "../not-found"

const compat = z.enum(["yes", "no", "unknown"])
const schema = z.object({
  name: z.string().trim().min(2, { error: "Минимум 2 буквы" }).max(40),
  species: z.enum(["cat", "dog"]),
  sex: z.enum(["male", "female"]),
  birthDate: z
    .string()
    .min(1, { error: "Укажите примерную дату рождения" })
    .refine((v) => new Date(v).getTime() <= Date.now(), { error: "Дата рождения не может быть в будущем" }),
  breed: z.string().trim().min(2, { error: "Если порода неизвестна — напишите «Беспородный»" }),
  size: z.enum(["small", "medium", "large"]),
  coat: z.enum(["short", "long", "none"]),
  weightKg: z.coerce.number<string>({ error: "Укажите вес числом" }).positive({ error: "Вес должен быть больше нуля" }).max(100),
  traits: z.string().trim().min(2, { error: "Добавьте хотя бы одну черту характера" }),
  vaccinated: z.boolean(),
  sterilized: z.boolean(),
  chipped: z.boolean(),
  specialNeeds: z.string().trim().max(500).optional(),
  goodWithKids: compat,
  goodWithCats: compat,
  goodWithDogs: compat,
  story: z.string().trim().min(20, { error: "Расскажите историю хотя бы в паре предложений" }).max(1000),
  careNotes: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(1000).optional(),
  status: z.enum(["available", "reserved", "adopted"]),
  photos: z.array(z.string()).min(1, { error: "Добавьте хотя бы одно фото — без него питомца не заметят" }),
})
type Values = z.input<typeof schema>
type Output = z.output<typeof schema>

function toValues(p?: Pet): Values {
  return {
    name: p?.name ?? "",
    species: p?.species ?? "cat",
    sex: p?.sex ?? "male",
    birthDate: p?.birthDate ?? "",
    breed: p?.breed ?? "",
    size: p?.size ?? "medium",
    coat: p?.coat ?? "short",
    weightKg: p ? String(p.weightKg) : "",
    traits: p?.traits.join(", ") ?? "",
    vaccinated: p?.vaccinated ?? false,
    sterilized: p?.sterilized ?? false,
    chipped: p?.chipped ?? false,
    specialNeeds: p?.specialNeeds ?? "",
    goodWithKids: p?.goodWithKids ?? "unknown",
    goodWithCats: p?.goodWithCats ?? "unknown",
    goodWithDogs: p?.goodWithDogs ?? "unknown",
    story: p?.story ?? "",
    careNotes: p?.careNotes ?? "",
    internalNotes: p?.internalNotes ?? "",
    status: p?.status ?? "available",
    photos: p?.photos ?? [],
  }
}

/** Уменьшаем фото до 1200px и JPEG 0.82 перед загрузкой — быстрее и меньше места на сервере */
function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось обработать изображение"))), "image/jpeg", 0.82)
    }
    img.onerror = () => reject(new Error("Не удалось прочитать изображение"))
    img.src = url
  })
}

function PhotoUploader({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function add(files: FileList | null) {
    if (!files?.length) return
    const images = [...files].filter((f) => f.type.startsWith("image/"))
    if (images.length < files.length) toast.error("Можно загружать только изображения")
    setBusy(true)
    try {
      // Каждое фото сразу уходит на сервер (POST /api/uploads); в форме остаётся его адрес
      const blobs = await Promise.all(images.slice(0, 8 - value.length).map(resizeImage))
      const urls = await Promise.all(blobs.map((b) => api.uploadPhoto(b)))
      onChange([...value, ...urls])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition",
          drag ? "border-secondary-foreground bg-accent" : error ? "border-destructive" : "border-secondary-border",
        )}
      >
        <ImagePlus className="size-8 text-secondary-foreground" aria-hidden="true" />
        <p className="font-semibold">Перетащите фото сюда</p>
        <p className="text-sm text-muted-foreground">JPG или PNG, до 8 штук. Первое фото — обложка карточки.</p>
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} tabIndex={-1} />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy || value.length >= 8}>
          {busy && <Loader2 className="animate-spin" />} Выбрать файлы
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((src, i) => (
            <li key={src.slice(-40) + i} className="flex flex-col gap-2">
              <div className="relative">
                <PetImage src={src} alt={`Фото ${i + 1}`} width={240} className="rounded-xl" />
                {i === 0 && (
                  <span className="absolute top-2 left-2 rounded-lg bg-card px-2 py-0.5 text-xs font-bold">Обложка</span>
                )}
              </div>
              <div className="flex justify-between">
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Сдвинуть фото ${i + 1} влево`}>
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Сдвинуть фото ${i + 1} вправо`}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Удалить фото ${i + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-6 rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8", className)}>
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  )
}

function EnumSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: Record<string, string>
  label?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([k, v]) => (
          <SelectItem key={k} value={k}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PetForm({ pet }: { pet?: Pet }) {
  const navigate = useNavigate()
  const saved = useRef(false)
  const { register, control, handleSubmit, formState, watch, setError } = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: toValues(pet),
  })
  const e = formState.errors
  const sex = watch("sex")

  // Предупреждение о несохранённых изменениях: переход внутри SPA и закрытие вкладки
  const blocker = useBlocker(({ currentLocation, nextLocation }) => formState.isDirty && !saved.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      if (formState.isDirty && !saved.current) ev.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [formState.isDirty])

  const onSubmit = handleSubmit(
    async (out) => {
      const data: api.PetInput = {
        ...out,
        traits: out.traits.split(",").map((t) => t.trim()).filter(Boolean),
        specialNeeds: out.specialNeeds || undefined,
        careNotes: out.careNotes ?? "",
        internalNotes: out.internalNotes || undefined,
      }
      try {
        await api.savePet(data, pet?.id)
      } catch (e) {
        // Серверная валидация: показываем ошибку под соответствующим полем
        const fields = e instanceof api.ApiError ? e.fields : undefined
        if (fields) {
          for (const [key, message] of Object.entries(fields)) {
            setError(key.split(".")[0] as keyof Values, { message })
          }
        }
        toast.error((e as Error).message)
        return
      }
      saved.current = true
      toast.success(pet ? `Карточка «${data.name}» обновлена` : `${data.name} добавлен(а) в каталог 🐾`)
      navigate("/admin/pets")
    },
    () => toast.error("Проверьте поля, отмеченные красным"),
  )

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button asChild variant="link" className="self-start">
          <Link to="/admin/pets">
            <ArrowLeft /> Все питомцы
          </Link>
        </Button>
        <AdminHeading title={pet ? `Редактирование: ${pet.name}` : "Новый питомец"} subtitle="Поля со звёздочкой обязательны." />
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Section title="Основное">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Имя" required error={e.name?.message}>
              <Input {...register("name")} />
            </Field>
            <Controller
              control={control}
              name="species"
              render={({ field }) => (
                <Field label="Вид" required>
                  <EnumSelect value={field.value} onChange={field.onChange} options={{ cat: "Кошка", dog: "Собака" }} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="sex"
              render={({ field }) => (
                <Field label="Пол" required>
                  <EnumSelect value={field.value} onChange={field.onChange} options={{ male: "Мальчик", female: "Девочка" }} />
                </Field>
              )}
            />
            <Field label="Дата рождения (примерно)" required error={e.birthDate?.message}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...register("birthDate")} />
            </Field>
            <Field label="Порода" required error={e.breed?.message}>
              <Input placeholder="Беспородный" {...register("breed")} />
            </Field>
            <Field label="Вес, кг" required error={e.weightKg?.message}>
              <Input inputMode="decimal" {...register("weightKg")} />
            </Field>
            <Controller
              control={control}
              name="size"
              render={({ field }) => (
                <Field label="Размер" required>
                  <EnumSelect value={field.value} onChange={field.onChange} options={sizeLabel} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="coat"
              render={({ field }) => (
                <Field label="Шерсть" required>
                  <EnumSelect value={field.value} onChange={field.onChange} options={coatLabel} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Field label="Статус" required>
                  <EnumSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={{
                      available: petStatusLabel("available", sex),
                      reserved: petStatusLabel("reserved", sex),
                      adopted: petStatusLabel("adopted", sex),
                    }}
                  />
                </Field>
              )}
            />
          </div>
        </Section>

        <Section title="Фото *">
          <Controller
            control={control}
            name="photos"
            render={({ field }) => <PhotoUploader value={field.value} onChange={field.onChange} error={e.photos?.message} />}
          />
        </Section>

        <Section title="Характер и история">
          <Field label="Черты характера" required hint="Через запятую: Ласковый, Активный, Игривый" error={e.traits?.message}>
            <Input {...register("traits")} />
          </Field>
          <Field label="История" required hint="Как попал(а) в приют, что любит. Пишите тепло — это читают будущие хозяева." error={e.story?.message}>
            <Textarea rows={4} {...register("story")} />
          </Field>
        </Section>

        <Section title="Здоровье и уход">
          <div className="flex flex-wrap gap-6">
            {(
              [
                ["vaccinated", "Привит(а)"],
                ["sterilized", "Стерилизован(а)"],
                ["chipped", "Чипирован(а)"],
              ] as const
            ).map(([name, label]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field }) => (
                  <label className="flex min-h-10 cursor-pointer items-center gap-4">
                    <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                    {label}
                  </label>
                )}
              />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                ["goodWithKids", "С детьми"],
                ["goodWithCats", "С кошками"],
                ["goodWithDogs", "С собаками"],
              ] as const
            ).map(([name, label]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field }) => (
                  <Field label={label}>
                    <EnumSelect value={field.value} onChange={field.onChange} options={compatLabel} />
                  </Field>
                )}
              />
            ))}
          </div>
          <Field label="Особые потребности" hint="Оставьте пустым, если их нет" error={e.specialNeeds?.message}>
            <Textarea rows={3} {...register("specialNeeds")} />
          </Field>
          <Field label="Уход и питание" error={e.careNotes?.message}>
            <Textarea rows={3} {...register("careNotes")} />
          </Field>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Lock className="size-5 text-secondary-foreground" aria-hidden="true" /> Внутренние заметки
            </span>
          }
          className="bg-muted ring-0"
        >
          <p className="-mt-4 text-sm text-muted-foreground">Видно только персоналу — на сайте не показывается.</p>
          <Field label="Заметки для команды" error={e.internalNotes?.message}>
            <Textarea rows={3} placeholder="Например: боится пылесоса, брать на руки вдвоём" {...register("internalNotes")} />
          </Field>
        </Section>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />} {pet ? "Сохранить изменения" : "Добавить в каталог"}
          </Button>
          <Button asChild type="button" variant="ghost" size="lg">
            <Link to="/admin/pets">
              <X /> Отмена
            </Link>
          </Button>
        </div>
      </form>

      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Уйти без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>Изменения в карточке пропадут.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Остаться</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              Уйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function PetFormPage() {
  const { id } = useParams()
  const { status, data, reload } = useAsync(() => (id ? api.getPet(id) : Promise.resolve(undefined)), [id])
  if (status === "loading") return <Skeleton className="h-[600px] w-full rounded-3xl" />
  if (status === "error") return <ErrorState onRetry={reload} />
  if (id && !data) return <NotFoundPage title="Питомец не найден" text="Возможно, карточку уже удалили." />
  return <PetForm key={id ?? "new"} pet={data ?? undefined} />
}
