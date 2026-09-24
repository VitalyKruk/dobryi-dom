import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { SadDog } from "@/components/illustrations"

export default function NotFoundPage({
  title = "Кажется, эта страница убежала гулять 🐶",
  text = "Такой страницы нет — возможно, ссылка устарела или в адресе опечатка. Зато на главной вас ждут десятки хвостов.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="container-page section-y flex flex-col items-center gap-6 text-center">
      <SadDog className="h-40 w-auto md:h-56" />
      <p className="text-sm font-bold tracking-widest text-secondary-foreground">ОШИБКА 404</p>
      <h1 className="max-w-xl text-3xl leading-10 md:text-4xl md:leading-12">{title}</h1>
      <p className="max-w-md text-lg leading-7 text-muted-foreground">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="lg">
          <Link to="/">На главную</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/catalog">В каталог</Link>
        </Button>
      </div>
    </section>
  )
}
