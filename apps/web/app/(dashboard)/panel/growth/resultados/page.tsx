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
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTenant } from "@/hooks/use-tenant"
import { CHANNEL_LABEL, fmtDay, fmtMonth, pct, soles } from "@/lib/growth/labels"
import type { ResultsView, SendResultRow } from "@/lib/growth/results"
import { fetchJson, GrowthGate } from "../_components/growth-gate"

type Range = "90" | "month" | "365"

/** Panel › Growth › Resultados: what the POS sold after each send, sent vs control. */
export default function ResultadosPage() {
  return (
    <GrowthGate>
      <Resultados />
    </GrowthGate>
  )
}

function rangeDates(range: Range, timezone: string): { from: string; to: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone })
  if (range === "month") return { from: `${today.slice(0, 7)}-01`, to: today }
  const days = range === "365" ? 365 : 90
  const from = new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: timezone,
  })
  return { from, to: today }
}

function Resultados() {
  const { tenantSlug, timezone } = useTenant()
  const [range, setRange] = useState<Range>("90")
  const [data, setData] = useState<ResultsView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantSlug) return
    const { from, to } = rangeDates(range, timezone)
    let cancelled = false
    setData(null)
    setError(null)
    fetchJson<ResultsView>(`/api/${tenantSlug}/growth/results?from=${from}&to=${to}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [tenantSlug, range, timezone])

  if (error) return <Notice tone="bad">{error}</Notice>

  const t = data?.totals
  const month = fmtMonth(new Date().toLocaleDateString("en-CA", { timeZone: timezone }).slice(0, 7))

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Panel", href: "/panel" },
          { label: "Growth", href: "/panel/growth" },
          { label: "Resultados" },
        ]}
        title="Resultados"
        subtitle="Qué pasó después de cada envío, según las compras reales del punto de venta. La venta incremental es la diferencia contra el grupo de control."
        actions={
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="h-8 w-[160px] text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="90">Últimos 90 días</SelectItem>
              <SelectItem value="month">{month}</SelectItem>
              <SelectItem value="365">Último año</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {!data || !t ? (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      ) : (
        <>
          <StatStrip
            stats={[
              {
                label: "Envíos registrados",
                value: t.sends,
                hint:
                  Object.entries(t.byChannel)
                    .map(([ch, n]) => `${n} ${CHANNEL_LABEL[ch] ?? ch}`)
                    .join(" · ") || "ninguno en el rango",
              },
              {
                label: "Clientes con envío confirmado",
                value: t.sent,
                hint: `${t.control} en control`,
              },
              {
                label: `Compraron en ${data.rules.attributionDays} días`,
                value: pct(t.sentRate),
                hint: t.controlRate == null ? "sin control" : `control ${pct(t.controlRate)}`,
              },
              {
                label: "Venta atribuida",
                value: soles(t.attributedAmount),
                hint: `${t.attributedTickets} tickets · solo clientes con envío confirmado`,
              },
            ]}
          />

          {t.sends > 0 && (
            <Notice tone={t.incremental > 0 ? "ok" : "info"}>
              Venta incremental en el rango: <strong>{soles(t.incremental)}</strong>, lo que el
              grupo enviado compró por encima de lo que compró el control.
              {data.rows.some((r) => r.orientative) &&
                ` Con menos de ${data.rules.minControl} clientes en control el resultado es orientativo.`}
            </Notice>
          )}

          <Panel>
            <PanelHeader title="Por envío" />
            <Toolbar>
              <span className="text-[11.5px] text-ent-fg-3">
                Ventana de atribución: {data.rules.attributionDays} días desde el check “Enviado” ·
                se mide solo sobre enviados
              </span>
            </Toolbar>
            {data.rows.length === 0 ? (
              <PanelMessage>
                <span>Todavía no hay envíos en este rango.</span>
                <span>
                  <Link href="/panel/growth/audiencias" className="text-ent-accent hover:underline">
                    Crea el primero desde una audiencia
                  </Link>
                  : cada compra en el POS de los clientes enviados aparecerá aquí, ticket a ticket.
                </span>
              </PanelMessage>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Audiencia</Th>
                    <Th>Canal</Th>
                    <Th className="text-right">Enviados / foto</Th>
                    <Th className="text-right">Compraron</Th>
                    <Th className="text-right">Control</Th>
                    <Th className="text-right">Venta S/</Th>
                    <Th className="text-right">Incremental S/</Th>
                    <Th className="text-right">Ticket S/</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <ResultRow key={r.id} r={r} timezone={timezone} />
                  ))}
                </tbody>
              </DataTable>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function ResultRow({ r, timezone }: { r: SendResultRow; timezone: string }) {
  const day = new Date(r.createdAt).toLocaleDateString("en-CA", { timeZone: timezone })
  return (
    <Tr>
      <Td className="whitespace-nowrap text-ent-fg-2">{fmtDay(day)}</Td>
      <Td>
        <Link href={`/panel/growth/envios/${r.id}`} className="text-ent-accent hover:underline">
          {r.audienceName}
        </Link>
      </Td>
      <Td className="text-ent-fg-2">{CHANNEL_LABEL[r.channel] ?? r.channel}</Td>
      <Td className="text-right tabular-nums">
        {r.sent} / {r.snapshotTotal}
      </Td>
      <Td className="text-right tabular-nums">
        {r.sentBuyers}
        {r.sentRate != null && <span className="text-ent-fg-3"> ({pct(r.sentRate)})</span>}
      </Td>
      <Td className="text-right tabular-nums text-ent-fg-2">
        {r.control > 0 ? `${r.controlBuyers} de ${r.control} (${pct(r.controlRate)})` : "—"}
      </Td>
      <Td className="text-right tabular-nums">{soles(r.sentSales)}</Td>
      <Td className="text-right tabular-nums">
        {r.incremental == null ? "—" : soles(r.incremental)}
      </Td>
      <Td className="text-right tabular-nums text-ent-fg-2">
        {r.avgTicket == null ? "—" : soles(r.avgTicket)}
      </Td>
      <Td>
        {r.verdict === "measuring" ? (
          <StatusChip tone="info">{`En medición · día ${r.measuringDay} de ${r.attributionDays}`}</StatusChip>
        ) : r.verdict === "measured" ? (
          <StatusChip tone="ok">{r.orientative ? "Medido · orientativo" : "Medido"}</StatusChip>
        ) : r.verdict === "no_effect" ? (
          <StatusChip tone="warn">Sin efecto claro</StatusChip>
        ) : (
          <StatusChip tone="mute">Sin envíos confirmados</StatusChip>
        )}
      </Td>
    </Tr>
  )
}
