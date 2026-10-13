/*
 * Простые графики на CSS — без библиотек: столбики и горизонтальные полосы.
 * У каждого графика есть скрытая таблица с теми же числами для скринридеров.
 */
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Series<K extends string> = { key: K; label: string; className: string }

/** Столбики по периодам, каждый столбик сложен из серий (например, статусы заявок) */
export function StackedBars<K extends string, T extends Record<K, number>>({
  data,
  series,
  label,
  caption,
  marker,
}: {
  data: (T & { label: string })[]
  series: Series<K>[]
  /** подпись графика для скринридера */
  caption: string
  label?: ReactNode
  /** значок над столбиком (например, сколько питомцев уехало домой) */
  marker?: (d: T) => ReactNode
}) {
  const total = (d: T) => series.reduce((s, x) => s + d[x.key], 0)
  const max = Math.max(1, ...data.map(total))
  // Чётная верхняя граница шкалы — чтобы средняя линия сетки была целым числом
  const top = Math.ceil(max / 2) * 2
  return (
    <figure className="flex flex-col gap-4">
      {label}
      <div aria-hidden="true" className="flex gap-2">
        <div className="flex h-52 flex-col justify-between pt-5 pb-6 text-right text-xs leading-none text-muted-foreground tabular-nums">
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        {/* pt-5 — место для значка над самым высоким столбиком */}
        <div className="relative flex h-52 min-w-0 flex-1 items-end gap-1 pt-5 sm:gap-2">
          <div className="pointer-events-none absolute inset-x-0 top-5 bottom-6 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-t border-dashed border-border" />
            ))}
          </div>
          {data.map((d, i) => (
            <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {marker && <div className="text-xs leading-4">{marker(d)}</div>}
              <div
                className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md transition group-hover:opacity-80"
                style={{ height: `calc((100% - 1.5rem) * ${total(d) / top})` }}
                title={`${d.label}: ${series.map((s) => `${s.label.toLowerCase()} ${d[s.key]}`).join(", ")}`}
              >
                {series.map((s) => (d[s.key] ? <div key={s.key} className={s.className} style={{ flexGrow: d[s.key] }} /> : null))}
              </div>
              <span className={cn("h-5 text-[11px] text-muted-foreground tabular-nums sm:text-xs", i % 2 === 1 && "max-sm:invisible")}>
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3 rounded-sm", s.className)} />
            {s.label}
          </span>
        ))}
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Период</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.label}</th>
                {series.map((s) => (
                  <td key={s.key}>{d[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/** Горизонтальные полосы: воронка, причины, спрос */
export function HBars({
  items,
  max,
  barClassName = "bg-secondary-foreground",
  format = String,
}: {
  items: { label: ReactNode; value: number; hint?: ReactNode; className?: string }[]
  max?: number
  barClassName?: string
  format?: (n: number) => string
}) {
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.value)))
  return (
    <ul className="flex flex-col gap-4">
      {items.map((it, i) => (
        <li key={i} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0">{it.label}</span>
            <span className="shrink-0 font-bold tabular-nums">
              {format(it.value)}
              {it.hint && <span className="ml-2 font-normal text-muted-foreground">{it.hint}</span>}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full", it.className ?? barClassName)} style={{ width: `${(it.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
