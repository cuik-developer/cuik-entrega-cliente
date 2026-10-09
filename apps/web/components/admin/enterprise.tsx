"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Building blocks of the super-admin "enterprise" look (see `.ent` in
 * globals.css): every page shares the same anatomy, top to bottom:
 * breadcrumbs → title + actions → stat strip → toolbar → table → footer.
 */

export type Crumb = { label: string; href?: string }

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta" className="flex items-center gap-1 text-[11.5px] text-ent-fg-3 min-w-0">
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <span key={c.label} className="flex items-center gap-1 min-w-0">
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-ent-accent hover:underline truncate">
                {c.label}
              </Link>
            ) : (
              <span className={cn("truncate", last && "text-ent-fg-2 font-medium")}>{c.label}</span>
            )}
            {!last && <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
          </span>
        )
      })}
    </nav>
  )
}

/** Breadcrumbs, page title and the actions that belong to the whole page. */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  children,
}: {
  crumbs?: Crumb[]
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      {crumbs && <Crumbs items={crumbs} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[17px] leading-6 font-semibold text-ent-fg tracking-[-0.005em]">
            {title}
          </h1>
          {subtitle && <div className="text-[12.5px] text-ent-fg-3 mt-0.5">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/** White surface with a 1px line. The only "card" the shell uses. */
export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-ent-panel border border-ent-line rounded-[4px] min-w-0", className)}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 h-9 border-b border-ent-line",
        className,
      )}
    >
      <div className="text-[12.5px] font-semibold text-ent-fg truncate">{title}</div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  )
}

/** Filters and search, always above the table. */
export function Toolbar({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 border-b border-ent-line flex-wrap",
        className,
      )}
    >
      {children}
    </div>
  )
}

export type Stat = {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: "ok" | "warn" | "bad" | "mute"
}

const HINT_TONE = {
  ok: "text-ent-ok",
  warn: "text-ent-warn",
  bad: "text-ent-bad",
  mute: "text-ent-fg-3",
}

/** Row of figures separated by lines. No icons, no colored tiles. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <Panel className={cn("grid grid-cols-2 md:grid-cols-4 overflow-hidden", className)}>
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn(
            "px-3 py-2 min-w-0 border-ent-line",
            // Phone (2 columns): a line between the two rows and between the two
            // cells of each row. Desktop (one row): a line between every cell.
            "[&:nth-child(n+3)]:border-t md:[&:nth-child(n+3)]:border-t-0",
            "odd:border-r md:border-r md:last:border-r-0",
          )}
        >
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
            {s.label}
          </div>
          <div className="text-[18px] leading-6 font-semibold text-ent-fg tabular-nums truncate">
            {s.value}
            {s.hint && (
              <span className={cn("text-[11px] font-medium ml-1.5", HINT_TONE[s.tone ?? "mute"])}>
                {s.hint}
              </span>
            )}
          </div>
        </div>
      ))}
    </Panel>
  )
}

export type ChipTone = "ok" | "info" | "warn" | "bad" | "mute"

const CHIP_TONE: Record<ChipTone, string> = {
  ok: "text-ent-ok",
  info: "text-ent-info",
  warn: "text-ent-warn",
  bad: "text-ent-bad",
  mute: "text-ent-fg-3",
}

/** Colored dot + plain text. One style for every status in the shell. */
export function StatusChip({
  tone,
  children,
  title,
  className,
}: {
  tone: ChipTone
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap",
        CHIP_TONE[tone],
        className,
      )}
    >
      <span className="w-2 h-2 rounded-full bg-current shrink-0" aria-hidden="true" />
      <span className="text-ent-fg-2">{children}</span>
    </span>
  )
}

/** Left-side severity stripe + one sentence + optional action. */
export function Notice({
  tone,
  children,
  action,
  className,
}: {
  tone: "ok" | "warn" | "bad" | "info"
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  const stripe = {
    ok: "border-l-ent-ok",
    warn: "border-l-ent-warn",
    bad: "border-l-ent-bad",
    info: "border-l-ent-info",
  }[tone]
  return (
    <Panel
      className={cn(
        "flex items-center gap-3 px-3 py-2 border-l-[3px] text-[12.5px] text-ent-fg-2",
        stripe,
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </Panel>
  )
}

/* ── Dense table primitives ─────────────────────────────────────────── */

export function DataTable({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full text-[13px] border-separate border-spacing-0", className)}
        {...props}
      />
    </div>
  )
}

export function Th({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[1] bg-ent-panel-2 h-[30px] px-2.5 text-[11.5px] font-semibold text-ent-fg-2 border-b border-ent-line-strong whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  )
}

export function Td({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" }) {
  return (
    <td
      className={cn(
        "h-9 px-2.5 border-b border-ent-line align-middle whitespace-nowrap",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-[#f7f9fc] transition-colors", className)} {...props} />
}

/** Row count on the left, pager on the right. */
export function PanelFooter({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 h-9 text-[11.5px] text-ent-fg-3",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Label / value pairs, one per line, for detail views. */
export function FieldList({
  rows,
  className,
}: {
  rows: { label: string; value: React.ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn("grid grid-cols-[minmax(110px,34%)_1fr] text-[12.5px]", className)}>
      {rows.map((r, i) => {
        const last = i === rows.length - 1
        const line = last ? "" : "border-b border-ent-line"
        return (
          <div key={r.label} className="contents">
            <dt className={cn("py-[7px] pr-3 text-ent-fg-3", line)}>{r.label}</dt>
            <dd className={cn("py-[7px] m-0 text-ent-fg min-w-0 break-words", line)}>{r.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Centered message inside a panel (loading, error, nothing to show). */
export function PanelMessage({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-[12.5px] text-ent-fg-3 text-center",
        className,
      )}
    >
      {children}
    </div>
  )
}
