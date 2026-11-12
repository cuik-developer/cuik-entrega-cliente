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
  Tr,
} from "@/components/admin/enterprise"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fmtDateTime, fmtMonth, soles } from "@/lib/growth/labels"
import type { TenantGrowthRow } from "@/lib/growth/results"

type Data = { month: string; tenants: TenantGrowthRow[] }

function lastMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1 - i
    const date = new Date(y, m - 1, 1)
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

export function GrowthClient() {
  const [month, setMonth] = useState(lastMonths(1)[0])
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    fetch(`/api/admin/growth?month=${month}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data)
        else setError(json.error ?? "No se pudo cargar")
      })
      .catch(() => setError("Error de conexión"))
  }, [month])

  const on = data?.tenants.filter((t) => t.growthOn) ?? []
  const attributed = on.reduce((n, t) => n + t.attributedMonth.amount, 0)
  const tickets = on.reduce((n, t) => n + t.attributedMonth.tickets, 0)
  const sends = on.reduce((n, t) => n + t.sendsMonth, 0)
  const billing = on.filter((t) => t.phase === "billing").reduce((n, t) => n + t.billing.total, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Growth", href: "/admin" }, { label: "Comercios" }]}
        title="Comercios"
        subtitle="Quién tiene datos del punto de venta, qué se envió, qué venta se atribuyó y cuánto se factura. Growth se enciende por comercio en su ficha › Funciones."
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-8 w-[180px] text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lastMonths(6).map((m) => (
                <SelectItem key={m} value={m}>
                  {fmtMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}

      {!data ? (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      ) : (
        <>
          <StatStrip
            stats={[
              {
                label: "Comercios con Growth",
                value: on.length,
                hint: `de ${data.tenants.length} comercios`,
              },
              {
                label: `Envíos en ${fmtMonth(month)}`,
                value: sends,
                hint: `${on.reduce((n, t) => n + t.sentMonth, 0)} mensajes confirmados`,
              },
              {
                label: "Venta atribuida del mes",
                value: soles(attributed),
                hint: `${tickets} tickets`,
              },
              {
                label: "A facturar",
                value: soles(billing),
                hint: "fijo + variable · solo comercios fuera de piloto",
              },
            ]}
          />

          <Panel>
            <PanelHeader title="Comercios" />
            <DataTable>
              <thead>
                <tr>
                  <Th>Comercio</Th>
                  <Th>Conector</Th>
                  <Th className="text-right">Envíos mes</Th>
                  <Th className="text-right">Atribuida mes S/</Th>
                  <Th>Términos</Th>
                  <Th className="text-right">A facturar S/</Th>
                  <Th>Growth</Th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map((t) => (
                  <TenantLine key={t.id} t={t} />
                ))}
              </tbody>
            </DataTable>
          </Panel>
        </>
      )}
    </div>
  )
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

function PhaseChip({ t }: { t: TenantGrowthRow }) {
  if (!t.growthOn) return <StatusChip tone="mute">Solo Loyalty</StatusChip>
  if (t.phase === "not_started") return <StatusChip tone="warn">Empieza más adelante</StatusChip>
  if (t.phase === "pilot")
    return (
      <StatusChip tone="info">{`Piloto · mes ${t.pilotMonth} de ${t.rules.pilotMonths}`}</StatusChip>
    )
  return (
    <StatusChip tone="ok">
      {t.pilotMonth ? `Facturando · mes ${t.pilotMonth}` : "Activo · sin fecha de inicio"}
    </StatusChip>
  )
}

function TenantLine({ t }: { t: TenantGrowthRow }) {
  const on = t.growthOn
  return (
    <Tr>
      <Td>
        <Link
          href={`/admin/tenants/${t.id}`}
          className="text-ent-accent hover:underline font-medium"
        >
          {t.name}
        </Link>
      </Td>
      <Td>
        <ConnectorChip c={t.connector} />
      </Td>
      <Td className="text-right tabular-nums">
        {on ? `${t.sendsMonth} · ${t.sentMonth} enviados` : "—"}
      </Td>
      <Td className="text-right tabular-nums">
        {on ? `${soles(t.attributedMonth.amount)} · ${t.attributedMonth.tickets} t.` : "—"}
      </Td>
      <Td className="text-ent-fg-2">
        {on
          ? `${t.rules.feeFixed} fijo${t.rules.feeVariablePct != null ? ` + ${t.rules.feeVariablePct} %` : ""}`
          : "—"}
      </Td>
      <Td className="text-right tabular-nums">{on ? soles(t.billing.total) : "—"}</Td>
      <Td>
        <PhaseChip t={t} />
      </Td>
    </Tr>
  )
}
