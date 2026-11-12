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
import { CHANNEL_LABEL, fmtDay, soles } from "@/lib/growth/labels"
import type { SendListRow } from "@/lib/growth/sends"
import { fetchJson, GrowthGate } from "../_components/growth-gate"

/** Panel › Growth › Envíos: every send with where it stands and what it sold. */
export default function EnviosPage() {
  return (
    <GrowthGate>
      <Envios />
    </GrowthGate>
  )
}

function Envios() {
  const { tenantSlug, timezone } = useTenant()
  const [rows, setRows] = useState<SendListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantSlug) return
    fetchJson<SendListRow[]>(`/api/${tenantSlug}/growth/sends`)
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [tenantSlug])

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!rows) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Panel", href: "/panel" },
          { label: "Growth", href: "/panel/growth" },
          { label: "Envíos" },
        ]}
        title="Envíos"
        subtitle="Cada envío es la foto de una audiencia en un día, con su plantilla y el seguimiento cliente por cliente. Se mide solo sobre los confirmados con el check."
        actions={
          <Button asChild size="sm" className="h-8 text-[12.5px]">
            <Link href="/panel/growth/audiencias">Crear envío desde una audiencia</Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader title={`Envíos (${rows.length})`} />
        {rows.length === 0 ? (
          <PanelMessage>
            <span>Todavía no hay envíos.</span>
            <span>
              Entra a una audiencia y toca “Crear envío”: Cuik congela la foto del día y te lleva
              cliente por cliente.
            </span>
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Envío</Th>
                <Th>Canal</Th>
                <Th className="text-right">Enviados / foto</Th>
                <Th className="text-right">Pendientes</Th>
                <Th className="text-right">Control</Th>
                <Th className="text-right">Compraron</Th>
                <Th className="text-right">Venta S/</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Tr key={s.id}>
                  <Td className="text-ent-fg-2 whitespace-nowrap">
                    {fmtDay(
                      new Date(s.createdAt).toLocaleDateString("en-CA", { timeZone: timezone }),
                    )}
                  </Td>
                  <Td>
                    <Link
                      href={`/panel/growth/envios/${s.id}`}
                      className="text-ent-accent hover:underline font-medium"
                    >
                      {s.name}
                    </Link>
                    {s.senderName && (
                      <span className="text-ent-fg-3"> · escribe {s.senderName}</span>
                    )}
                  </Td>
                  <Td className="text-ent-fg-2">{CHANNEL_LABEL[s.channel] ?? s.channel}</Td>
                  <Td className="text-right tabular-nums">
                    {s.counts.confirmed} / {s.counts.total}
                  </Td>
                  <Td className="text-right tabular-nums text-ent-fg-2">
                    {s.counts.pending + s.counts.opened}
                  </Td>
                  <Td className="text-right tabular-nums text-ent-fg-2">{s.counts.control}</Td>
                  <Td className="text-right tabular-nums">{s.counts.buyers}</Td>
                  <Td className="text-right tabular-nums">{soles(s.counts.attributedAmount)}</Td>
                  <Td>
                    {s.status === "open" ? (
                      <StatusChip tone="warn">Abierto</StatusChip>
                    ) : s.measuringDay ? (
                      <StatusChip tone="info">{`En medición · día ${s.measuringDay} de ${s.attributionDays}`}</StatusChip>
                    ) : s.counts.confirmed > 0 ? (
                      <StatusChip tone="ok">Medido</StatusChip>
                    ) : (
                      <StatusChip tone="mute">Cerrado sin envíos</StatusChip>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  )
}
