import { useSearchParams } from "react-router-dom"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function pages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | "…")[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…")
    out.push(n)
  })
  return out
}

export function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const [params] = useSearchParams()
  if (total <= 1) return null
  // href сохраняет фильтры из адреса — иначе «открыть в новой вкладке» их теряет
  const href = (p: number) => {
    const next = new URLSearchParams(params)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    const qs = next.toString()
    return qs ? `?${qs}` : "?"
  }
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (p >= 1 && p <= total && p !== page) onChange(p)
  }
  return (
    <Pagination>
      <PaginationContent className="gap-1">
        <PaginationItem>
          <PaginationPrevious
            href={href(page - 1)}
            onClick={go(page - 1)}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
        {pages(page, total).map((p, i) =>
          p === "…" ? (
            <PaginationItem key={`e${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink href={href(p)} isActive={p === page} onClick={go(p)} aria-label={`Страница ${p}`}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href={href(page + 1)}
            onClick={go(page + 1)}
            aria-disabled={page === total}
            className={page === total ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
