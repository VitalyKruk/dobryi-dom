import { FlaskConical, X } from "lucide-react"
import { demoMode, demoModeLabel, setDemoMode, type DemoMode } from "@/lib/demo"
import { cn } from "@/lib/utils"

/** Плашка активного демо-режима: видно, что ошибка или пустота имитированы, и её легко выключить */
export function DemoBanner() {
  const mode = demoMode()
  if (!mode) return null

  const switchTo = (next: DemoMode | null) => {
    setDemoMode(next)
    const url = new URL(window.location.href)
    url.searchParams.delete("demo")
    window.location.replace(url.toString())
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl bg-foreground p-2 pl-4 text-sm text-background shadow-lg"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Демо-режим: <b>{demoModeLabel[mode]}</b>
      </span>
      <span className="flex gap-1">
        {(Object.keys(demoModeLabel) as DemoMode[])
          .filter((m) => m !== mode)
          .map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={cn("rounded-lg px-2 py-1 text-xs font-semibold hover:bg-background/15")}
            >
              {demoModeLabel[m]}
            </button>
          ))}
        <button
          type="button"
          onClick={() => switchTo(null)}
          className="flex items-center gap-1 rounded-lg bg-background/15 px-2 py-1 text-xs font-semibold hover:bg-background/25"
        >
          <X className="size-3.5" aria-hidden="true" /> Выключить
        </button>
      </span>
    </div>
  )
}
