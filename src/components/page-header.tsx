import { Fragment, type ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"

export type Crumb = { label: string; to?: string }

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {c.to ? (
                <BreadcrumbLink asChild>
                  <Link to={c.to}>{c.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Шапка внутренней страницы на голубом блоке (30 %) */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  children,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  crumbs?: Crumb[]
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("bg-secondary", className)}>
      <div className="container-page flex flex-col gap-4 py-8 md:py-12">
        {crumbs && <Crumbs items={crumbs} />}
        <h1 className="text-3xl leading-10 md:text-4xl md:leading-12">{title}</h1>
        {subtitle && <p className="max-w-2xl text-lg leading-7 text-foreground/80">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
