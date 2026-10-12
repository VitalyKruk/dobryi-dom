import { useEffect, useRef } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HappyHeart } from "@/components/illustrations"
import { FAKE_DOORS, fakeDoorThanks, isFakeDoor } from "@/lib/fake-door"
import NotFoundPage from "./not-found"

/**
 * Страница фейкдора: сюда ведут кнопки функций, которых ещё нет (оплата доната, соцсети).
 * Переход засчитывает сама кнопка (api.trackFakeDoor) — здесь только объяснение для посетителя.
 */
export default function SoonPage() {
  const { feature } = useParams()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  if (!isFakeDoor(feature)) return <NotFoundPage />

  return (
    <section className="container-page section-y flex flex-col items-center gap-6 text-center">
      <HappyHeart className="h-40 w-auto md:h-48" />
      <p className="text-sm font-bold tracking-widest text-secondary-foreground uppercase">{FAKE_DOORS[feature]}</p>
      <h1 ref={heading} tabIndex={-1} className="max-w-2xl text-3xl leading-10 outline-none md:text-4xl md:leading-12">
        Данный раздел находится в разработке
      </h1>
      <p className="max-w-xl text-lg leading-7 text-muted-foreground">
        {fakeDoorThanks(feature)} В скором времени сервис заработает.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" variant="secondary" onClick={() => navigate(-1)}>
          <ArrowLeft /> Вернуться назад
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link to="/catalog">В каталог питомцев</Link>
        </Button>
      </div>
    </section>
  )
}
