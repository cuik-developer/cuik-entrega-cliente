"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"

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
import { fmtDayYear } from "@/lib/growth/labels"
import { TenantGrowthSection } from "../../tenants/tenant-growth-section"
import { TenantSelect, useGrowthTenants } from "../_components/tenant-picker"

export function ReglasClient() {
  const { rows, error, tenantId, setTenantId, tenant } = useGrowthTenants((t) => t.growthOn)
  const withGrowth = rows?.filter((t) => t.growthOn) ?? []

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Growth", href: "/admin" }, { label: "Reglas por comercio" }]}
        title="Reglas por comercio"
        subtitle="Lo que decide a quién se sugiere, cuándo, cómo se atribuye la venta y cuánto se factura. El comercio ve estos valores en su panel y no los edita. Growth se enciende en la ficha del comercio › Funciones."
      />

      {error && <Notice tone="bad">{error}</Notice>}

      <Panel>
        <PanelHeader title={`Comercios con Growth (${withGrowth.length})`} />
        {!rows ? (
          <PanelMessage>
            <Loader2 className="w-4 h-4 animate-spin" />
          </PanelMessage>
        ) : withGrowth.length === 0 ? (
          <PanelMessage>
            <span>Ningún comercio tiene Growth encendido.</span>
            <span>Se activa en la ficha del comercio › Funciones › Growth.</span>
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Comercio</Th>
                <Th className="text-right">Cooldown</Th>
                <Th className="text-right">Adelanto</Th>
                <Th className="text-right">Mín. compras</Th>
                <Th className="text-right">Riesgo ×</Th>
                <Th className="text-right">Atribución</Th>
                <Th className="text-right">Control</Th>
                <Th>Términos</Th>
                <Th>Inicio</Th>
                <Th>Audiencias apagadas</Th>
              </tr>
            </thead>
            <tbody>
              {withGrowth.map((t) => {
                const r = t.rules
                return (
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
                    <Td className="text-right tabular-nums">{r.cooldownDays} d</Td>
                    <Td className="text-right tabular-nums">{r.maxEarlyDays} d</Td>
                    <Td className="text-right tabular-nums">{r.minPurchases}</Td>
                    <Td className="text-right tabular-nums">{r.riskFactor}</Td>
                    <Td className="text-right tabular-nums">{r.attributionDays} d</Td>
                    <Td className="text-right tabular-nums">{r.controlPct} %</Td>
                    <Td className="text-ent-fg-2">
                      S/ {r.feeFixed}
                      {r.feeVariablePct != null ? ` + ${r.feeVariablePct} %` : ""} · piloto{" "}
                      {r.pilotMonths} m
                    </Td>
                    <Td>
                      {r.startsOn ? (
                        <span className="text-ent-fg-2">{fmtDayYear(r.startsOn)}</span>
                      ) : (
                        <StatusChip tone="warn">Sin fecha</StatusChip>
                      )}
                    </Td>
                    <Td className="text-ent-fg-3">
                      {r.audiencesOff.length === 0 ? "—" : r.audiencesOff.join(", ")}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {rows && rows.length > 0 && (
        <Panel>
          <Toolbar>
            <TenantSelect rows={rows} value={tenantId} onChange={setTenantId} />
            {tenant && !tenant.growthOn && (
              <span className="text-[11.5px] text-ent-fg-3">
                Growth está apagado para este comercio; las reglas se guardan igual y aplican al
                encenderlo en su{" "}
                <Link
                  href={`/admin/tenants/${tenant.id}`}
                  className="text-ent-accent hover:underline"
                >
                  ficha
                </Link>
                .
              </span>
            )}
          </Toolbar>
          <div className="p-3">
            {tenantId && <TenantGrowthSection key={tenantId} tenantId={tenantId} />}
          </div>
        </Panel>
      )}
    </div>
  )
}
