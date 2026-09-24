import { Link } from "react-router-dom"
import { PawIcon } from "@/components/illustrations"
import { cn } from "@/lib/utils"

export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 rounded-lg text-lg font-extrabold tracking-tight", className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <PawIcon className="size-6" />
      </span>
      <span>Добрый дом</span>
    </Link>
  )
}
