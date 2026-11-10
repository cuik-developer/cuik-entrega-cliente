"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Notice, PageHeader, Panel, PanelMessage } from "@/components/admin/enterprise"
import { ImpactReport } from "@/components/impact/impact-report"
import { useTenant } from "@/hooks/use-tenant"
import type { ReportView } from "@/lib/loyalty/impact/store"

/**
 * Panel › Análisis › Impacto: the merchant's own sales crossed with Cuik,
 * as Cuik loads them each month. Read-only; the owner or an admin.
 */
export default function ImpactoPanelPage() {
  const { tenantSlug, tenantName, isLoading, error: tenantError } = useTenant()
  const [report, setReport] = useState<ReportView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantSlug) return
    let cancelled = false
    fetch(`/api/${tenantSlug}/impact`)
      .then(async (r) => ({ status: r.status, json: await r.json() }))
      .then(({ status, json }) => {
        if (cancelled) return
        if (json.success) setReport(json.data.report ?? null)
        else if (status === 403)
          setError("Solo el dueño o un administrador del comercio puede ver el impacto.")
        else setError(json.error ?? "No se pudo cargar el informe")
      })
      .catch(() => {
        if (!cancelled) setError("Error de conexión")
      })
    return () => {
      cancelled = true
    }
  }, [tenantSlug])

  if (tenantError) return <Notice tone="bad">{tenantError}</Notice>

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Panel", href: "/panel" }, { label: "Impacto" }]}
        title="Impacto de la tarjeta en tus ventas"
        subtitle="Tus ventas (DNI, fecha y monto) cruzadas con tus clientes y visitas en Cuik. Cada mes, un corte nuevo."
      />

      {error && <Notice tone="bad">{error}</Notice>}

      {(isLoading || report === undefined) && !error && (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      )}

      {report === null && !error && (
        <Panel>
          <PanelMessage>
            <span>Todavía no hay un corte para tu comercio.</span>
            <span>
              Envíale a Cuik tu exportación de ventas del mes (DNI, fecha y monto) y aquí verás el
              registro en caja, la retención con y sin tarjeta y a quién invitar.
            </span>
          </PanelMessage>
        </Panel>
      )}

      {report && (
        <ImpactReport
          report={report}
          excelHref={`/api/${tenantSlug}/impact?format=xlsx`}
          tenantName={tenantName ?? ""}
        />
      )}
    </div>
  )
}
