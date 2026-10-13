import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Clock, Loader2, Mail, MapPin, Phone } from "lucide-react"
import { toast } from "sonner"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/field"
import { PageHeader } from "@/components/page-header"
import * as api from "@/lib/api"
import { MapEmbed } from "./about"

const feedbackSchema = z.object({
  name: z.string().trim().min(2, { error: "Как к вам обращаться? Нужно хотя бы 2 буквы" }),
  email: z.email({ error: "Проверьте адрес — похоже, в нём опечатка" }),
  message: z.string().trim().min(10, { error: "Напишите чуть подробнее — хотя бы пару слов" }).max(2000),
})

export function ContactsPage() {
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    mode: "onTouched",
  })
  const onSubmit = handleSubmit(async (v) => {
    await api.sendFeedback(v)
    reset({ name: "", email: "", message: "" })
    toast.success("Сообщение отправлено! Ответим в течение дня 📬")
  })
  const contacts = [
    { icon: MapPin, label: "Адрес", value: "Санкт-Петербург, ул. Солнечная, 12" },
    { icon: Phone, label: "Телефон", value: "+7 (812) 123-45-67", href: "tel:+78121234567" },
    { icon: Mail, label: "Почта", value: "hello@dobryi-dom.ru", href: "mailto:hello@dobryi-dom.ru" },
    { icon: Clock, label: "Часы работы", value: "Ежедневно, 11:00–19:00" },
  ]
  return (
    <>
      <PageHeader
        title="Контакты"
        subtitle="Приезжайте в гости, звоните или пишите — мы всегда рады поговорить о хвостах."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Контакты" }]}
      />
      <div className="container-page section-y grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col gap-6">
          <ul className="grid gap-4 sm:grid-cols-2">
            {contacts.map((c) => (
              <li key={c.label} className="flex gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <c.icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  {c.href ? (
                    <a href={c.href} className="font-bold break-words hover:underline">
                      {c.value}
                    </a>
                  ) : (
                    <p className="font-bold">{c.value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <MapEmbed />
        </div>
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-6 self-start rounded-3xl bg-card p-6 ring-1 ring-foreground/5 md:p-8"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl leading-8">Напишите нам</h2>
            <p className="text-muted-foreground">
              Вопрос про конкретного питомца? Быстрее всего — оставить{" "}
              <Link to="/catalog" className="font-semibold text-secondary-foreground underline">
                заявку на его странице
              </Link>
              .
            </p>
          </div>
          <Field label="Имя" required error={formState.errors.name?.message}>
            <Input autoComplete="name" {...register("name")} />
          </Field>
          <Field label="Email" required error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Сообщение" required error={formState.errors.message?.message}>
            <Textarea rows={6} {...register("message")} />
          </Field>
          <Button type="submit" size="lg" className="self-start" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />} Отправить
          </Button>
        </form>
      </div>
    </>
  )
}

const faq = [
  {
    q: "Сколько стоит забрать питомца?",
    a: "Нисколько. Мы просим только подписать договор ответственного содержания. Если захотите — можете сделать добровольное пожертвование приюту.",
  },
  {
    q: "Какие документы нужны?",
    a: "Паспорт. Договор оформим на месте, это займёт около 20 минут. Ветпаспорт питомца с отметками о прививках мы выдадим.",
  },
  {
    q: "Можно ли сначала познакомиться?",
    a: "Обязательно! Мы даже настаиваем. Приезжайте, погуляйте, поиграйте — можно прийти несколько раз, прежде чем принимать решение.",
  },
  {
    q: "Я живу в съёмной квартире — мне откажут?",
    a: "Нет. Главное — согласие хозяина квартиры на животное. Мы можем попросить подтвердить это при оформлении.",
  },
  {
    q: "У меня нет опыта. Это проблема?",
    a: "Совсем нет. Кураторы подберут питомца с подходящим характером, дадут памятку и будут на связи после переезда.",
  },
  {
    q: "Что если питомец не приживётся?",
    a: "Такое бывает. Позвоните нам — поможем советом, подключим кинолога или фелинолога. Если ничего не получится, мы примем питомца обратно. Пожалуйста, не отдавайте его третьим лицам.",
  },
  {
    q: "Питомцы стерилизованы и привиты?",
    a: "Все взрослые животные — да. Малышей стерилизуют по возрасту: мы напомним и поможем со скидкой в клинике-партнёре.",
  },
  {
    q: "Можно ли забрать питомца в другой город?",
    a: "Да, но мы попросим приехать на знакомство лично и будем держать связь первые месяцы. Доставку помогут организовать автоволонтёры.",
  },
  {
    q: "Почему заявку могут отклонить?",
    a: "Чаще всего — из-за несовместимости: например, питомец не ладит с кошками, а у вас их две. Мы всегда объясняем причину и предлагаем других хвостов.",
  },
]

export function FaqPage() {
  return (
    <>
      <PageHeader
        title="Частые вопросы"
        subtitle="Собрали ответы на то, что спрашивают чаще всего. Не нашли свой вопрос — напишите нам!"
        crumbs={[{ label: "Главная", to: "/" }, { label: "Вопросы" }]}
      />
      <div className="container-page section-y grid gap-8 lg:grid-cols-[2fr_1fr] lg:gap-12">
        <Accordion type="single" collapsible defaultValue="q0" className="rounded-3xl bg-card px-6 ring-1 ring-foreground/5 md:px-8">
          {faq.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`} className={i === faq.length - 1 ? "border-b-0" : ""}>
              <AccordionTrigger className="py-6 text-left text-lg font-bold">{f.q}</AccordionTrigger>
              <AccordionContent className="pb-6 text-base leading-7 text-foreground/90">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <aside className="flex flex-col gap-4 self-start rounded-3xl bg-secondary p-6 md:p-8">
          <h2 className="text-xl">Остались вопросы?</h2>
          <p className="text-foreground/80">Позвоните нам: +7 (812) 123-45-67, ежедневно с 11 до 19 — или напишите через форму.</p>
          <Button asChild variant="outline" className="self-start">
            <Link to="/contacts">Написать нам</Link>
          </Button>
        </aside>
      </div>
    </>
  )
}

export function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Политика конфиденци&shy;альности"
        subtitle="Коротко и по-человечески: какие данные мы собираем и зачем."
        crumbs={[{ label: "Главная", to: "/" }, { label: "Политика конфиденциальности" }]}
      />
      <article className="container-page section-y flex max-w-3xl flex-col gap-4 text-lg leading-7">
        <h2 className="text-2xl leading-8">Какие данные мы собираем</h2>
        <p>Имя, телефон, email и город, а также ответы из анкеты на усыновление или волонтёрство.</p>
        <h2 className="mt-4 text-2xl leading-8">Зачем</h2>
        <p>
          Чтобы связаться с вами по заявке, подобрать подходящего питомца и сообщить о статусе. Мы не передаём данные третьим лицам и не
          рассылаем рекламу.
        </p>
        <h2 className="mt-4 text-2xl leading-8">Как удалить данные</h2>
        <p>
          Напишите на hello@dobryi-dom.ru — удалим в течение 3 рабочих дней. Это демо-версия сайта: данные хранятся только в вашем браузере.
        </p>
      </article>
    </>
  )
}
