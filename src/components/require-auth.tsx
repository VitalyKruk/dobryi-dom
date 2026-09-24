import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth, type Permission } from "@/context/auth"
import { EmptyState } from "@/components/states"
import { SadDog } from "@/components/illustrations"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"

/** Гостя отправляет на /login и возвращает обратно после входа */
export function RequireAuth({ permission, children }: { permission?: Permission; children: ReactNode }) {
  const { user, can } = useAuth()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (permission && !can(permission)) {
    return (
      <div className="container-page section-y">
        <EmptyState
          illustration={<SadDog className="h-32 w-auto md:h-40" />}
          title="Сюда могут только сотрудники приюта"
          text="Если вы волонтёр, попросите администратора выдать доступ."
          action={
            <Button asChild variant="outline">
              <Link to="/">На главную</Link>
            </Button>
          }
        />
      </div>
    )
  }
  return <>{children}</>
}
