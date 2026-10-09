"use client"

import { ExportBuilder } from "@/components/exports/export-builder"
import { useTenant } from "@/hooks/use-tenant"

/** Merchant "Exportar datos": the tenant's own clients, visits and points. */
export default function ExportPage() {
  const { tenantSlug, isLoading, promotionType } = useTenant()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Exportar datos</h1>
        <p className="text-sm text-muted-foreground">
          Descarga en Excel tus clientes, visitas o movimientos de puntos, con las columnas que
          elijas.
        </p>
      </div>

      <ExportBuilder
        tone="panel"
        program={promotionType}
        disabled={!tenantSlug || isLoading}
        disabledHint="Cargando tu comercio…"
        buildUrl={(p) => {
          const params = new URLSearchParams({
            dataset: p.dataset,
            columns: p.columns.join(","),
            status: p.status,
          })
          if (p.from) params.set("from", p.from)
          if (p.to) params.set("to", p.to)
          return `/api/${tenantSlug}/exports?${params.toString()}`
        }}
      />
    </div>
  )
}
