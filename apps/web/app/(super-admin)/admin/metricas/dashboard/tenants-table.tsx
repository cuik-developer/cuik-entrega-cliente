"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import type { TenantMetricsRow } from "@/lib/admin/platform-metrics"

type SortKey =
  | "name"
  | "visits"
  | "delta"
  | "newClients"
  | "returnRate"
  | "installRate"
  | "redemptions"
  | "lastVisitAt"
  | "trialDaysLeft"
  | "clients"

const HEALTH_DOT: Record<TenantMetricsRow["health"], string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  bad: "bg-red-500",
  none: "bg-slate-300",
}
const HEALTH_LABEL: Record<TenantMetricsRow["health"], string> = {
  good: "Activo esta semana",
  warn: "Sin visitas hace 8-30 días",
  bad: "Sin visitas hace más de 30 días",
  none: "Sin clientes",
}

function daysAgo(iso: string | null): string {
  if (!iso) return "nunca"
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} d`
}

/** The decision table: one row per tenant, sortable, searchable, with deltas. */
export function TenantsTable({
  rows,
  highlightIds,
  onClearHighlight,
}: {
  rows: TenantMetricsRow[]
  highlightIds: string[]
  onClearHighlight: () => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "visits",
    dir: "desc",
  })
  const [q, setQ] = useState("")
  const highlight = new Set(highlightIds)

  const sorted = useMemo(() => {
    const val = (t: TenantMetricsRow): number | string => {
      switch (sort.key) {
        case "name":
          return t.name.toLowerCase()
        case "delta":
          return t.visits - t.visitsPrev
        case "lastVisitAt":
          return t.lastVisitAt ? Date.parse(t.lastVisitAt) : 0
        case "trialDaysLeft":
          return t.trialDaysLeft ?? 9999
        case "returnRate":
          return t.returnRate ?? -1
        case "installRate":
          return t.installRate ?? -1
        default:
          return t[sort.key]
      }
    }
    const filtered = rows.filter(
      (t) =>
        (highlight.size === 0 || highlight.has(t.id)) &&
        (q.trim() === "" ||
          t.name.toLowerCase().includes(q.toLowerCase()) ||
          t.slug.includes(q.toLowerCase())),
    )
    return filtered.sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv)
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [rows, sort, q, highlight])

  function th(key: SortKey, label: string, align: "left" | "right" = "right") {
    const active = sort.key === key
    const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <th className={`pb-2 font-semibold text-${align} whitespace-nowrap`}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
          onClick={() => setSort({ key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        >
          {label}
          <Icon className="w-3 h-3" />
        </button>
      </th>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Comercios</h3>
          <p className="text-xs text-slate-400">
            {sorted.length} de {rows.length} · clic en una columna para ordenar, en el nombre para
            abrir el tenant
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {highlight.size > 0 && (
            <button
              type="button"
              onClick={onClearHighlight}
              className="text-xs text-[#0e70db] hover:underline"
            >
              Quitar foco ({highlight.size})
            </button>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar comercio"
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-100">
              <th className="pb-2 text-left font-semibold">Salud</th>
              {th("name", "Comercio", "left")}
              {th("clients", "Clientes")}
              {th("newClients", "Nuevos")}
              {th("visits", "Visitas")}
              {th("delta", "vs ant.")}
              {th("returnRate", "Retorno")}
              {th("installRate", "Instalan")}
              {th("redemptions", "Canjes")}
              {th("lastVisitAt", "Última visita")}
              {th("trialDaysLeft", "Demo")}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-sm text-slate-400">
                  Ningún comercio coincide.
                </td>
              </tr>
            ) : (
              sorted.map((t) => {
                const d = t.visits - t.visitsPrev
                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-2">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${HEALTH_DOT[t.health]}`}
                        title={HEALTH_LABEL[t.health]}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/tenants?q=${encodeURIComponent(t.name)}`}
                        className="font-medium text-slate-900 hover:text-[#0e70db]"
                      >
                        {t.name}
                      </Link>
                      <div className="text-[11px] text-slate-400">
                        {t.status === "trial"
                          ? "Demo"
                          : t.status === "active"
                            ? "Activo"
                            : t.status}
                        {t.plan ? ` · ${t.plan}` : ""}
                        {t.program ? ` · ${t.program === "points" ? "Puntos" : "Sellos"}` : ""}
                        {t.activePromotions > 1 ? " · ⚠ 2 promos activas" : ""}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{t.clients}</td>
                    <td className="py-2 text-right tabular-nums">{t.newClients}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{t.visits}</td>
                    <td
                      className={`py-2 text-right tabular-nums text-xs ${d > 0 ? "text-emerald-600" : d < 0 ? "text-red-500" : "text-slate-400"}`}
                    >
                      {d > 0 ? "+" : ""}
                      {d}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.returnRate === null ? "—" : `${t.returnRate}%`}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.installRate === null ? "—" : `${t.installRate}%`}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.redemptions}
                      {t.program === "points" && t.canRedeem > 0 && (
                        <span className="text-[10px] text-slate-400"> · {t.canRedeem} pueden</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs text-slate-500 whitespace-nowrap">
                      {daysAgo(t.lastVisitAt)}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      {t.trialDaysLeft === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={
                            t.trialDaysLeft <= 7 ? "text-amber-600 font-medium" : "text-slate-500"
                          }
                        >
                          {t.trialDaysLeft <= 0 ? "vencida" : `${t.trialDaysLeft} d`}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
