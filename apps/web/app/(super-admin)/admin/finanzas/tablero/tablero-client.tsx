"use client"

import { Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  type Stat,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FinanceDashboard } from "@/lib/admin/finance-dashboard"
import { cn } from "@/lib/utils"

type View = "cash" | "accrual"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const BLUE = "#0E70DB"
const ORANGE = "#FF4810"
const INK = "#231F20"

function soles(n: number, opts: { sign?: boolean } = {}) {
  const abs = Math.abs(n).toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : ""
  return `${sign}S/ ${abs}`
}
function monthLabel(ym: string, withYear = true) {
  const [y, m] = ym.split("-").map(Number)
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
  const name = names[(m - 1 + 12) % 12] ?? ym
  return withYear ? `${name} ${y}` : name
}

type ChartPoint = {
  month: string
  label: string
  ingresos: number
  salidas: number
  acumulado: number
  projected: boolean
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartPoint }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-ent-panel border border-ent-line rounded-[4px] text-[12px] text-ent-fg px-2.5 py-1.5 space-y-0.5 tabular-nums">
      <div className="font-medium">
        {monthLabel(p.month)}
        {p.projected && <span className="text-ent-fg-3 font-normal"> · proyectado</span>}
      </div>
      <div>Ingresos: {soles(p.ingresos)}</div>
      <div>Salidas: {soles(p.salidas)}</div>
      <div>Neto: {soles(p.ingresos - p.salidas, { sign: true })}</div>
      <div>Acumulado: {soles(p.acumulado, { sign: true })}</div>
    </div>
  )
}

/**
 * Tablero: the month-by-month picture of Cuik's money in soles. Merchant
 * invoices and other incomes against fixed/variable costs and loan
 * installments, in two views (cash = when money moves; accrual = spread over
 * the months each payment covers), with the months ahead projected from each
 * merchant's billing terms, the fixed costs and the loan schedule.
 */
export function TableroClient() {
  const [data, setData] = useState<FinanceDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>("cash")
  // Filters: empty = server default. `*Draft` is what's typed; the plain one is what's applied
  // (a month applies only once complete, so a half-typed value never refetches or snaps back).
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [ticket, setTicket] = useState("")
  const [fromDraft, setFromDraft] = useState("")
  const [toDraft, setToDraft] = useState("")
  const [ticketDraft, setTicketDraft] = useState("")
  const seq = useRef(0)

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (from) q.set("from", from)
    if (to) q.set("to", to)
    if (ticket) q.set("ticket", ticket)
    return q.toString()
  }, [from, to, ticket])

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/finance/ledger${query ? `?${query}` : ""}`)
      const json = await res.json()
      if (mine !== seq.current) return // a newer request is in flight
      if (!json.success) {
        const fieldError = json?.details?.fieldErrors
          ? (Object.values(json.details.fieldErrors as Record<string, string[]>).flat()[0] ?? null)
          : null
        throw new Error(fieldError ?? json.error ?? "No se pudo cargar")
      }
      setData(json.data)
      setFromDraft(json.data.range.from)
      setToDraft(json.data.range.to)
      setError(null)
    } catch (e) {
      if (mine !== seq.current) return
      setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [query])
  useEffect(() => {
    load()
  }, [load])

  const applyMonth = (setter: (v: string) => void) => (v: string) => {
    if (MONTH_RE.test(v)) setter(v)
  }
  const reset = () => {
    setFrom("")
    setTo("")
    setTicket("")
    setTicketDraft("")
  }

  if (error && !data) return <PanelMessage className="py-20">{error}</PanelMessage>
  if (!data) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  const d = data
  const todayMonth = d.range.todayMonth
  const cur = d.current
  const isCash = view === "cash"
  const pick = (r: FinanceDashboard["rows"][number]) => ({
    income: isCash ? r.incomeCash : r.incomeAccrual,
    projected: isCash ? r.projectedCash : r.projectedAccrual,
    cost: isCash ? r.costCash : r.costAccrual,
    net: isCash ? r.netCash : r.netAccrual,
    cumulative: isCash ? r.cumulativeCash : r.cumulativeAccrual,
  })
  const curPick = cur ? pick(cur) : null
  const curIncome = curPick ? curPick.income + curPick.projected : 0
  const curOut = curPick && cur ? curPick.cost + cur.loanPayments : 0
  const curNet = curPick?.net ?? 0
  const loanBalancePen = d.loans.reduce((a, l) => a + l.balancePen, 0)
  const remaining = d.loans.reduce((a, l) => a + l.remaining, 0)
  const gap =
    d.breakEven.merchantsNeeded === null ? null : d.breakEven.merchantsNeeded - d.merchants.paying
  const hasAnything =
    d.rows.some(
      (r) =>
        r.incomeCash ||
        r.incomeAccrual ||
        r.projectedAccrual ||
        r.costCash ||
        r.costAccrual ||
        r.loanPayments ||
        r.contributions,
    ) || d.merchants.list.length > 0

  const statsMonth: Stat[] = [
    {
      label: `Neto de ${monthLabel(todayMonth)} · ${isCash ? "caja" : "devengado"}`,
      value: soles(curNet, { sign: true }),
      hint: curNet < 0 ? "lo cubre el socio" : "positivo",
      tone: curNet < 0 ? "bad" : "ok",
    },
    {
      label: "Ingresos del mes",
      value: soles(curIncome),
      hint: `${d.merchants.paying} ${d.merchants.paying === 1 ? "comercio" : "comercios"}`,
    },
    {
      label: "Salidas del mes",
      value: soles(curOut),
      hint: cur && cur.loanPayments > 0 ? `${soles(cur.loanPayments)} en cuotas` : "sin cuotas",
    },
    {
      label: "Punto de equilibrio",
      value:
        d.breakEven.merchantsNeeded === null ? "—" : `${d.breakEven.merchantsNeeded} comercios`,
      hint:
        gap === null
          ? undefined
          : gap > 0
            ? `faltan ${gap} a ${soles(d.breakEven.ticketPen)}`
            : "alcanzado",
      tone: gap !== null && gap > 0 ? "warn" : "ok",
    },
  ]
  const statsPartner: Stat[] = [
    {
      label: "Saldo del préstamo",
      value: soles(loanBalancePen),
      hint: d.loans.length === 0 ? "sin préstamo" : `${remaining} cuotas`,
    },
    {
      label: "Puesto por el socio",
      value: soles(d.recovery.invested),
      hint: "aportes + meses cubiertos",
    },
    {
      label: "Pendiente de recuperar",
      value: soles(d.recovery.outstanding),
      hint:
        d.recovery.returned > 0
          ? `${soles(d.recovery.returned)} devueltos`
          : d.recovery.invested > 0
            ? `caja ${soles(d.recovery.cashOnHand)}`
            : undefined,
      tone: d.recovery.cashOnHand < 0 ? "bad" : "mute",
    },
    {
      label: "Mes de recupero",
      value: d.recovery.recoveredIn ? monthLabel(d.recovery.recoveredIn) : "Aún no",
      hint: d.recovery.recoveredIn
        ? d.recovery.projected
          ? "proyectado"
          : "logrado"
        : d.recovery.invested > 0
          ? "ni en la proyección"
          : "sin aportes",
      tone: d.recovery.recoveredIn ? (d.recovery.projected ? "warn" : "ok") : "mute",
    },
  ]

  const chart: ChartPoint[] = d.rows.map((r) => {
    const p = pick(r)
    return {
      month: r.month,
      label: monthLabel(r.month, false),
      ingresos: p.income + p.projected,
      salidas: p.cost + r.loanPayments,
      acumulado: p.cumulative,
      projected: r.month > todayMonth,
    }
  })
  const estimatedMonths = d.rows.filter((r) => r.fxEstimated).length

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[
          { label: "Inicio", href: "/admin" },
          { label: "Finanzas", href: "/admin/finanzas" },
          { label: "Tablero" },
        ]}
        title="Tablero"
        subtitle="Cuánto entra, cuánto sale y cuánto falta para que Cuik se pague solo. Soles; los dólares van al tipo de cambio de cada mes. Los meses futuros se proyectan con las condiciones de facturación de cada comercio, los costos fijos y las cuotas."
        actions={
          <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
            <a href={`/api/admin/finance/ledger?${query}${query ? "&" : ""}format=xlsx`}>
              <Download className="w-3.5 h-3.5" />
              Exportar Excel
            </a>
          </Button>
        }
      />

      {!hasAnything && (
        <Notice tone="info">
          Todavía no hay nada que mostrar. Carga en Costos e ingresos el tipo de cambio, los costos
          fijos, el préstamo y el aporte inicial, y configura la facturación de cada comercio en su
          ficha: el tablero se arma solo con eso.
        </Notice>
      )}
      {d.fx.estimated && (
        <Notice tone="warn">
          No hay tipo de cambio para {monthLabel(todayMonth)}: los dólares se convierten a{" "}
          {d.fx.rate.toFixed(2)} hasta que lo cargues en Finanzas › Tipo de cambio.
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}

      <Panel>
        <Toolbar className="border-b-0">
          <div className="flex items-center gap-1 rounded-md border border-ent-line p-0.5">
            {(["cash", "accrual"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "h-7 px-2.5 rounded-[3px] text-[12.5px]",
                  view === v ? "bg-ent-fg text-white" : "text-ent-fg-2 hover:bg-ent-panel-2",
                )}
                aria-pressed={view === v}
              >
                {v === "cash" ? "Caja" : "Devengado"}
              </button>
            ))}
          </div>
          <span className="text-[11.5px] text-ent-fg-3 hidden md:inline">
            {isCash
              ? "Caja: el dinero en el mes en que se mueve."
              : "Devengado: cada pago repartido en los meses que cubre."}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Label className="text-[11.5px] text-ent-fg-3">Desde</Label>
            <Input
              type="month"
              value={fromDraft}
              onChange={(e) => {
                setFromDraft(e.target.value)
                applyMonth(setFrom)(e.target.value)
              }}
              className="h-8 w-[150px] text-[12.5px]"
            />
            <Label className="text-[11.5px] text-ent-fg-3">Hasta</Label>
            <Input
              type="month"
              value={toDraft}
              onChange={(e) => {
                setToDraft(e.target.value)
                applyMonth(setTo)(e.target.value)
              }}
              className="h-8 w-[150px] text-[12.5px]"
            />
            <Label className="text-[11.5px] text-ent-fg-3">Ticket S/</Label>
            <Input
              type="number"
              min={1}
              step="1"
              placeholder={String(d.breakEven.ticketPen)}
              value={ticketDraft}
              onChange={(e) => setTicketDraft(e.target.value)}
              onBlur={() => setTicket(ticketDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setTicket(ticketDraft)
              }}
              className="h-8 w-[88px] text-[12.5px]"
              title="Ticket promedio por comercio para el punto de equilibrio"
            />
            {(from || to || ticket) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[12px] text-ent-fg-3"
                onClick={reset}
              >
                Restablecer
              </Button>
            )}
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-ent-fg-3" />}
          </div>
        </Toolbar>
      </Panel>

      <StatStrip stats={statsMonth} />
      <StatStrip stats={statsPartner} />

      <Panel>
        <PanelHeader
          title={`Ingresos y salidas por mes · ${isCash ? "caja" : "devengado"}`}
          actions={
            <span className="text-[11.5px] text-ent-fg-3 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <i
                  className="inline-block w-2.5 h-2.5 rounded-[2px]"
                  style={{ background: BLUE }}
                />
                Ingresos
              </span>
              <span className="flex items-center gap-1">
                <i
                  className="inline-block w-2.5 h-2.5 rounded-[2px]"
                  style={{ background: ORANGE }}
                />
                Salidas
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block w-3 h-[2px]" style={{ background: INK }} />
                Acumulado
              </span>
              <span className="hidden sm:inline">Claro = proyectado</span>
            </span>
          }
        />
        <div className="px-2 pt-3 pb-1">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-ent-fg-3)" }}
                axisLine={false}
                tickLine={false}
                interval={chart.length > 18 ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-ent-fg-3)" }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) => v.toLocaleString("es-PE")}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-ent-panel-2)" }} />
              <ReferenceLine y={0} stroke="var(--color-ent-line-strong)" />
              <Bar dataKey="ingresos" fill={BLUE} radius={[2, 2, 0, 0]} maxBarSize={22}>
                {chart.map((p) => (
                  <Cell key={p.month} fillOpacity={p.projected ? 0.4 : 1} />
                ))}
              </Bar>
              <Bar dataKey="salidas" fill={ORANGE} radius={[2, 2, 0, 0]} maxBarSize={22}>
                {chart.map((p) => (
                  <Cell key={p.month} fillOpacity={p.projected ? 0.4 : 1} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="acumulado"
                stroke={INK}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Panel className="overflow-x-auto">
          <PanelHeader
            title="Mes a mes"
            actions={
              estimatedMonths > 0 ? (
                <span className="text-[11.5px] text-ent-fg-3">
                  TC est. = mes sin tipo de cambio cargado
                </span>
              ) : undefined
            }
          />
          <DataTable>
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th className="text-right">Ingresos</Th>
                <Th className="text-right">Costos</Th>
                <Th className="text-right">Cuotas</Th>
                <Th className="text-right">Neto</Th>
                <Th className="text-right">Acumulado</Th>
                <Th className="text-right">Pone el socio</Th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => {
                const p = pick(r)
                const future = r.month > todayMonth
                const isNow = r.month === todayMonth
                return (
                  <Tr
                    key={r.month}
                    className={cn(future && "text-ent-fg-3", isNow && "bg-ent-panel-2")}
                  >
                    <Td className="whitespace-nowrap">
                      <span className={cn(isNow && "font-semibold text-ent-fg")}>
                        {monthLabel(r.month)}
                      </span>
                      {future && <span className="ml-1.5 text-[10.5px] uppercase">proy.</span>}
                      {r.fxEstimated && (
                        <span className="ml-1.5 text-[10.5px] text-ent-warn">TC est.</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {soles(p.income + p.projected)}
                      {p.projected > 0 && !future && (
                        <span className="ml-1 text-[10.5px] text-ent-fg-3">
                          {soles(p.projected)} por facturar
                        </span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{soles(p.cost)}</Td>
                    <Td className="text-right tabular-nums">{soles(r.loanPayments)}</Td>
                    <Td
                      className={cn(
                        "text-right tabular-nums font-medium",
                        p.net < 0 ? "text-ent-bad" : "text-ent-ok",
                      )}
                    >
                      {soles(p.net, { sign: true })}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {soles(p.cumulative, { sign: true })}
                    </Td>
                    <Td className="text-right tabular-nums whitespace-nowrap">
                      {r.contributions > 0 ? soles(r.contributions) : ""}
                      {r.autoContribution > 0 && (
                        <span className={cn(r.contributions > 0 && "ml-1")}>
                          {soles(r.autoContribution)}
                          <span className="ml-1 text-[10.5px] text-ent-fg-3">auto</span>
                        </span>
                      )}
                      {r.returns > 0 && (
                        <span className="ml-1 text-[10.5px]">−{soles(r.returns)} dev.</span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-ent-line-strong font-medium">
                <Td>Hasta hoy</Td>
                <Td className="text-right tabular-nums">
                  {soles(
                    (isCash ? d.totals.toDate.incomeCash : d.totals.toDate.incomeAccrual) +
                      (isCash ? d.totals.toDate.projectedCash : d.totals.toDate.projectedAccrual),
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  {soles(isCash ? d.totals.toDate.costCash : d.totals.toDate.costAccrual)}
                </Td>
                <Td className="text-right tabular-nums">{soles(d.totals.toDate.loanPayments)}</Td>
                <Td className="text-right tabular-nums">
                  {soles(isCash ? d.totals.toDate.netCash : d.totals.toDate.netAccrual, {
                    sign: true,
                  })}
                </Td>
                <Td />
                <Td className="text-right tabular-nums">
                  {soles(d.totals.toDate.contributions + d.totals.toDate.autoContribution)}
                </Td>
              </tr>
              <tr className="text-ent-fg-3">
                <Td>Proyección</Td>
                <Td className="text-right tabular-nums">
                  {soles(
                    (isCash ? d.totals.projected.incomeCash : d.totals.projected.incomeAccrual) +
                      (isCash
                        ? d.totals.projected.projectedCash
                        : d.totals.projected.projectedAccrual),
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  {soles(isCash ? d.totals.projected.costCash : d.totals.projected.costAccrual)}
                </Td>
                <Td className="text-right tabular-nums">
                  {soles(d.totals.projected.loanPayments)}
                </Td>
                <Td className="text-right tabular-nums">
                  {soles(isCash ? d.totals.projected.netCash : d.totals.projected.netAccrual, {
                    sign: true,
                  })}
                </Td>
                <Td />
                <Td />
              </tr>
            </tfoot>
          </DataTable>
        </Panel>

        <div className="space-y-3">
          <Panel>
            <PanelHeader title="Comercios que pagan" />
            {d.merchants.list.length === 0 ? (
              <PanelMessage>
                Ningún comercio tiene monto e inicio de servicio en su ficha de facturación.
              </PanelMessage>
            ) : (
              <DataTable>
                <tbody>
                  {d.merchants.list.map((m) => (
                    <Tr key={m.name}>
                      <Td>
                        <div className="truncate">{m.name}</div>
                        <div className="text-[11px] text-ent-fg-3">
                          {m.startMonth > todayMonth
                            ? `desde ${monthLabel(m.startMonth)}`
                            : m.status === "trial"
                              ? "en demo"
                              : "activo"}
                        </div>
                      </Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">
                        {soles(m.monthlyPen)}
                        <span className="text-ent-fg-3 text-[11px]"> /mes</span>
                      </Td>
                    </Tr>
                  ))}
                  <tr className="border-t border-ent-line-strong font-medium">
                    <Td>Total mensual</Td>
                    <Td className="text-right tabular-nums">
                      {soles(d.merchants.expectedMonthlyPen)}
                    </Td>
                  </tr>
                </tbody>
              </DataTable>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Punto de equilibrio" />
            <div className="px-3 py-2.5 text-[12.5px] text-ent-fg-2 space-y-1.5">
              <div className="flex justify-between gap-2">
                <span>Salida mensual a cubrir</span>
                <span className="tabular-nums text-ent-fg">{soles(d.breakEven.outflowPen)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Ticket por comercio</span>
                <span className="tabular-nums text-ent-fg">
                  {soles(d.breakEven.ticketPen)}
                  <span className="text-ent-fg-3 text-[11px]">
                    {" "}
                    {d.breakEven.ticketIsDefault ? "promedio" : "manual"}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Comercios necesarios</span>
                <span className="tabular-nums text-ent-fg">
                  {d.breakEven.merchantsNeeded ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span>Hoy</span>
                <StatusChip tone={gap !== null && gap > 0 ? "warn" : "ok"}>
                  {d.merchants.paying} {d.merchants.paying === 1 ? "comercio" : "comercios"}
                </StatusChip>
              </div>
              <p className="text-[11.5px] text-ent-fg-3 pt-1">
                Costos fijos del mes repartidos más las cuotas del préstamo, divididos por el
                ticket. Cambia el ticket arriba para simular otro plan.
              </p>
            </div>
          </Panel>

          {d.loans.length > 0 && (
            <Panel>
              <PanelHeader title="Préstamo" />
              <DataTable>
                <tbody>
                  {d.loans.map((l) => (
                    <Tr key={l.id}>
                      <Td>
                        <div className="truncate">{l.name}</div>
                        <div className="text-[11px] text-ent-fg-3">
                          {l.remaining} cuotas · última {monthLabel(l.lastMonth)}
                        </div>
                      </Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">
                        <div>{soles(l.balancePen)}</div>
                        {l.currency === "USD" && (
                          <div className="text-[11px] text-ent-fg-3">
                            US$ {l.balance.toLocaleString("es-PE")}
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
