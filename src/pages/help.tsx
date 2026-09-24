import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Camera, Car, Copy, Dog, HandCoins, Loader2, Package, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldSet } from "@/components/field"
import { PageHeader } from "@/components/page-header"
import * as api from "@/lib/api"
import { formatNumber, formatPhone, volunteerRoleLabel, weekdays } from "@/lib/format"
import { needs } from "@/lib/seed"
import type { VolunteerRole } from "@/lib/types"
import { cn } from "@/lib/utils"

const directions: { role: VolunteerRole; icon: typeof Dog; text: string }[] = [
  { role: "walker", icon: Dog, text: "Гулять с собаками, учить ходить на поводке, социализировать." },
  { role: "caretaker", icon: Sparkles, text: "Кормить, убирать, вычёсывать и просто быть рядом." },
  { role: "photographer", icon: Camera, text: "Делать фото и видео, которые помогают найти хозяев." },
  { role: "driver", icon: Car, text: "Возить хвостов к ветеринару и на выставки-пристройства." },
]

const volunteerSchema = z.object({
  name: z.string().trim().min(2, { error: "Как к вам обращаться? Нужно хотя бы 2 буквы" }),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length === 11, { error: "Кажется, в номере не хватает цифр" }),
  email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
  direction: z.enum(["walker", "caretaker", "photographer", "driver"], { error: "Выберите, чем хотите помогать" }),
  days: z.array(z.string()).min(1, { error: "Отметьте хотя бы один удобный день" }),
})

function VolunteerForm() {
  const { register, control, handleSubmit, formState, reset } = useForm<z.infer<typeof volunteerSchema>>({
    resolver: zodResolver(volunteerSchema),
    mode: "onTouched",
    defaultValues: { name: "", phone: "", email: "", days: [] },
  })
  const e = formState.errors
  const onSubmit = handleSubmit(async (v) => {
    await api.sendVolunteerRequest({ ...v, at: new Date().toISOString() })
    reset()
    toast.success("Спасибо! Координатор позвонит в течение недели и пригласит на знакомство 🐾")
  })
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8">
      <h3 className="text-2xl leading-8">Анкета волонтёра</h3>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Имя" required error={e.name?.message}>
          <Input autoComplete="name" {...register("name")} />
        </Field>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <Field label="Телефон" required error={e.phone?.message}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (___) ___-__-__"
                value={field.value}
                onChange={(ev) => field.onChange(ev.target.value ? formatPhone(ev.target.value) : "")}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </Field>
          )}
        />
        <Field label="Email" required error={e.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <Field label="Направление" required error={e.direction?.message}>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" onBlur={field.onBlur}>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {directions.map((d) => (
                    <SelectItem key={d.role} value={d.role}>
                      {volunteerRoleLabel[d.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </div>
      <Controller
        control={control}
        name="days"
        render={({ field }) => (
          <FieldSet legend="Удобные дни *" error={e.days?.message}>
            <div className="flex flex-wrap gap-2">
              {weekdays.map((d) => {
                const checked = field.value.includes(d)
                return (
                  <label
                    key={d}
                    className={cn(
                      "flex h-12 min-w-16 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 font-semibold transition has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-ring",
                      checked ? "border-secondary-foreground bg-accent text-secondary-foreground" : "border-input/50 hover:border-secondary-border",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => field.onChange(c ? [...field.value, d] : field.value.filter((x) => x !== d))}
                    />
                    {d}
                  </label>
                )
              })}
            </div>
          </FieldSet>
        )}
      />
      <Button type="submit" size="lg" className="self-start" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" />} Стать волонтёром
      </Button>
    </form>
  )
}

const amounts = [300, 500, 1000, 3000]

function Donate() {
  const [amount, setAmount] = useState<number | "custom">(500)
  const [custom, setCustom] = useState("")
  const [open, setOpen] = useState(false)
  const value = amount === "custom" ? Number(custom) : amount
  const valid = Number.isFinite(value) && value >= 50
  const requisites = "АНО «Добрый дом», ИНН 7800000000, р/с 40703810000000000000, БИК 044030000"

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6 rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8">
        <FieldSet legend={<span className="text-lg font-bold">Сумма пожертвования</span>}>
          <div role="radiogroup" aria-label="Сумма" className="flex flex-wrap gap-2">
            {amounts.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={amount === a}
                onClick={() => setAmount(a)}
                className={cn(
                  "h-12 rounded-lg border px-6 text-lg font-bold transition",
                  amount === a ? "border-secondary-foreground bg-accent text-secondary-foreground" : "border-input/50 hover:border-secondary-border",
                )}
              >
                {formatNumber(a)} ₽
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={amount === "custom"}
              onClick={() => setAmount("custom")}
              className={cn(
                "h-12 rounded-lg border px-6 text-lg font-bold transition",
                amount === "custom" ? "border-secondary-foreground bg-accent text-secondary-foreground" : "border-input/50 hover:border-secondary-border",
              )}
            >
              Своя сумма
            </button>
          </div>
        </FieldSet>
        {amount === "custom" && (
          <Field label="Ваша сумма, ₽" hint="От 50 ₽" error={custom && !valid ? "Минимальная сумма — 50 ₽" : undefined}>
            <Input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 7))} autoFocus />
          </Field>
        )}
        <p className="text-muted-foreground">
          {valid && value >= 1000
            ? "Этого хватит на месяц корма для щенка 🐶"
            : valid
              ? "Этого хватит на неделю корма для кошки 🐱"
              : "Любая сумма важна."}
        </p>
        <Button size="lg" className="self-start" disabled={!valid} onClick={() => setOpen(true)}>
          <HandCoins /> Помочь {valid && `${formatNumber(value)} ₽`}
        </Button>
      </div>
      <div className="flex flex-col gap-4 rounded-3xl bg-secondary p-6 md:p-8">
        <h3 className="text-lg">Перевод по реквизитам</h3>
        <p className="text-sm leading-6 break-words">{requisites}</p>
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(requisites)
              toast.success("Реквизиты скопированы")
            } catch {
              toast.error("Не получилось скопировать — выделите текст вручную")
            }
          }}
        >
          <Copy /> Скопировать
        </Button>
        <p className="text-sm text-foreground/80">Назначение платежа: «Благотворительное пожертвование».</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Здесь будет платёжный виджет</DialogTitle>
            <DialogDescription>
              В демо-версии оплата не подключена. В рабочей версии тут откроется форма банка на {formatNumber(value || 0)} ₽.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Понятно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function HelpPage() {
  const anchors = [
    { id: "volunteer", label: "Волонтёрство" },
    { id: "donate", label: "Донат" },
    { id: "needs", label: "Нужды приюта" },
  ]
  return (
    <>
      <PageHeader
        title="Как помочь 💛"
        subtitle="Время, деньги, вещи или просто репост — любая помощь превращается в миски, лечение и новые дома."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Как помочь" }]}
      >
        <nav aria-label="Разделы страницы" className="flex flex-wrap gap-2">
          {anchors.map((a) => (
            <Button key={a.id} asChild variant="outline">
              <a href={`#${a.id}`}>{a.label}</a>
            </Button>
          ))}
        </nav>
      </PageHeader>

      <section id="volunteer" className="container-page section-y scroll-mt-20" aria-labelledby="volunteer-title">
        <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
          <h2 id="volunteer-title" className="text-3xl leading-10">
            Стать волонтёром
          </h2>
          <p className="text-lg leading-7 text-muted-foreground">
            Хватит пары часов в неделю. Перед первой сменой проведём инструктаж и познакомим с хвостами.
          </p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {directions.map((d) => (
              <li key={d.role} className="flex gap-4 rounded-2xl bg-secondary p-6">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-card text-secondary-foreground">
                  <d.icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg">{volunteerRoleLabel[d.role]}</h3>
                  <p className="text-foreground/80">{d.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <VolunteerForm />
        </div>
      </section>

      <section id="donate" className="bg-secondary/40 section-y scroll-mt-20" aria-labelledby="donate-title">
        <div className="container-page">
          <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
            <h2 id="donate-title" className="text-3xl leading-10">
              Сделать донат
            </h2>
            <p className="text-lg leading-7 text-muted-foreground">
              Корм, лечение, стерилизации и отопление вольеров — всё это оплачивается пожертвованиями.
            </p>
          </div>
          <Donate />
        </div>
      </section>

      <section id="needs" className="container-page section-y scroll-mt-20" aria-labelledby="needs-title">
        <div className="mb-8 flex max-w-2xl flex-col gap-2 md:mb-12">
          <h2 id="needs-title" className="text-3xl leading-10">
            Привезти вещи и корм
          </h2>
          <p className="text-lg leading-7 text-muted-foreground">
            Что нужно прямо сейчас. Привозите ежедневно с 11 до 19 — или закажите доставку на адрес приюта.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {needs.map((n) => {
            const pct = Math.round((n.have / n.goal) * 100)
            return (
              <li key={n.title} className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
                <div className="flex items-start gap-4">
                  <Package className="mt-1 size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <h3 className="text-lg leading-7">{n.title}</h3>
                </div>
                <Progress value={pct} aria-label={`${n.title}: собрано ${pct}%`} className="h-2 bg-secondary" />
                <p className="text-sm text-muted-foreground">
                  Собрано {formatNumber(n.have)} из {formatNumber(n.goal)} {n.unit}
                </p>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
