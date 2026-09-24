import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CatInBox, SadDog } from "@/components/illustrations"
import { cn } from "@/lib/utils"

export function EmptyState({
  title,
  text,
  action,
  illustration = <CatInBox className="h-32 w-auto md:h-40" />,
  className,
}: {
  title: string
  text?: ReactNode
  action?: ReactNode
  illustration?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center md:py-16", className)}>
      {illustration}
      <h3 className="text-xl leading-7">{title}</h3>
      {text && <p className="max-w-md text-muted-foreground">{text}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      className={className}
      illustration={<SadDog className="h-32 w-auto md:h-40" />}
      title="Что-то пошло не так"
      text="Не получилось загрузить данные. Проверьте соединение и попробуйте ещё раз — мы пока погладим щенка."
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw /> Попробовать ещё раз
          </Button>
        )
      }
    />
  )
}
