"use client"

import { useEffect, useState } from "react"
import { PageHeader, Panel } from "@/components/admin/enterprise"
import { ExportBuilder } from "@/components/exports/export-builder"

type TenantOption = {
  id: string
  name: string
  slug: string
  status: string
  program: "stamps" | "points" | null
}

const PROGRAM_LABEL = { stamps: "sellos", points: "puntos" }

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  trial: "Demo",
  active: "Activo",
  expired: "Vencido",
  cancelled: "Cancelado",
  paused: "Pausado",
}

/** Super-admin "Exportar datos": pick a tenant, a dataset and the columns. */
export default function ExportPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantId, setTenantId] = useState("")
  const [loading, setLoading] = useState(true)
  const current = tenants.find((t) => t.id === tenantId) ?? null

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/tenants/suggest?all=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return
        const rows: TenantOption[] = Array.isArray(json?.data) ? json.data : []
        setTenants(rows)
        // Remember the last tenant exported in this browser.
        try {
          const last = window.localStorage.getItem("cuik.sa.exportTenant")
          if (last && rows.some((t) => t.id === last)) setTenantId(last)
        } catch {
          /* storage unavailable */
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function pick(id: string) {
    setTenantId(id)
    try {
      window.localStorage.setItem("cuik.sa.exportTenant", id)
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin/tenants" }, { label: "Exportar datos" }]}
        title="Exportar datos"
        subtitle="Descarga en Excel los clientes, las visitas o los movimientos de puntos de un tenant, con las columnas que elijas."
      />

      <Panel className="p-3 sm:p-4">
        <label className="grid gap-1 text-[12px] max-w-md">
          <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">Tenant</span>
          <select
            value={tenantId}
            onChange={(e) => pick(e.target.value)}
            disabled={loading}
            className="h-7 px-2 pr-6 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"
          >
            <option value="">{loading ? "Cargando tenants…" : "Elige un tenant"}</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {STATUS_LABEL[t.status] ?? t.status}
                {t.program ? ` · ${PROGRAM_LABEL[t.program]}` : " · sin programa"}
              </option>
            ))}
          </select>
        </label>
      </Panel>

      <ExportBuilder
        tone="ent"
        program={current?.program ?? null}
        disabled={!tenantId}
        disabledHint="Elige un tenant para habilitar la descarga."
        buildUrl={(p) => {
          const params = new URLSearchParams({
            tenantId,
            dataset: p.dataset,
            columns: p.columns.join(","),
            status: p.status,
          })
          if (p.from) params.set("from", p.from)
          if (p.to) params.set("to", p.to)
          return `/api/admin/exports?${params.toString()}`
        }}
      />
    </div>
  )
}
