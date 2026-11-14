"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  DataTable,
  FieldList,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatStrip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Input } from "@/components/ui/input"
import { soles, solesInt } from "@/lib/admin/format"
import { monthShort, REGIME_LABEL } from "@/lib/admin/issuers"
import type { MonthTax } from "@/lib/admin/tax"
import type { TaxSummary } from "@/lib/admin/tax-data"
import { cn } from "@/lib/utils"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const pct = (r: number) => `${Math.round(r * 10000) / 100} %`

type Available = Extract<TaxSummary, { available: true }>

/**
 * Finanzas › Resumen fiscal: what Cuik pays and sets aside each month under
 * MYPE Tributario, as the accountant runs it — IGV and the 1 % pago a cuenta
 * go to SUNAT with the PDT 621; 10 % of sales is kept in the bank for the
 * annual return (March–April of the next year).
 */
export function ResumenFiscalClient() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7)
  const [month, setMonth] = useState(today)
  const [data, setData] = useState<TaxSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month")
    if (m && MONTH_RE.test(m)) setMonth(m)
  }, [])

  const refresh = useCallback(async () => {
    const req = ++requestRef.current
    try {
      const res = await fetch(`/api/admin/finance/tax-summary?month=${month}`)
      const json = await res.json()
      if (req !== requestRef.current) return
      if (!json.success) throw new Error(json.error)
      setData(json.data)
      setError(null)
    } catch (e) {
      if (req !== requestRef.current) return
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [month])
  useEffect(() => {
    refresh()
  }, [refresh])

  const header = (
    <PageHeader
      crumbs={[
        { label: "Inicio", href: "/admin" },
        { label: "Finanzas", href: "/admin/finanzas/tablero" },
        { label: "Resumen fiscal" },
      ]}
      title="Resumen fiscal"
      subtitle={
        data?.available
          ? `${data.issuer.razonSocial} · RUC ${data.issuer.ruc} · ${REGIME_LABEL[data.profile.regime]}`
          : "IGV, pago a cuenta y reserva para la renta anual"
      }
      actions={
        <Input
          type="month"
          value={month}
          onChange={(e) => MONTH_RE.test(e.target.value) && setMonth(e.target.value)}
          className="h-7 w-[180px] text-[12px]"
          aria-label="Mes"
        />
      }
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
  if (!data.available) {
    return (
      <div className="space-y-3">
        {header}
        <Notice tone="info">
          {data.issuer
            ? `${data.issuer.razonSocial} no tiene régimen tributario en ${monthShort(month)}: ese mes queda fuera de los libros de Cuik.`
            : `Ningún emisor cubre ${monthShort(month)}.`}{" "}
          Revisa Finanzas › Empresa y régimen.
        </Notice>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {header}
      <Summary data={data} />
    </div>
  )
}

function Summary({ data }: { data: Available }) {
  const { current: c, projected: p, profile } = data
  const hasPending = data.toBill.length > 0
  const shown = hasPending ? p : c
  return (
    <>
      {!profile.validatedByAccountant && (
        <Notice tone="warn">
          Las tasas del régimen aún no están marcadas como validadas por el contador: tómalo como
          estimado.
        </Notice>
      )}
      {data.closed && (
        <Notice tone="info">
          {monthShort(data.month)} está cerrado : sus cifras quedaron fijas (lo declarado por el
          contador o, si no se importó, lo calculado al cerrar).{" "}
          <Link href={`/admin/finanzas/cierres?month=${data.month}`} className="underline">
            Ver cierre
          </Link>
        </Notice>
      )}
      <IncomeLimitNotice data={data} />
      {data.pendingInvoices.length > 0 && (
        <Notice tone="warn">
          {data.pendingInvoices.length === 1
            ? "1 factura de Facturación de este mes no está en Ventas y no se cuenta."
            : `${data.pendingInvoices.length} facturas de Facturación de este mes no están en Ventas y no se cuentan.`}{" "}
          <Link href={`/admin/finanzas/ventas?month=${data.month}`} className="underline">
            Ir a Ventas
          </Link>
        </Notice>
      )}
      {c.purchaseIgvPending !== 0 && (
        <Notice tone="info">
          {soles(c.purchaseIgvPending)} de IGV de compras (representación o no domiciliados) esperan
          la decisión del contador y no se descuentan.
        </Notice>
      )}
      <StatStrip
        stats={[
          {
            label: "Pagar a SUNAT (PDT 621)",
            value: solesInt(shown.payToSunat),
            hint: `IGV ${solesInt(shown.igvToPay)} + renta ${solesInt(shown.incomeAdvance)}`,
          },
          {
            label: `Separar renta anual (${pct(profile.reserveRate)})`,
            value: soles(shown.annualReserve),
          },
          { label: "Total a apartar del mes", value: soles(shown.totalSetAside) },
          { label: "Queda para Cuik", value: soles(shown.netForCuik), tone: "ok" },
        ]}
      />
      {hasPending && (
        <p className="text-[12px] text-ent-fg-3">
          Las cifras de arriba incluyen lo que falta facturar este mes ({data.toBill.length}{" "}
          {data.toBill.length === 1 ? "comercio" : "comercios"}). Con lo ya facturado: pagar{" "}
          {solesInt(c.payToSunat)} y separar {soles(c.annualReserve)}.
        </p>
      )}
      <MonthPanel data={data} />
      {hasPending && <ToBillPanel data={data} />}
      <YearPanel data={data} />
      <AnnualPanel data={data} />
    </>
  )
}

/**
 * MYPE Tributario: the 1 % pago a cuenta applies while the year's net income
 * stays within 300 UIT; above it the rate changes (the accountant decides).
 */
function IncomeLimitNotice({ data }: { data: Available }) {
  const limit = data.annual.advanceIncomeLimit
  if (limit === null) return null
  const income = data.annual.income
  if (income >= limit) {
    return (
      <Notice tone="bad">
        Los ingresos de {data.annual.year} ({soles(income)}) pasaron las 300 UIT ({soles(limit)}):
        el pago a cuenta ya no es 1 %. Consulta al contador y actualiza la tasa en Empresa y
        régimen.
      </Notice>
    )
  }
  if (income >= limit * 0.8) {
    return (
      <Notice tone="warn">
        Los ingresos de {data.annual.year} van en {soles(income)}, cerca del tope de 300 UIT (
        {soles(limit)}) para el pago a cuenta de 1 %.
      </Notice>
    )
  }
  return null
}

function MonthPanel({ data }: { data: Available }) {
  const { current: c, projected: p, profile } = data
  const hasPending = data.toBill.length > 0
  const rows: { label: string; get: (t: MonthTax) => string; strong?: boolean; sub?: boolean }[] = [
    { label: "Facturado (con IGV)", get: (t) => soles(t.salesTotal) },
    { label: "Valor de venta (base imponible)", get: (t) => soles(t.salesBase) },
    { label: `IGV de ventas (${pct(profile.igvRate)})`, get: (t) => soles(t.salesIgv) },
    {
      label: "Menos IGV de compras con crédito",
      get: (t) => soles(-t.purchaseIgvCredit),
      sub: true,
    },
    {
      label: "Menos saldo a favor del mes anterior",
      get: (t) => soles(-t.igvCreditCarried),
      sub: true,
    },
    {
      label: "IGV a pagar (código 1011)",
      get: (t) => `${solesInt(t.igvToPay)} (${soles(t.igvToPayExact)})`,
    },
    {
      label: `Pago a cuenta renta ${pct(profile.monthlyRate)} (código 3121)`,
      get: (t) => `${solesInt(t.incomeAdvance)} (${soles(t.incomeAdvanceExact)})`,
    },
    { label: "Total a pagar a SUNAT", get: (t) => solesInt(t.payToSunat), strong: true },
    {
      label: `Separar para renta anual (${pct(profile.reserveRate)} del valor de venta)`,
      get: (t) => soles(t.annualReserve),
      strong: true,
    },
    {
      label: "Saldo a favor de IGV para el mes siguiente",
      get: (t) => soles(t.igvCreditNext),
      sub: true,
    },
    { label: "Queda para Cuik", get: (t) => soles(t.netForCuik), strong: true },
  ]
  return (
    <Panel>
      <PanelHeader title={`Cálculo de ${monthShort(data.month)}`} />
      <DataTable>
        <thead>
          <tr>
            <Th>Concepto</Th>
            <Th align="right">Ya facturado</Th>
            {hasPending && <Th align="right">Con lo pendiente</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.label}>
              <Td className={cn(r.strong && "font-semibold", r.sub && "text-ent-fg-3 pl-6")}>
                {r.label}
              </Td>
              <Td align="right" className={cn(r.strong && "font-semibold")}>
                {r.get(c)}
              </Td>
              {hasPending && (
                <Td align="right" className={cn(r.strong && "font-semibold")}>
                  {r.get(p)}
                </Td>
              )}
            </Tr>
          ))}
        </tbody>
      </DataTable>
      <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-t border-ent-line">
        El PDT 621 se declara en soles enteros: entre paréntesis, el monto exacto. El IGV no es
        ingreso de Cuik: se cobra al comercio y se entrega a SUNAT, menos el IGV de las compras con
        factura a nombre de la empresa. Vence según el cronograma de SUNAT por el último dígito del
        RUC.
      </p>
    </Panel>
  )
}

function ToBillPanel({ data }: { data: Available }) {
  return (
    <Panel>
      <PanelHeader title="Falta facturar o registrar este mes" />
      <DataTable>
        <thead>
          <tr>
            <Th>Comercio</Th>
            <Th align="right">Tarifa</Th>
            <Th align="right">Base</Th>
            <Th align="right">IGV</Th>
          </tr>
        </thead>
        <tbody>
          {data.toBill.map((t) => (
            <Tr key={`${t.source}-${t.tenantId}-${t.total}`}>
              <Td>
                <Link href={`/admin/tenants/${t.tenantId}`} className="hover:underline">
                  {t.name}
                </Link>
                <span className="block text-[11px] text-ent-fg-3">
                  {t.source === "factura"
                    ? "Registrada en Facturación, falta en Ventas"
                    : "Por emitir según su tarifa"}
                </span>
              </Td>
              <Td align="right">
                {soles(t.total)}
                <span className="block text-[11px] text-ent-fg-3">
                  {t.includesIgv ? "incluye IGV" : "más IGV"}
                </span>
              </Td>
              <Td align="right">{soles(t.base)}</Td>
              <Td align="right">{soles(t.igv)}</Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  )
}

function YearPanel({ data }: { data: Available }) {
  let running = 0
  return (
    <Panel>
      <PanelHeader title={`${data.annual.year} mes a mes (lo facturado)`} />
      <DataTable>
        <thead>
          <tr>
            <Th>Mes</Th>
            <Th align="right">Valor de venta</Th>
            <Th align="right">IGV a pagar</Th>
            <Th align="right">Pago a cuenta</Th>
            <Th align="right">A SUNAT</Th>
            <Th align="right">Reserva del mes</Th>
            <Th align="right">Reserva acumulada</Th>
          </tr>
        </thead>
        <tbody>
          {data.yearRows.map((r) => {
            running += r.annualReserve
            return (
              <Tr key={r.month}>
                <Td>{monthShort(r.month)}</Td>
                <Td align="right">{soles(r.salesBase)}</Td>
                <Td align="right">{solesInt(r.igvToPay)}</Td>
                <Td align="right">{solesInt(r.incomeAdvance)}</Td>
                <Td align="right">{solesInt(r.payToSunat)}</Td>
                <Td align="right">{soles(r.annualReserve)}</Td>
                <Td align="right" className="font-semibold">
                  {soles(Math.round(running * 100) / 100)}
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </DataTable>
    </Panel>
  )
}

function AnnualPanel({ data }: { data: Available }) {
  const a = data.annual
  const next = Number(a.year) + 1
  return (
    <Panel>
      <PanelHeader title={`Renta anual ${a.year} (se declara en marzo–abril ${next})`} />
      {a.uitYear !== null && a.uitYear !== Number(a.year) && (
        <Notice tone="info" className="m-3">
          Se usa la UIT {a.uitYear} hasta que cargues la de {a.year} en Finanzas › Empresa y
          régimen.
        </Notice>
      )}
      {a.tax === null && (
        <Notice tone="warn" className="m-3">
          Falta la UIT {a.year} en Finanzas › Empresa y régimen para calcular los tramos.
        </Notice>
      )}
      <div className="px-3 py-1">
        <FieldList
          rows={[
            { label: "Valor de venta del año", value: soles(a.income) },
            { label: "Menos gastos deducibles con comprobante", value: soles(-a.deductible) },
            { label: "Utilidad estimada", value: soles(a.netIncome) },
            {
              label: "Impuesto anual estimado",
              value: a.tax === null ? "—" : soles(a.tax),
            },
            { label: "Menos pagos a cuenta ya pagados", value: solesInt(-a.advances) },
            {
              label: "Saldo a pagar en la declaración",
              value: a.balanceDue === null ? "—" : soles(a.balanceDue),
            },
            { label: "Reserva separada en el año", value: soles(a.reserved) },
            {
              label: "Margen de la reserva",
              value:
                a.reserveMargin === null ? (
                  "—"
                ) : (
                  <span className={a.reserveMargin < 0 ? "text-ent-bad" : "text-ent-ok"}>
                    {a.reserveMargin < 0
                      ? `Faltan ${soles(-a.reserveMargin)}`
                      : `Sobran ${soles(a.reserveMargin)}`}
                  </span>
                ),
            },
          ]}
        />
      </div>
      <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-t border-ent-line">
        La reserva separa el {pct(data.profile.reserveRate)} de cada mes, como indica el contador.
        El impuesto anual real se calcula sobre la utilidad (ventas menos gastos deducibles) y
        descuenta los pagos a cuenta, así que normalmente la reserva alcanza con margen. Solo se
        cuentan los gastos registrados en Compras con su comprobante.
      </p>
    </Panel>
  )
}
