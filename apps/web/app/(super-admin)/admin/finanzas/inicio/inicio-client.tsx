"use client"

import { ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  DataTable,
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
import { ALERT_SECTION_TITLE } from "@/lib/admin/admin-alerts-types"
import type { FinanceHome } from "@/lib/admin/finance-agenda"
import { apiCall, soles, solesInt, ymd } from "@/lib/admin/format"
import { monthShort } from "@/lib/admin/issuers"

const TONE = { critical: "bad", warning: "warn", info: "info" } as const

/**
 * Finanzas › Inicio: what needs a hand this month — merchant invoices to
 * issue and to collect, the PDT 621 due date, the accountant's close, the
 * reserve to set aside — with the four figures that matter. The same items
 * go out in the daily email.
 */
export function FinanzasInicioClient() {
  const [data, setData] = useState<FinanceHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      setData(await apiCall<FinanceHome>("GET", "/api/admin/finance/home"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const header = (
    <PageHeader
      crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Finanzas" }]}
      title="Finanzas"
      subtitle="Lo que toca este mes: facturar, cobrar, declarar y separar la reserva."
    />
  )
  if (error || !data) {
    return (
      <div className="space-y-3">
        {header}
        <PanelMessage className="py-20">
          {error ?? <Loader2 className="w-5 h-5 animate-spin" />}
        </PanelMessage>
      </div>
    )
  }
  const s = data.stats
  return (
    <div className="space-y-3">
      {header}
      <StatStrip
        stats={[
          {
            label: "Por cobrar",
            value: soles(s.receivable),
            hint: `${s.receivableCount} ${s.receivableCount === 1 ? "factura" : "facturas"}`,
          },
          {
            label: "Facturas por emitir",
            value: s.toIssue,
            tone: s.toIssue > 0 ? "warn" : "ok",
            hint: s.toIssue > 0 ? "vencidas o de hoy" : "al día",
          },
          s.nextPdt
            ? {
                label: `PDT de ${monthShort(s.nextPdt.month)}`,
                value: solesInt(s.nextPdt.amount),
                hint: s.nextPdt.due ? `vence ${ymd(s.nextPdt.due)}` : "sin fecha",
              }
            : { label: "PDT", value: "Al día", tone: "ok" },
          {
            label: "Reserva por separar",
            value: soles(s.reservePending),
            tone: s.reservePending > 0 ? "warn" : "ok",
          },
        ]}
      />
      <Panel>
        <PanelHeader
          title="Agenda"
          actions={
            <span className="text-[11.5px] text-ent-fg-3">También llega en el correo diario</span>
          }
        />
        {data.alerts.length === 0 ? (
          <PanelMessage className="py-10">Nada pendiente: todo al día.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Qué</Th>
                <Th>Quién</Th>
                <Th>Detalle</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((a) => (
                <Tr key={a.key}>
                  <Td className="whitespace-nowrap">
                    <StatusChip tone={TONE[a.severity]}>{ALERT_SECTION_TITLE[a.kind]}</StatusChip>
                  </Td>
                  <Td className="font-medium whitespace-nowrap">{a.who}</Td>
                  <Td className="text-ent-fg-2">{a.text}</Td>
                  <Td align="right">
                    <Link
                      href={a.href}
                      className="inline-flex items-center gap-1 text-[12px] text-ent-accent hover:underline"
                    >
                      Abrir <ArrowRight className="w-3 h-3" />
                    </Link>
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
