import { useEffect } from "react"
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SadDog } from "@/components/illustrations"
import { reportError } from "@/lib/report-error"

/**
 * Сбой при отрисовке страницы (errorElement роутера). Вместо стандартного экрана React Router —
 * понятное сообщение, а сама ошибка уходит в серверный лог.
 */
export function RouteError() {
  const error = useRouteError()
  useEffect(() => {
    if (!isRouteErrorResponse(error)) reportError("render", error)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-12 text-center">
      <SadDog className="h-40 w-auto md:h-48" />
      <h1 className="max-w-xl text-3xl leading-10">Страница сломалась — мы уже знаем об этом</h1>
      <p className="max-w-md text-lg leading-7 text-muted-foreground">
        Ошибку записали в журнал, команда её посмотрит. Попробуйте обновить страницу или вернитесь на главную.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={() => window.location.reload()}>
          <RotateCcw /> Обновить страницу
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/">На главную</Link>
        </Button>
      </div>
    </main>
  )
}
