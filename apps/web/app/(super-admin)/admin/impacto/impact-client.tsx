"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fmtDay } from "@/lib/loyalty/impact/format"
import type { ImportRow, ReportView } from "@/lib/loyalty/impact/store"

type TenantOption = { id: string; name: string; status: string }

const STATUS: Record<string, { tone: "ok" | "info" | "warn" | "bad" | "mute"; label: string }> = {
  ready: { tone: "ok", label: "Listo" },
  processing: { tone: "info", label: "Procesando" },
  mapping: { tone: "warn", label: "Sin confirmar" },
  failed: { tone: "bad", label: "Falló" },
}

export function ImpactClient({ tenants }: { tenants: TenantOption[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "")
  const tenant = tenants.find((t) => t.id === tenantId) ?? null
  const [imports, setImports] = useState<ImportRow[] | null>(null)
  const [report, setReport] = useState<ReportView | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const reqRef = useRef(0)

  const loadImports = useCallback(async (): Promise<ImportRow[]> => {
    if (!tenantId) return []
    const id = ++reqRef.current
    setImports(null)
    try {
      const res = await fetch(`/api/admin/impact/imports?tenantId=${tenantId}`)
      const json = await res.json()
      if (id !== reqRef.current) return []
      const rows: ImportRow[] = json.success ? json.data : []
      setImports(rows)
      return rows
    } catch {
      if (id === reqRef.current) setImports([])
      return []
    }
  }, [tenantId])

  const openReport = useCallback(
    async (reportId: string) => {
      setLoadingReport(true)
      try {
        const res = await fetch(`/api/admin/impact/reports/${reportId}?tenantId=${tenantId}`)
        const json = await res.json()
        if (json.success) setReport(json.data)
        else toast.error(json.error ?? "No se pudo abrir el corte")
      } catch {
        toast.error("Error de conexión")
      } finally {
        setLoadingReport(false)
      }
    },
    [tenantId],
  )

  // New tenant: its list, and its latest corte open.
  useEffect(() => {
    setReport(null)
    void loadImports().then((rows) => {
      const latest = rows.find((r) => r.reportId)
      if (latest?.reportId) void openReport(latest.reportId)
    })
  }, [loadImports, openReport])

  async function removeImport(row: ImportRow) {
    if (
      !window.confirm(
        `¿Eliminar la carga "${row.fileName}" y su corte? Sus compras salen del análisis.`,
      )
    )
      return
    const res = await fetch(`/api/admin/impact/imports/${row.id}?tenantId=${tenantId}`, {
      method: "DELETE",
    })
    const json = await res.json()
    if (!json.success) {
      toast.error(json.error ?? "No se pudo eliminar")
      return
    }
    toast.success("Carga eliminada")
    if (report && imports?.find((r) => r.id === row.id)?.reportId === report.id) setReport(null)
    await loadImports()
  }

  /** A synced month: its corte is computed on demand (the cron does the previous month once). */
  async function computeCorte(row: ImportRow) {
    const month = row.fileName.replace("Odoo · ", "")
    setLoadingReport(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos/corte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo calcular el corte")
        return
      }
      toast.success(`Corte de ${month} calculado`)
      await loadImports()
      await openReport(json.data.reportId)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoadingReport(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Loyalty", href: "/admin" }, { label: "Impacto" }]}
        title="Impacto"
        subtitle="Las ventas del comercio (DNI · fecha · monto) cruzadas con sus clientes y visitas en Cuik. Un corte por mes."
        actions={
          <div className="flex items-center gap-2">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="h-8 w-56 text-[12.5px]">
                <SelectValue placeholder="Comercio" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[12.5px]"
              disabled={!tenantId}
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Nueva carga
            </Button>
          </div>
        }
      />

      {tenant && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          tenantName={tenant.name}
          api={{ base: "/api/admin/impact", tenantId: tenant.id }}
          onDone={async (reportId) => {
            await loadImports()
            await openReport(reportId)
          }}
        />
      )}

      <Panel>
        <PanelHeader title={`Cargas de ${tenant?.name ?? "—"}`} />
        {imports === null ? (
          <PanelMessage>
            <Loader2 className="w-4 h-4 animate-spin" />
          </PanelMessage>
        ) : imports.length === 0 ? (
          <PanelMessage>
            <span>Todavía no hay cargas para este comercio.</span>
            <span>
              Pide al comercio su exportación de ventas (DNI, fecha y monto) y súbela aquí.
            </span>
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Archivo</Th>
                <Th>Período</Th>
                <Th align="right">Compras</Th>
                <Th align="right">Con DNI</Th>
                <Th>Estado</Th>
                <Th>Subida</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one row with its status, source and actions */}
              {imports.map((r) => (
                <Tr
                  key={r.id}
                  className={report?.id === r.reportId ? "bg-ent-accent-soft" : undefined}
                >
                  <Td className="font-medium text-ent-fg max-w-[260px] truncate">
                    {r.fileName}
                    {r.source === "pos" && (
                      <span className="ml-1.5 text-[11px] font-normal text-ent-fg-3">API</span>
                    )}
                  </Td>
                  <Td>{r.periodFrom ? `${fmtDay(r.periodFrom)} – ${fmtDay(r.periodTo)}` : "—"}</Td>
                  <Td align="right">{r.ordersTotal.toLocaleString("es-PE")}</Td>
                  <Td align="right">
                    {r.ordersTotal
                      ? `${Math.round((100 * r.ordersWithDni) / r.ordersTotal)} %`
                      : "—"}
                  </Td>
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
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      {r.reportId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[12px]"
                          onClick={() => void openReport(r.reportId as string)}
                        >
                          Ver corte
                        </Button>
                      )}
                      {r.source === "pos" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[12px]"
                          disabled={loadingReport}
                          onClick={() => void computeCorte(r)}
                        >
                          {r.reportId ? "Recalcular" : "Calcular corte"}
                        </Button>
                      ) : (
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
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {loadingReport && (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      )}
      {report && !loadingReport && (
        <ImpactReport
          report={report}
          excelHref={`/api/admin/impact/reports/${report.id}?tenantId=${tenantId}&format=xlsx`}
          tenantName={tenant?.name ?? ""}
        />
      )}
    </div>
  )
}
