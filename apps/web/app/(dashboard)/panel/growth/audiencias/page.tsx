"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

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
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import { fmtDateTime, fmtDay } from "@/lib/growth/labels"
import type { AudiencesOverview } from "@/lib/growth/store"
import { fetchJson, GrowthGate } from "../_components/growth-gate"

/** Panel › Growth › Audiencias: the living rules, who is in each and who is ready today. */
export default function AudienciasPage() {
  return (
    <GrowthGate>
      <Audiencias />
    </GrowthGate>
  )
}

function Audiencias() {
  const { tenantSlug, tenantName, timezone, readOnly } = useTenant()
  const [data, setData] = useState<AudiencesOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantSlug) return
    fetchJson<AudiencesOverview>(`/api/${tenantSlug}/growth/audiences`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [tenantSlug])

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!data) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }
  const r = data.rules

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Panel", href: "/panel" },
          { label: "Growth", href: "/panel/growth" },
          { label: "Audiencias" },
        ]}
        title="Audiencias"
        subtitle="Reglas vivas que se recalculan cada noche con las ventas del punto de venta. Un envío nace desde la audiencia con “Crear envío” y congela la foto de ese día."
      />

      <Notice tone="info">
        Antes de sugerir a alguien, Cuik lo descarta si recibió un mensaje en los últimos{" "}
        {r.cooldownDays} días (hoy {data.blocked.cooldown} clientes), tiene un envío abierto en otra
        lista ({data.blocked.openSend}), está marcado “No contactar” ({data.blocked.noContact}) o
        archivado. “Listos hoy” ya aplica esos filtros y, en Recompra próxima, el día que le toca a
        cada uno.
      </Notice>

      <Panel>
        <PanelHeader
          title={`Audiencias de Cuik para ${tenantName}`}
          actions={
            <span className="text-[11.5px] text-ent-fg-3 truncate">
              {data.computedAt
                ? `Recalculadas ${fmtDateTime(data.computedAt, timezone)} · “Listos hoy” = en la audiencia, sin bloqueo y en su día`
                : "Todavía sin cálculo: el primero sale la próxima madrugada"}
            </span>
          }
        />
        <DataTable>
          <thead>
            <tr>
              <Th>Audiencia</Th>
              <Th>Regla</Th>
              <Th className="text-right">En la audiencia</Th>
              <Th className="text-right">Listos hoy</Th>
              <Th>Último envío</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.audiences.map((a) => (
              <Tr key={a.slug}>
                <Td>
                  <Link
                    href={`/panel/growth/audiencias/${a.slug}`}
                    className="text-ent-accent hover:underline font-medium"
                  >
                    {a.name}
                  </Link>
                </Td>
                <Td className="text-ent-fg-2 max-w-[420px] whitespace-normal">{a.rule}</Td>
                <Td className="text-right tabular-nums">{a.inAudience}</Td>
                <Td className="text-right tabular-nums font-medium">
                  {a.informational ? "—" : a.readyToday}
                </Td>
                <Td className="text-ent-fg-3">
                  {a.lastSend
                    ? `${fmtDay(a.lastSend.createdAt.slice(0, 10))} · ${a.lastSend.sent} enviados`
                    : "—"}
                </Td>
                <Td>
                  {a.off ? (
                    <StatusChip tone="mute">Apagada</StatusChip>
                  ) : a.informational ? (
                    <StatusChip tone="info">Informativa</StatusChip>
                  ) : a.slug === "recompra" ? (
                    <StatusChip tone="ok">Diaria</StatusChip>
                  ) : a.slug === "en_riesgo" && a.readyToday > 0 ? (
                    <StatusChip tone="warn">Atención</StatusChip>
                  ) : (
                    <StatusChip tone="ok">Activa</StatusChip>
                  )}
                </Td>
                <Td className="text-right">
                  {!a.informational &&
                    !a.off &&
                    !readOnly &&
                    (a.readyToday === 0 ? (
                      <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled>
                        Crear envío
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="h-7 text-[12px]">
                        <Link href={`/panel/growth/audiencias/${a.slug}?crear=1`}>Crear envío</Link>
                      </Button>
                    ))}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>
    </div>
  )
}
