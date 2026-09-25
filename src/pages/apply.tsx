import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, ArrowRight, Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldSet } from "@/components/field"
import { HappyHeart } from "@/components/illustrations"
import { Crumbs } from "@/components/page-header"
import { PetImage, PetStatusBadge, petMeta } from "@/components/pet"
import { ErrorState } from "@/components/states"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { readLS, writeLS } from "@/hooks/use-local-storage"
import * as api from "@/lib/api"
import { experienceLabel, formatPhone, housingLabel, visitTimeLabel } from "@/lib/format"
import type { Application, Pet } from "@/lib/types"
import { cn } from "@/lib/utils"
import NotFoundPage from "./not-found"

const schema = z
  .object({
    name: z.string().trim().min(2, { error: "Как к вам обращаться? Нужно хотя бы 2 буквы" }),
    phone: z.string().refine((v) => v.replace(/\D/g, "").length === 11, { error: "Кажется, в номере не хватает цифр" }),
    email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
    city: z.string().trim().min(2, { error: "Укажите город — так мы поймём, удобно ли вам приехать" }),
    housing: z.enum(["apartment", "house", "other"], { error: "Выберите тип жилья" }),
    hasOtherPets: z.enum(["yes", "no"], { error: "Подскажите, есть ли дома другие животные" }),
    otherPetsNote: z.string().trim().max(300).optional(),
    experience: z.enum(["none", "some", "experienced"], { error: "Выберите вариант — любой ответ подходит" }),
    preferredTime: z.enum(["weekday-morning", "weekday-evening", "weekend"], { error: "Когда вам удобно приехать?" }),
    comment: z.string().max(1000, { error: "Давайте уместимся в 1000 символов" }).optional(),
    consent: z.boolean().refine((v) => v, { error: "Без согласия мы не сможем обработать заявку" }),
  })
  .refine((d) => d.hasOtherPets === "no" || (d.otherPetsNote?.length ?? 0) >= 2, {
    path: ["otherPetsNote"],
    error: "Расскажите в двух словах, кто живёт с вами",
  })

type FormValues = z.input<typeof schema>

const steps: { title: string; fields: (keyof FormValues)[] }[] = [
  { title: "О себе", fields: ["name", "phone", "email", "city"] },
  { title: "Жильё и опыт", fields: ["housing", "hasOtherPets", "otherPetsNote", "experience"] },
  { title: "Пожелания", fields: ["preferredTime", "comment"] },
  { title: "Проверка", fields: ["consent"] },
]

/** Радио-кнопки карточками — крупная зона клика */
function ChoiceCards({
  value,
  onChange,
  options,
  name,
  invalid,
  columns = 3,
}: {
  value?: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint?: string }[]
  name: string
  invalid?: boolean
  columns?: 2 | 3
}) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={onChange}
      aria-invalid={invalid}
      className={cn("grid gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
    >
      {options.map((o) => {
        const id = `${name}-${o.value}`
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={cn(
              "flex min-h-12 cursor-pointer items-start gap-4 rounded-xl border bg-card p-4 transition hover:border-secondary-border has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-ring",
              value === o.value ? "border-secondary-foreground bg-accent" : "border-input/50",
              invalid && !value && "border-destructive",
            )}
          >
            <RadioGroupItem id={id} value={o.value} className="mt-0.5 bg-card" />
            <span className="flex flex-col">
              <span className="font-semibold">{o.label}</span>
              {o.hint && <span className="text-sm text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        )
      })}
    </RadioGroup>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Progress value={((step + 1) / steps.length) * 100} aria-label={`Шаг ${step + 1} из ${steps.length}`} className="h-2 bg-secondary" />
      <ol className="grid grid-cols-4 gap-2 text-center text-xs sm:text-sm">
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex flex-col items-center gap-1",
              i === step ? "font-bold text-foreground" : i < step ? "text-secondary-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                i === step ? "bg-secondary-foreground text-white" : i < step ? "bg-secondary text-secondary-foreground" : "bg-muted",
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="hidden sm:block">{s.title}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground sm:hidden">
        Шаг {step + 1} из {steps.length}: <b className="text-foreground">{steps[step].title}</b>
      </p>
    </div>
  )
}

function Success({ app, pet }: { app: Application; pet: Pet }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <section className="container-page section-y flex flex-col items-center gap-6 text-center">
      <HappyHeart className="h-40 w-auto md:h-48" />
      <h1 ref={ref} tabIndex={-1} className="max-w-2xl text-3xl leading-10 outline-none md:text-4xl md:leading-12">
        Ура! Заявка отправлена 🐾
      </h1>
      <p className="max-w-xl text-lg leading-7 text-muted-foreground">
        Мы свяжемся с вами в течение 1–2 дней. Номер заявки — <b className="text-foreground">{app.id}</b>, {pet.name} уже
        навострил{pet.sex === "female" ? "а" : ""} уши.
      </p>
      <ol className="grid w-full max-w-3xl gap-4 text-left md:grid-cols-3">
        {[
          "Куратор прочитает анкету и позвонит, чтобы познакомиться.",
          "Договоримся о встрече в приюте — можно приехать всей семьёй.",
          "Если всё сложится — оформим договор и поедете домой вместе!",
        ].map((t, i) => (
          <li key={i} className="flex gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">
              {i + 1}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="lg" variant="secondary">
          <Link to="/account">В личный кабинет</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link to="/catalog">Вернуться в каталог</Link>
        </Button>
      </div>
    </section>
  )
}

function Summary({ values, onEdit }: { values: FormValues; onEdit: (step: number) => void }) {
  const blocks = [
    {
      step: 0,
      title: "О себе",
      rows: [
        ["Имя", values.name],
        ["Телефон", values.phone],
        ["Email", values.email],
        ["Город", values.city],
      ],
    },
    {
      step: 1,
      title: "Жильё и опыт",
      rows: [
        ["Жильё", values.housing && housingLabel[values.housing]],
        ["Другие животные", values.hasOtherPets === "yes" ? values.otherPetsNote || "Да" : "Нет"],
        ["Опыт", values.experience && experienceLabel[values.experience]],
      ],
    },
    {
      step: 2,
      title: "Пожелания",
      rows: [
        ["Время визита", values.preferredTime && visitTimeLabel[values.preferredTime]],
        ["Комментарий", values.comment || "—"],
      ],
    },
  ]
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b) => (
        <div key={b.title} className="rounded-2xl bg-muted p-4 md:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg">{b.title}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(b.step)} aria-label={`Изменить: ${b.title}`}>
              <Pencil /> Изменить
            </Button>
          </div>
          <dl className="grid gap-2 sm:grid-cols-[160px_1fr]">
            {b.rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-sm text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function ApplyForm({ pet }: { pet: Pet }) {
  const { user } = useAuth()
  const draftKey = `dd:apply:${pet.id}`
  const [step, setStep] = useState(0)
  const [sent, setSent] = useState<Application | null>(null)
  const [serverError, setServerError] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      city: user?.city ?? "",
      comment: "",
      otherPetsNote: "",
      consent: false,
      ...readLS<Partial<FormValues>>(draftKey, {}),
    },
  })
  const { register, control, handleSubmit, trigger, formState, getValues } = form
  const values = useWatch({ control })
  const errors = formState.errors

  // Черновик: сохраняем всё, кроме согласия
  useEffect(() => {
    if (sent) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { consent, ...rest } = values
    writeLS(draftKey, rest)
  }, [values, draftKey, sent])

  // Фокус на заголовок шага — скринридер объявит смену шага
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  async function next() {
    const ok = await trigger(steps[step].fields, { shouldFocus: true })
    if (ok) setStep((s) => s + 1)
  }

  const onSubmit = handleSubmit(async (v) => {
    setServerError("")
    try {
      const app = await api.createApplication({
        petId: pet.id,
        name: v.name.trim(),
        phone: v.phone,
        email: v.email.trim(),
        city: v.city.trim(),
        housing: v.housing,
        hasOtherPets: v.hasOtherPets === "yes",
        otherPetsNote: v.hasOtherPets === "yes" ? v.otherPetsNote : undefined,
        experience: v.experience,
        preferredTime: v.preferredTime,
        comment: v.comment || undefined,
      })
      writeLS(draftKey, undefined)
      setSent(app)
      window.scrollTo(0, 0)
      toast.success("Заявка отправлена! 🐾")
    } catch (e) {
      // Сервер перепроверяет анкету: его замечания по полям перечисляем под общим сообщением
      const fields = e instanceof api.ApiError && e.fields ? Object.values(e.fields) : []
      setServerError([(e as Error).message, ...fields].join(" · "))
    }
  })

  if (sent) return <Success app={sent} pet={pet} />


  return (
    <div className="container-page flex flex-col gap-6 pt-6 pb-16 md:pt-8 md:pb-24">
      <Crumbs
        items={[
          { label: "Каталог", to: "/catalog" },
          { label: pet.name, to: `/pet/${pet.id}` },
          { label: "Заявка" },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="order-2 flex flex-col gap-8 rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8 lg:order-1">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl leading-10">Заявка на знакомство 🐾</h1>
            <p className="text-muted-foreground">
              Питомец: <b className="text-foreground">{pet.name}</b>. Займёт 3 минуты, черновик сохраняется — можно вернуться позже.
            </p>
          </div>
          <Stepper step={step} />

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
            <h2 ref={headingRef} tabIndex={-1} className="text-xl outline-none">
              {steps[step].title}
            </h2>

            {step === 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Как вас зовут" required error={errors.name?.message}>
                  <Input autoComplete="name" placeholder="Анна" {...register("name")} />
                </Field>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <Field label="Телефон" required error={errors.phone?.message} hint="Позвоним, чтобы договориться о встрече">
                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+7 (___) ___-__-__"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value ? formatPhone(e.target.value) : "")}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </Field>
                  )}
                />
                <Field label="Email" required error={errors.email?.message}>
                  <Input type="email" autoComplete="email" placeholder="anna@example.com" {...register("email")} />
                </Field>
                <Field label="Город" required error={errors.city?.message}>
                  <Input autoComplete="address-level2" placeholder="Санкт-Петербург" {...register("city")} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-8">
                <FieldSet legend="Где вы живёте? *" error={errors.housing?.message}>
                  <Controller
                    control={control}
                    name="housing"
                    render={({ field }) => (
                      <ChoiceCards
                        name="housing"
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.housing}
                        options={[
                          { value: "apartment", label: "Квартира" },
                          { value: "house", label: "Частный дом" },
                          { value: "other", label: "Другое" },
                        ]}
                      />
                    )}
                  />
                </FieldSet>
                <FieldSet legend="Есть ли дома другие животные? *" error={errors.hasOtherPets?.message}>
                  <Controller
                    control={control}
                    name="hasOtherPets"
                    render={({ field }) => (
                      <ChoiceCards
                        name="other"
                        columns={2}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.hasOtherPets}
                        options={[
                          { value: "no", label: "Нет" },
                          { value: "yes", label: "Да" },
                        ]}
                      />
                    )}
                  />
                </FieldSet>
                {values.hasOtherPets === "yes" && (
                  <Field label="Кто живёт с вами?" required error={errors.otherPetsNote?.message} hint="Например: кошка, 5 лет, спокойная">
                    <Input {...register("otherPetsNote")} />
                  </Field>
                )}
                <FieldSet legend="Опыт содержания животных *" error={errors.experience?.message}>
                  <Controller
                    control={control}
                    name="experience"
                    render={({ field }) => (
                      <ChoiceCards
                        name="experience"
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.experience}
                        options={[
                          { value: "none", label: "Первый питомец", hint: "Поможем советом!" },
                          { value: "some", label: "Были раньше" },
                          { value: "experienced", label: "Большой опыт" },
                        ]}
                      />
                    )}
                  />
                </FieldSet>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-8">
                <FieldSet legend="Когда удобно приехать познакомиться? *" error={errors.preferredTime?.message}>
                  <Controller
                    control={control}
                    name="preferredTime"
                    render={({ field }) => (
                      <ChoiceCards
                        name="time"
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.preferredTime}
                        options={[
                          { value: "weekday-morning", label: "Будни, утро", hint: "11:00–14:00" },
                          { value: "weekday-evening", label: "Будни, вечер", hint: "15:00–19:00" },
                          { value: "weekend", label: "Выходные", hint: "11:00–19:00" },
                        ]}
                      />
                    )}
                  />
                </FieldSet>
                <Field
                  label="Комментарий"
                  error={errors.comment?.message}
                  hint={`Почему именно ${pet.name}? Любые вопросы и пожелания. ${(values.comment ?? "").length}/1000`}
                >
                  <Textarea rows={5} {...register("comment")} />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-6">
                <Summary values={getValues()} onEdit={setStep} />
                <Controller
                  control={control}
                  name="consent"
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="consent" className="flex cursor-pointer items-start gap-4">
                        <Checkbox
                          id="consent"
                          checked={field.value}
                          onCheckedChange={(c) => field.onChange(c === true)}
                          aria-invalid={!!errors.consent}
                          aria-describedby={errors.consent ? "consent-error" : undefined}
                          className="mt-0.5"
                        />
                        <span className="text-sm leading-6">
                          Согласен(на) на обработку персональных данных по{" "}
                          <Link to="/privacy" target="_blank" className="font-semibold text-secondary-foreground underline">
                            политике конфиденциальности
                          </Link>
                        </span>
                      </label>
                      {errors.consent && (
                        <p id="consent-error" role="alert" className="text-sm text-destructive">
                          {errors.consent.message}
                        </p>
                      )}
                    </div>
                  )}
                />
                {serverError && (
                  <p role="alert" className="rounded-2xl bg-warning p-4 text-warning-foreground">
                    {serverError}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-between">
              {step > 0 ? (
                <Button type="button" variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft /> Назад
                </Button>
              ) : (
                <span />
              )}
              {step < steps.length - 1 ? (
                // Разные key: иначе React превратит ту же кнопку в submit посреди клика и форма отправится сразу
                <Button key="next" type="button" variant="secondary" size="lg" onClick={next}>
                  Далее <ArrowRight />
                </Button>
              ) : (
                <Button key="submit" type="submit" size="lg" disabled={formState.isSubmitting} className="sm:min-w-56">
                  {formState.isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" /> Отправляем…
                    </>
                  ) : (
                    "Отправить заявку"
                  )}
                </Button>
              )}
            </div>
          </form>
        </div>

        <aside className="order-1 lg:order-2" aria-label="Питомец">
          <div className="flex items-center gap-4 rounded-3xl bg-secondary p-4 lg:sticky lg:top-24 lg:flex-col lg:items-stretch lg:p-6">
            <PetImage src={pet.photos[0]} alt={pet.name} width={320} className="w-24 shrink-0 rounded-2xl lg:w-full" />
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-xl font-bold">{pet.name}</p>
              <p className="text-sm text-foreground/80">{petMeta(pet)}</p>
              <PetStatusBadge status={pet.status} sex={pet.sex} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function ApplyPage() {
  const { petId = "" } = useParams()
  const { status, data: pet, reload } = useAsync(() => api.getPet(petId), [petId])
  if (status === "loading")
    return (
      <div className="container-page flex flex-col gap-6 py-8">
        <Skeleton className="h-6 w-60" />
        <Skeleton className="h-[480px] w-full rounded-3xl" />
      </div>
    )
  if (status === "error")
    return (
      <div className="container-page section-y">
        <ErrorState onRetry={reload} />
      </div>
    )
  if (!pet || pet.status === "adopted")
    return (
      <NotFoundPage
        title={pet ? `${pet.name} уже дома 💛` : "Такого питомца мы не нашли 🐾"}
        text="Заявку на этого питомца оставить нельзя. Загляните в каталог — там ждут другие хвосты."
      />
    )
  return <ApplyForm pet={pet} />
}
