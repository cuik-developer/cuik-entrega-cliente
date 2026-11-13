"use client"

import { Download, Megaphone, Printer } from "lucide-react"

import {
  DataTable,
  FieldList,
  PageHeader,
  Panel,
  PanelHeader,
  StatStrip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { daysText, delta, fmtDay, fmtMonth, pctText, soles } from "@/lib/loyalty/impact/format"
import type { ReportView } from "@/lib/loyalty/impact/store"

/**
 * The corte on screen: KPIs, comparison with the previous corte, coverage,
 * registration at the till, retention, frequency and money, the lists.
 * `excelHref` is the download of this report for whoever is looking.
 */
export function ImpactReport({
  report,
  excelHref,
  tenantName,
  campaignHref,
}: {
  report: ReportView
  excelHref: string
  tenantName: string
  /** Panel only: opens a campaign to the card holders whose frequency broke. */
  campaignHref?: string
}) {
  const s = report.summary
  const p = report.previous?.summary ?? null
  const f = s.frequency
  const r = s.retention
  const reg = s.registration
  const min = s.options.minimumPurchase

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Corte al ${fmtDay(s.period.to)}`}
        subtitle={
          <>
            Ventas del {fmtDay(s.period.from)} al {fmtDay(s.period.to)} · calculado el{" "}
            {fmtDay(report.computedAt)}
            {s.options.phase
              ? ` · etapa «${s.options.phase.name}» desde el ${fmtDay(s.options.phase.startsOn)}`
              : ""}
            {s.options.launch ? ` · Cuik desde el ${fmtDay(s.options.launch)}` : ""}
          </>
        }
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-[12.5px]"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-[12.5px]">
              <a href={excelHref}>
                <Download className="w-3.5 h-3.5" /> Excel
              </a>
            </Button>
          </div>
        }
      />

      <StatStrip
        stats={[
          {
            label: "Registro en caja",
            value: pctText(reg.pct),
            hint:
              delta(reg.pct, p?.registration.pct, " pts") ??
              `${reg.registeredDays} de ${reg.eligibleDays}`,
            tone: p ? ((reg.pct ?? 0) >= (p.registration.pct ?? 0) ? "ok" : "bad") : "mute",
          },
          {
            label: `Retención ${r.windowDays} d con tarjeta`,
            value: pctText(r.afterLaunch.card.retained),
            hint: `sin tarjeta ${pctText(r.afterLaunch.noCard.retained)}`,
            tone: "mute",
          },
          {
            label: "Días entre compras",
            value: `${daysText(f.registered.gapBefore)} → ${daysText(f.registered.gapAfter)}`,
            hint: `control ${daysText(f.control.gapBefore)} → ${daysText(f.control.gapAfter)}`,
            tone: "mute",
          },
          {
            label: "Venta protegida al año",
            value: soles(f.moneyPerYear),
            hint:
              f.extraPurchasesPerYear != null
                ? `${f.extraPurchasesPerYear} compras extra por cliente`
                : undefined,
            tone: "mute",
          },
        ]}
      />

      {p && (
        <Panel>
          <PanelHeader
            title={`Comparado con el corte anterior (al ${fmtDay(report.previous?.periodTo)})`}
          />
          <div className="p-3">
            <FieldList
              rows={[
                {
                  label: "Registro en caja",
                  value: `${pctText(p.registration.pct)} → ${pctText(reg.pct)} (${delta(reg.pct, p.registration.pct, " pts") ?? "—"})`,
                },
                {
                  label: `Retención con tarjeta`,
                  value: `${pctText(p.retention.afterLaunch.card.retained)} → ${pctText(r.afterLaunch.card.retained)}`,
                },
                {
                  label: "Retención sin tarjeta",
                  value: `${pctText(p.retention.afterLaunch.noCard.retained)} → ${pctText(r.afterLaunch.noCard.retained)}`,
                },
                {
                  label: "Días entre compras con tarjeta",
                  value: `${daysText(p.frequency.registered.gapAfter)} → ${daysText(f.registered.gapAfter)}`,
                },
                {
                  label: "Frecuentes sin tarjeta",
                  value: `${p.unregisteredFrequent.count} → ${s.unregisteredFrequent.count} (${delta(s.unregisteredFrequent.count, p.unregisteredFrequent.count) ?? "—"})`,
                },
                {
                  label: "Frecuencia rota",
                  value: `${p.brokenFrequency.total} → ${s.brokenFrequency.total}`,
                },
                {
                  label: "Clientes Cuik encontrados en ventas",
                  value: `${p.cuik.matchedInSales} → ${s.cuik.matchedInSales}`,
                },
              ]}
            />
          </div>
        </Panel>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel>
          <PanelHeader title="Cobertura del archivo" />
          <div className="p-3 space-y-3">
            <FieldList
              rows={[
                { label: "Compras", value: s.coverage.orders.toLocaleString("es-PE") },
                {
                  label: "Con DNI válido",
                  value: `${s.coverage.ordersWithDni.toLocaleString("es-PE")} (${pctText(s.coverage.coveragePct)})`,
                },
                {
                  label: "Clientes distintos",
                  value: s.coverage.uniqueDnis.toLocaleString("es-PE"),
                },
                {
                  label: "Venta y ticket",
                  value: `${soles(s.coverage.revenue)} · ticket ${s.coverage.avgTicket != null ? `S/ ${s.coverage.avgTicket.toFixed(2)}` : "—"}`,
                },
                {
                  label: "Clientes Cuik con DNI",
                  value: `${s.cuik.clients} · ${s.cuik.matchedInSales} encontrados en las ventas`,
                },
                {
                  label: "Visitas Cuik consideradas",
                  value: s.cuik.visitsConsidered.toLocaleString("es-PE"),
                },
              ]}
            />
            <DataTable>
              <thead>
                <tr>
                  <Th>Tienda</Th>
                  <Th align="right">Compras</Th>
                  <Th align="right">Con DNI</Th>
                  <Th align="right">Venta</Th>
                </tr>
              </thead>
              <tbody>
                {s.coverage.byStore.map((b) => (
                  <Tr key={b.store}>
                    <Td>{b.store}</Td>
                    <Td align="right">{b.orders.toLocaleString("es-PE")}</Td>
                    <Td align="right">{pctText(b.coveragePct)}</Td>
                    <Td align="right">{soles(b.revenue)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Registro en caja"
            actions={
              <span className="text-[11.5px] text-ent-fg-3">
                {min !== null ? `compras ≥ S/ ${min}` : "toda compra"} con visita el mismo día
              </span>
            }
          />
          <div className="p-3 space-y-3">
            <FieldList
              rows={[
                {
                  label: "Cumplimiento",
                  value: `${pctText(reg.pct)} (${reg.registeredDays} de ${reg.eligibleDays})`,
                },
                ...(min !== null
                  ? [
                      {
                        label: "Bajo el mínimo",
                        value: `${reg.smallDays} compras sin sello posible (${reg.smallDaysWithVisit} con visita igual)`,
                      },
                    ]
                  : []),
                { label: "Visitas sin compra ese día", value: String(reg.orphanVisits) },
                {
                  label: "Clientes",
                  value: `${reg.clientsWithEligible} · 100 %: ${reg.buckets["100%"]} · 50-99: ${reg.buckets["50-99%"]} · 1-49: ${reg.buckets["1-49%"]} · 0 %: ${reg.buckets["0%"]}`,
                },
              ]}
            />
            <DataTable>
              <thead>
                <tr>
                  <Th>Tienda</Th>
                  <Th align="right">Elegibles</Th>
                  <Th align="right">Registradas</Th>
                  <Th align="right">%</Th>
                </tr>
              </thead>
              <tbody>
                {reg.byStore.map((b) => (
                  <Tr key={b.store}>
                    <Td>{b.store}</Td>
                    <Td align="right">{b.eligible}</Td>
                    <Td align="right">{b.registered}</Td>
                    <Td align="right">{pctText(b.pct)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel>
          <PanelHeader title="Registro por mes" />
          <DataTable>
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th align="right">Elegibles</Th>
                <Th align="right">Registradas</Th>
                <Th align="right">%</Th>
              </tr>
            </thead>
            <tbody>
              {reg.byMonth.slice(-12).map((b) => (
                <Tr key={b.month}>
                  <Td>{fmtMonth(b.month)}</Td>
                  <Td align="right">{b.eligible}</Td>
                  <Td align="right">{b.registered}</Td>
                  <Td align="right">{pctText(b.pct)}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
        <Panel>
          <PanelHeader title="Visitas por cajero" />
          <DataTable>
            <thead>
              <tr>
                <Th>Registrada por</Th>
                <Th align="right">Visitas</Th>
                <Th align="right">QR</Th>
                <Th align="right">Manual</Th>
                <Th align="right">Sin compra</Th>
              </tr>
            </thead>
            <tbody>
              {reg.byCashier.map((c) => (
                <Tr key={c.cashier}>
                  <Td>{c.cashier}</Td>
                  <Td align="right">{c.visits}</Td>
                  <Td align="right">{c.qr}</Td>
                  <Td align="right">{c.manual}</Td>
                  <Td align="right">{c.orphan}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={`Retención a ${r.windowDays} días`}
          actions={
            <span className="text-[11.5px] text-ent-fg-3">
              volvió a comprar dentro de {r.windowDays} días
            </span>
          }
        />
        <div className="p-3 space-y-3">
          <StatStrip
            stats={[
              {
                label: "Antes de Cuik",
                value: pctText(r.beforeLaunch.retained),
                hint: `${r.beforeLaunch.cohort} cohortes-mes`,
              },
              {
                label: "Después, todos",
                value: pctText(r.afterLaunch.all.retained),
                hint: `${r.afterLaunch.all.cohort}`,
              },
              {
                label: "Después, con tarjeta",
                value: pctText(r.afterLaunch.card.retained),
                hint: `${r.afterLaunch.card.cohort}`,
                tone: "ok",
              },
              {
                label: "Después, sin tarjeta",
                value: pctText(r.afterLaunch.noCard.retained),
                hint: `${r.afterLaunch.noCard.cohort}`,
              },
            ]}
          />
          <FieldList
            rows={[
              {
                label: "Mismo cliente, con tarjeta",
                value: `${pctText(r.sameClient.registered.before.pct)} antes → ${pctText(r.sameClient.registered.after.pct)} después de registrarse (${r.sameClient.registered.clients} clientes)`,
              },
              {
                label: "Mismo cliente, sin tarjeta",
                value: `${pctText(r.sameClient.control.before.pct)} antes → ${pctText(r.sameClient.control.after.pct)} después del lanzamiento (${r.sameClient.control.clients} clientes)`,
              },
            ]}
          />
          <p className="text-[11px] text-ent-fg-3">
            La vista por cohortes compara personas distintas (quien se registra ya era buen
            cliente); la de "mismo cliente" compara a cada uno consigo mismo y mide el efecto real
            de la tarjeta.
          </p>
          <DataTable>
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th align="right">Clientes</Th>
                <Th align="right">Retenidos</Th>
                <Th align="right">Con tarjeta</Th>
                <Th align="right">Sin tarjeta</Th>
              </tr>
            </thead>
            <tbody>
              {r.cohorts.slice(-12).map((c) => (
                <Tr key={c.month}>
                  <Td>{fmtMonth(c.month)}</Td>
                  <Td align="right">{c.cohort}</Td>
                  <Td align="right">{pctText(c.retained)}</Td>
                  <Td align="right">
                    {c.cardCohort ? `${pctText(c.cardRetained)} (${c.cardCohort})` : "—"}
                  </Td>
                  <Td align="right">
                    {c.noCardCohort ? `${pctText(c.noCardRetained)} (${c.noCardCohort})` : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-3 gap-3">
        <Panel>
          <PanelHeader title="Frecuencia y dinero" />
          <div className="p-3">
            <FieldList
              rows={[
                {
                  label: "Con tarjeta",
                  value: `${daysText(f.registered.gapBefore)} → ${daysText(f.registered.gapAfter)} entre compras (${f.registered.n})`,
                },
                {
                  label: "Sin tarjeta (control)",
                  value: `${daysText(f.control.gapBefore)} → ${daysText(f.control.gapAfter)} (${f.control.n})`,
                },
                {
                  label: "Compras extra al año",
                  value:
                    f.extraPurchasesPerYear != null
                      ? `${f.extraPurchasesPerYear} por cliente`
                      : "—",
                },
                {
                  label: "Ticket promedio",
                  value:
                    s.coverage.avgTicket != null
                      ? `S/ ${s.coverage.avgTicket.toFixed(2)} por compra`
                      : "—",
                },
                {
                  label: "Venta protegida",
                  value: `${soles(f.moneyPerYear)} al año · ${f.cardClients} clientes con tarjeta`,
                },
                ...(f.extraPurchasesPerYear != null && s.coverage.avgTicket != null
                  ? [
                      {
                        label: "Cálculo",
                        value: `${f.extraPurchasesPerYear} compras × S/ ${s.coverage.avgTicket.toFixed(2)} × ${f.cardClients} clientes`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Frecuentes sin tarjeta"
            actions={<span className="text-[11.5px] text-ent-fg-3">3+ compras en 12 meses</span>}
          />
          <div className="p-3">
            <FieldList
              rows={[
                { label: "Clientes", value: s.unregisteredFrequent.count.toLocaleString("es-PE") },
                { label: "Gasto", value: soles(s.unregisteredFrequent.spend) },
                {
                  label: "Con teléfono",
                  value: s.unregisteredFrequent.list
                    .filter((u) => u.phone)
                    .length.toLocaleString("es-PE"),
                },
              ]}
            />
            <p className="mt-2 text-[11px] text-ent-fg-3">
              La lista completa, con nombre y teléfono, está en el Excel.
            </p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Frecuencia rota"
            actions={
              <span className="text-[11.5px] text-ent-fg-3">silencio &gt; 1,5× su ritmo</span>
            }
          />
          <div className="p-3">
            <FieldList
              rows={[
                { label: "Clientes", value: s.brokenFrequency.total.toLocaleString("es-PE") },
                {
                  label: "Con tarjeta",
                  value: `${s.brokenFrequency.registered} (se les puede escribir)`,
                },
                { label: "Sin tarjeta", value: `${s.brokenFrequency.notRegistered}` },
              ]}
            />
            {campaignHref && s.brokenFrequency.registered > 0 && (
              <Button asChild size="sm" className="mt-2 h-8 gap-1.5 text-[12.5px] print:hidden">
                <a href={campaignHref}>
                  <Megaphone className="w-3.5 h-3.5" /> Crear campaña a los{" "}
                  {s.brokenFrequency.registered} con tarjeta
                </a>
              </Button>
            )}
          </div>
        </Panel>
      </div>

      {(s.staff.detected.length > 0 || s.staff.manual.length > 0) && (
        <Panel>
          <PanelHeader title="Cuentas excluidas (personal)" />
          <div className="p-3 text-[12.5px] text-ent-fg-2 space-y-1">
            {s.staff.manual.length > 0 && <p>A mano: {s.staff.manual.join(" · ")}</p>}
            {s.staff.detected.length > 0 && (
              <p>
                Detectadas por compra casi diaria:{" "}
                {s.staff.detected
                  .map((d) => `${d.name ?? d.dni} (${d.purchases} compras)`)
                  .join(" · ")}
                . Si alguna es un cliente real, quítala de la lista de excluidos en la próxima
                carga.
              </p>
            )}
          </div>
        </Panel>
      )}

      <p className="text-[11px] text-ent-fg-3">
        {tenantName}: todo sale del archivo del comercio y de los datos de Cuik; nada se estima
        fuera de ellos. La venta protegida usa el ticket promedio del propio archivo.
      </p>
    </div>
  )
}
