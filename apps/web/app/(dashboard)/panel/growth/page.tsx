"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import {
  DataTable,
  FieldList,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import { fmtDateTime, fmtDay, fmtMonth, soles } from "@/lib/growth/labels"
import type { GrowthSummary } from "@/lib/growth/store"
import { fetchJson, GrowthGate } from "./_components/growth-gate"

/**
 * Panel › Growth › Resumen: who is ready today per audience, what is open,
 * what the month attributed, and the rules Cuik applies for this tenant.
 */
export default function GrowthResumenPage() {
  return (
    <GrowthGate>
      <Resumen />
    </GrowthGate>
  )
}

function Resumen() {
  const { tenantSlug, timezone } = useTenant()
  const [data, setData] = useState<GrowthSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantSlug) return
    fetchJson<GrowthSummary>(`/api/${tenantSlug}/growth`)
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

  const readyTotal = data.audiences.reduce((n, a) => n + a.readyToday, 0)
  const actionable = data.audiences.filter((a) => !a.informational && !a.off)
  const month = fmtMonth(data.today.slice(0, 7))
  const r = data.rules

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Panel", href: "/panel" }, { label: "Growth" }]}
        title="Growth"
        subtitle={
          data.computedAt
            ? `Audiencias recalculadas ${fmtDateTime(data.computedAt, timezone)} con las ventas de tu punto de venta.`
            : "Todavía no hay un cálculo: el primero sale la próxima madrugada con las ventas de tu punto de venta."
        }
        actions={
          <Button asChild size="sm" className="h-8 text-[12.5px]">
            <Link href="/panel/growth/audiencias">Ver audiencias</Link>
          </Button>
        }
      />

      <StatStrip
        stats={[
          {
            label: "Listos para escribir hoy",
            value: readyTotal,
            hint: `${data.clientsWithStats} clientes con compras en el POS`,
          },
          {
            label: "Envíos abiertos",
            value: data.openSends,
            hint: data.openSends > 0 ? "sigue donde lo dejaste" : "ninguno en curso",
          },
          {
            label: `Enviados en ${month}`,
            value: data.sentThisMonth,
            hint: "confirmados con el check",
          },
          {
            label: `Venta atribuida en ${month}`,
            value: soles(data.attributedThisMonth.amount),
            hint: `${data.attributedThisMonth.tickets} tickets · ${r.attributionDays} días tras el envío`,
          },
        ]}
      />

      {data.clientsWithStats === 0 && (
        <Notice tone="info">
          Sin ventas del punto de venta todavía. Cuando el conector traiga las compras, cada cliente
          tendrá su ritmo y sus audiencias.
        </Notice>
      )}

      <Panel>
        <PanelHeader
          title="Audiencias"
          actions={
            <Link
              href="/panel/growth/audiencias"
              className="text-[12px] text-ent-accent hover:underline"
            >
              Ver todas
            </Link>
          }
        />
        <DataTable>
          <thead>
            <tr>
              <Th>Audiencia</Th>
              <Th className="text-right">En la audiencia</Th>
              <Th className="text-right">Listos hoy</Th>
              <Th>Último envío</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {actionable.map((a) => (
              <Tr key={a.slug}>
                <Td>
                  <Link
                    href={`/panel/growth/audiencias/${a.slug}`}
                    className="text-ent-accent hover:underline"
                  >
                    {a.name}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{a.inAudience}</Td>
                <Td className="text-right tabular-nums font-medium">{a.readyToday}</Td>
                <Td className="text-ent-fg-3">
                  {a.lastSend
                    ? `${fmtDay(a.lastSend.createdAt.slice(0, 10))} · ${a.lastSend.sent} enviados`
                    : "—"}
                </Td>
                <Td>
                  {a.readyToday > 0 ? (
                    <StatusChip tone="ok">Listos</StatusChip>
                  ) : (
                    <StatusChip tone="mute">Nadie hoy</StatusChip>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <Panel>
        <PanelHeader title="Cómo decide Cuik a quién sugerir" />
        <div className="px-3 py-1">
          <FieldList
            rows={[
              {
                label: "Presión de contacto",
                value: `Nadie que recibió un mensaje en los últimos ${r.cooldownDays} días vuelve a sugerirse, en ninguna audiencia. Hoy: ${data.blocked.cooldown} clientes.`,
              },
              {
                label: "Momento",
                value: `Cada cliente entra el día que le toca: su día habitual justo antes de su fecha esperada (última compra + su intervalo), nunca más de ${r.maxEarlyDays} días antes. Con menos de ${r.minPurchases} compras usa el intervalo de su categoría.`,
              },
              {
                label: "En riesgo",
                value: `Más de ${r.riskFactor} × su intervalo sin comprar.`,
              },
              {
                label: "Medición",
                value: `Solo el check "Enviado" cuenta. Cada venta del POS en los ${r.attributionDays} días siguientes se atribuye al envío; el ${r.controlPct} % de cada envío queda como control para comparar.`,
              },
              {
                label: "Fuera siempre",
                value: `Quien está en otro envío abierto (${data.blocked.openSend}), marcado "No contactar" (${data.noContact}) o archivado.`,
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}
