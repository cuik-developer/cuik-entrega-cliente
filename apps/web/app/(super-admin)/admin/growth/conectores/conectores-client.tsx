"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
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
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { fmtDateTime } from "@/lib/growth/labels"
import type { TenantGrowthRow } from "@/lib/growth/results"
import { TenantPosSection } from "../../tenants/tenant-pos-section"
import { TenantSelect, useGrowthTenants } from "../_components/tenant-picker"

/** First day of the month twelve months back, Lima time. */
function yearAgo(): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
  const [y, m] = today.split("-").map(Number)
  return new Date(Date.UTC(y, m - 13, 1)).toISOString().slice(0, 10)
}

function ConnectorChip({ c }: { c: TenantGrowthRow["connector"] }) {
  if (!c) return <StatusChip tone="mute">Sin conector</StatusChip>
  if (c.lastError)
    return (
      <StatusChip tone="bad" title={c.lastError}>
        Error
      </StatusChip>
    )
  if (!c.enabled) return <StatusChip tone="warn">Apagado</StatusChip>
  return (
    <StatusChip tone="ok">
      {`Activo${c.lastSyncAt ? ` · ${fmtDateTime(c.lastSyncAt, "America/Lima")}` : ""}`}
    </StatusChip>
  )
}

export function ConectoresClient() {
  const { rows, error, tenantId, setTenantId } = useGrowthTenants((t) => Boolean(t.connector))
  const connected = rows?.filter((t) => t.connector) ?? []
  const [busy, setBusy] = useState(false)

  async function reclassify() {
    if (!tenantId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos/reclassify`, { method: "POST" })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo reclasificar")
      toast.success(
        `${json.data.lines.toLocaleString("es-PE")} líneas reclasificadas · ${json.data.unclassified.toLocaleString("es-PE")} siguen sin categoría`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Growth", href: "/admin" }, { label: "Conectores POS" }]}
        title="Conectores POS"
        subtitle="Quién tiene el punto de venta conectado (Odoo), cómo va la sincronización y la maestra de productos de cada comercio. Las ventas sincronizadas alimentan Impacto y Growth."
      />

      {error && <Notice tone="bad">{error}</Notice>}

      <Panel>
        <PanelHeader title={`Conectores (${connected.length})`} />
        {!rows ? (
          <PanelMessage>
            <Loader2 className="w-4 h-4 animate-spin" />
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Comercio</Th>
                <Th>Conector</Th>
                <Th>Growth</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Tr key={t.id} className={t.id === tenantId ? "bg-ent-accent-soft" : undefined}>
                  <Td>
                    <button
                      type="button"
                      className="text-ent-accent hover:underline font-medium"
                      onClick={() => setTenantId(t.id)}
                    >
                      {t.name}
                    </button>
                  </Td>
                  <Td>
                    <ConnectorChip c={t.connector} />
                  </Td>
                  <Td>
                    {t.growthOn ? (
                      <StatusChip tone="ok">Encendido</StatusChip>
                    ) : (
                      <StatusChip tone="mute">Solo Loyalty</StatusChip>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="text-[12px] text-ent-accent hover:underline"
                    >
                      Ficha
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {rows && rows.length > 0 && (
        <Panel>
          <Toolbar>
            <TenantSelect rows={rows} value={tenantId} onChange={setTenantId} />
            {tenantId && (
              <>
                <Button asChild variant="outline" size="sm" className="h-7 text-[12px]">
                  <a
                    href={`/api/admin/tenants/${tenantId}/purchases?from=${yearAgo()}&format=xlsx`}
                  >
                    Exportar compras (12 meses)
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px]"
                  disabled={busy}
                  onClick={() => void reclassify()}
                  title="Vuelve a calcular categoría y marca de cada línea vendida con la maestra actual"
                >
                  Reclasificar líneas
                </Button>
              </>
            )}
            <span className="text-[11.5px] text-ent-fg-3">
              La API key se escribe aquí y se guarda cifrada; nunca vuelve a mostrarse.
            </span>
          </Toolbar>
          <div className="p-3">
            {tenantId && <TenantPosSection key={tenantId} tenantId={tenantId} />}
          </div>
        </Panel>
      )}
    </div>
  )
}
