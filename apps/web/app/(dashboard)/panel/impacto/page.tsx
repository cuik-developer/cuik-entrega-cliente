"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { ImpactReport } from "@/components/impact/impact-report"
import { UploadDialog } from "@/components/impact/upload-dialog"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import { fmtDay } from "@/lib/loyalty/impact/format"
import type { ImportRow, ReportView } from "@/lib/loyalty/impact/store"

const STATUS: Record<string, { tone: "ok" | "info" | "warn" | "bad" | "mute"; label: string }> = {
  ready: { tone: "ok", label: "Listo" },
  processing: { tone: "info", label: "Procesando" },
  mapping: { tone: "warn", label: "Sin confirmar" },
  failed: { tone: "bad", label: "Falló" },
}

/**
 * Panel › Análisis › Impacto: the merchant's own sales crossed with Cuik.
 * The owner or an admin uploads the month's sales file (or Cuik does it) and
 * sees the latest corte. Cashiers get a plain message.
 */
export default function ImpactoPanelPage() {
  const { tenantSlug, tenantName, isLoading, error: tenantError, readOnly } = useTenant()
  const [report, setReport] = useState<ReportView | null | undefined>(undefined)
  const [imports, setImports] = useState<ImportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  /** The POS connector owns the sales from this day on: no file upload for the merchant. */
  const [connector, setConnector] = useState<{ startDate: string } | null>(null)

  const load = useCallback(async () => {
    if (!tenantSlug) return
    try {
      const [r, i] = await Promise.all([
        fetch(`/api/${tenantSlug}/impact`).then(async (res) => ({
          status: res.status,
          json: await res.json(),
        })),
        fetch(`/api/${tenantSlug}/impact/imports`).then((res) => res.json()),
      ])
      if (r.json.success) {
        setReport(r.json.data.report ?? null)
        setConnector(r.json.data.connector ?? null)
      } else if (r.status === 403) {
        setError("Solo el dueño o un administrador del comercio puede ver el impacto.")
        return
      } else setError(r.json.error ?? "No se pudo cargar el informe")
      setImports(i.success ? i.data : [])
    } catch {
      setError("Error de conexión")
    }
  }, [tenantSlug])

  useEffect(() => {
    void load()
  }, [load])

  async function removeImport(row: ImportRow) {
    if (!window.confirm(`¿Eliminar la carga "${row.fileName}" y su corte?`)) return
    const res = await fetch(`/api/${tenantSlug}/impact/imports/${row.id}`, { method: "DELETE" })
    const json = await res.json()
    if (!json.success) {
      toast.error(json.error ?? "No se pudo eliminar")
      return
    }
    toast.success("Carga eliminada")
    setReport(undefined)
    await load()
  }

  if (tenantError) return <Notice tone="bad">{tenantError}</Notice>

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Panel", href: "/panel" }, { label: "Impacto" }]}
        title="Impacto de la tarjeta en tus ventas"
        subtitle="Tus ventas (DNI, fecha y monto) cruzadas con tus clientes y visitas en Cuik. Cada mes, un corte nuevo."
        actions={
          !readOnly &&
          !error &&
          !connector && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[12.5px] print:hidden"
              disabled={!tenantSlug}
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Subir ventas del mes
            </Button>
          )
        }
      />

      {tenantSlug && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          tenantName={tenantName}
          api={{ base: `/api/${tenantSlug}/impact` }}
          onDone={async () => {
            setReport(undefined)
            await load()
          }}
        />
      )}

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
              {connector
                ? "Tus ventas llegan solas desde tu punto de venta; el primer corte se calcula al cerrar el mes."
                : "Sube la exportación de ventas del mes (DNI, fecha y monto) con el botón de arriba, o envíasela a Cuik. En minutos verás el registro en caja, la retención con y sin tarjeta y a quién invitar."}
            </span>
          </PanelMessage>
        </Panel>
      )}

      {imports && imports.length > 0 && !error && (
        <Panel className="print:hidden">
          <PanelHeader title={`Cargas (${imports.length})`} />
          <DataTable>
            <thead>
              <tr>
                <Th>Archivo</Th>
                <Th>Período</Th>
                <Th align="right">Compras</Th>
                <Th>Estado</Th>
                <Th>Subida</Th>
                {!readOnly && <Th align="right">Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {imports.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-ent-fg max-w-[260px] truncate">{r.fileName}</Td>
                  <Td>{r.periodFrom ? `${fmtDay(r.periodFrom)} – ${fmtDay(r.periodTo)}` : "—"}</Td>
                  <Td align="right">{r.ordersTotal.toLocaleString("es-PE")}</Td>
                  <Td>
                    <StatusChip
                      tone={STATUS[r.status]?.tone ?? "mute"}
                      title={r.error ?? undefined}
                    >
                      {STATUS[r.status]?.label ?? r.status}
                    </StatusChip>
                  </Td>
                  <Td className="text-ent-fg-3">
                    {fmtDay(r.createdAt)}
                    {r.createdBy ? ` · ${r.createdBy}` : ""}
                  </Td>
                  {!readOnly && (
                    <Td align="right">
                      {r.source === "file" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-ent-fg-3 hover:text-red-600"
                          aria-label="Eliminar carga"
                          onClick={() => void removeImport(r)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {report && (
        <ImpactReport
          report={report}
          excelHref={`/api/${tenantSlug}/impact?format=xlsx`}
          tenantName={tenantName ?? ""}
          campaignHref={readOnly ? undefined : "/panel/campanas?impacto=enfriados"}
        />
      )}
    </div>
  )
}
