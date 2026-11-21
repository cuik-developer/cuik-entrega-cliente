"use client"

import { Download, Loader2, Save } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  type ChipTone,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SEGMENT_LABELS } from "@/lib/loyalty/client-segments"
import { fmtDay, fmtMonth, pctText, soles } from "@/lib/loyalty/impact/format"
import {
  KIND_LABEL,
  ORIGIN_LABEL,
  ORIGIN_NOTE,
  VERDICT_LABEL,
} from "@/lib/loyalty/loyalty-impact/labels"
import {
  type CampaignImpact,
  type CampaignVerdict,
  concludeImpact,
  type LoyaltyImpact,
  WINDOW_MAX,
  WINDOW_MIN,
} from "@/lib/loyalty/loyalty-impact/metrics"
import type {
  CampaignClientsView,
  ImpactSettings,
  LoyaltyImpactView,
} from "@/lib/loyalty/loyalty-impact/store"

type TenantOption = { id: string; name: string }

const FUNNEL_LABEL: Record<LoyaltyImpact["funnel"][number]["step"], string> = {
  registered: "Sacaron su tarjeta",
  first: "Compraron con la tarjeta",
  second: "Volvieron (2 días de compra o más)",
  third: "3 días de compra o más",
  fifth: "5 días de compra o más",
  card: "Completaron una tarjeta",
}

const VERDICT_TONE: Record<CampaignVerdict, ChipTone> = {
  above: "ok",
  within: "mute",
  below: "warn",
  running: "info",
  empty: "mute",
  overlap: "mute",
  no_reference: "mute",
}

/** Verdicts that are a judgement; the others say why there is none. */
const JUDGED = new Set<CampaignVerdict>(["above", "within", "below"])
const CAMPAIGN_ROWS = 80

const NUMBER_INPUT =
  "h-8 w-[78px] rounded-[4px] border border-ent-line-strong bg-ent-panel px-2 text-right text-[12.5px] text-ent-fg tabular-nums"
const FIELD_LABEL = "block text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 mb-1"

const num = (n: number) => n.toLocaleString("es-PE")
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("es-PE")}`
const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
const clamp = (raw: string, min: number, max: number, fallback: number) => {
  const n = Number(raw)
  return raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function LoyaltyImpactClient({ tenants }: { tenants: TenantOption[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "")
  // null = let the server pick the saved window, or the one that fits the tenant.
  const [windowDays, setWindowDays] = useState<number | null>(null)
  const [windowText, setWindowText] = useState("")
  const [view, setView] = useState<LoyaltyImpactView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const query = windowDays === null ? "" : `&window=${windowDays}`
    fetch(`/api/admin/loyalty-impact?tenantId=${tenantId}${query}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json.success) {
          const data = json.data as LoyaltyImpactView
          setView(data)
          // Only on a fresh load: while a window is being typed, the box is the user's.
          if (windowDays === null) setWindowText(String(data.impact.windowDays))
        } else setError(json.error ?? "No se pudo calcular")
      })
      .catch(() => {
        if (!cancelled) setError("Error de conexión")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, windowDays])

  // Typing a window recalculates once the number settles.
  useEffect(() => {
    if (!view || windowText.trim() === "") return
    const typed = Math.round(clamp(windowText, WINDOW_MIN, WINDOW_MAX, view.impact.windowDays))
    if (typed === view.impact.windowDays) return
    const timer = setTimeout(() => setWindowDays(typed), 600)
    return () => clearTimeout(timer)
  }, [windowText, view])

  function changeTenant(id: string) {
    setView(null)
    setWindowDays(null)
    setWindowText("")
    setTenantId(id)
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Impacto Loyalty" }]}
        title="Impacto Loyalty"
        subtitle="Lo que el programa de un comercio generó, solo con los datos de Cuik. Histórico completo."
        actions={
          <>
            <Select value={tenantId} onValueChange={changeTenant}>
              <SelectTrigger className="h-8 w-[220px] text-[12.5px]" aria-label="Comercio">
                <SelectValue placeholder="Comercio" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ent-fg-2">
              Plazo para volver
              <input
                id="impact-window"
                type="number"
                min={WINDOW_MIN}
                max={WINDOW_MAX}
                step={1}
                value={windowText}
                onChange={(e) => setWindowText(e.target.value)}
                onBlur={() => view && setWindowText(String(view.impact.windowDays))}
                disabled={!view}
                className={NUMBER_INPUT}
              />
              días
            </label>
          </>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}
      {!tenantId && (
        <Panel>
          <PanelMessage>Todavía no hay comercios.</PanelMessage>
        </Panel>
      )}
      {loading && !view && (
        <Panel>
          <PanelMessage>
            <Loader2 className="w-4 h-4 animate-spin" />
            Calculando…
          </PanelMessage>
        </Panel>
      )}

      {view && (
        <Report
          key={view.tenant.id}
          view={view}
          dimmed={loading}
          onUseSuggested={() => setWindowText(String(view.impact.suggestedWindowDays))}
        />
      )}
    </div>
  )
}

function Report({
  view,
  dimmed,
  onUseSuggested,
}: {
  view: LoyaltyImpactView
  dimmed: boolean
  onUseSuggested: () => void
}) {
  const { impact } = view
  const { headline: h, base, quality: q } = impact

  if (h.registered === 0) {
    return (
      <Panel>
        <PanelMessage>Este comercio todavía no tiene clientes con tarjeta.</PanelMessage>
      </Panel>
    )
  }

  return (
    <div className={dimmed ? "space-y-3 opacity-60" : "space-y-3"}>
      <Notice
        tone="info"
        action={
          impact.suggestedWindowDays !== impact.windowDays ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[12px]"
              onClick={onUseSuggested}
            >
              Usar {impact.suggestedWindowDays} días
            </Button>
          ) : undefined
        }
      >
        Todo sale de lo que el cajero registra en Cuik
        {impact.period.from
          ? `, del ${fmtDay(impact.period.from)} al ${fmtDay(impact.period.to)}`
          : ""}
        . Una compra sin sello no existe aquí, así que estas cifras son un piso.
        {impact.medianGapDays !== null &&
          ` Sus clientes vuelven cada ${impact.medianGapDays} días; el plazo sugerido es ${impact.suggestedWindowDays}.`}
      </Notice>

      <Conclusion view={view} />
      <Returning impact={impact} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Embudo de la tarjeta" />
          <DataTable>
            <thead>
              <tr>
                <Th>Paso</Th>
                <Th align="right">Clientes</Th>
                <Th align="right">Del paso anterior</Th>
                <Th align="right">Del total</Th>
              </tr>
            </thead>
            <tbody>
              {impact.funnel.map((f, i) => {
                const previous = i === 0 ? null : (impact.funnel[i - 1]?.clients ?? null)
                return (
                  <Tr key={f.step}>
                    <Td>{FUNNEL_LABEL[f.step]}</Td>
                    <Td align="right">{num(f.clients)}</Td>
                    <Td align="right">
                      {previous === null ? "—" : pctText(percent(f.clients, previous))}
                    </Td>
                    <Td align="right">{pctText(percent(f.clients, h.registered))}</Td>
                  </Tr>
                )
              })}
            </tbody>
          </DataTable>
        </Panel>
        <MonthBars months={impact.months} />
      </div>

      <Panel>
        <PanelHeader title="Mes a mes" />
        <DataTable>
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th align="right">Tarjetas nuevas</Th>
              <Th align="right">Clientes que compraron</Th>
              <Th align="right">Primeras compras</Th>
              <Th align="right">Compras de regreso</Th>
              <Th align="right">Ventas con tarjeta</Th>
              <Th align="right">De regreso</Th>
              <Th align="right">% de regreso</Th>
            </tr>
          </thead>
          <tbody>
            {[...impact.months].reverse().map((m) => (
              <Tr key={m.month}>
                <Td>{fmtMonth(m.month)}</Td>
                <Td align="right">{num(m.newClients)}</Td>
                <Td align="right">{num(m.buyers)}</Td>
                <Td align="right">{num(m.firstVisits)}</Td>
                <Td align="right">{num(m.returnVisits)}</Td>
                <Td align="right">{soles(m.sales)}</Td>
                <Td align="right">{soles(m.returnSales)}</Td>
                <Td align="right">{pctText(m.returnSharePct)}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <Kinds impact={impact} />
      <Campaigns tenantId={view.tenant.id} impact={impact} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Retorno natural"
            actions={
              <span className="text-[11.5px] text-ent-fg-3">Lo normal en este comercio</span>
            }
          />
          <DataTable>
            <thead>
              <tr>
                <Th>Llevaban sin venir</Th>
                <Th align="right">Veces que pasó</Th>
                <Th align="right">Volvieron en los {impact.windowDays} días siguientes</Th>
                <Th align="right">%</Th>
              </tr>
            </thead>
            <tbody>
              {impact.naturalReturn.map((n) => (
                <Tr key={n.silenceDays}>
                  <Td>{n.silenceDays} días</Td>
                  <Td align="right">{num(n.times)}</Td>
                  <Td align="right">{num(n.back)}</Td>
                  <Td align="right">{pctText(n.backPct)}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
          <div className="px-3 py-2 border-t border-ent-line text-[12px] text-ent-fg-3 leading-snug">
            Ejemplo: un cliente compra el 1 de marzo y el 15 de abril cumple 45 días sin venir.
            Desde ahí se cuentan {impact.windowDays} días más: si compra en ese plazo, volvió.
            Incluye los días en que hubo campañas: es lo que pasa normalmente aquí, y la vara de una
            campaña de recuperación.
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Calidad del dato" />
          <div className="px-3 py-1">
            <FieldList
              rows={[
                { label: "Compras registradas", value: num(q.purchases) },
                {
                  label: "Sellos de bienvenida",
                  value:
                    q.bonusStamps === 0
                      ? "Ninguno"
                      : `${num(q.bonusStamps)}, fuera de compras y ventas`,
                },
                {
                  label: "Con monto de compra",
                  value: `${num(q.withAmount)} (${pctText(q.amountCoveragePct)})`,
                },
                {
                  label: "Montos descartados",
                  value:
                    q.outliers === 0
                      ? "Ninguno"
                      : `${num(q.outliers)} por ${soles(q.outliersTotal)}: más de ${soles(q.outlierThreshold)}, parecen error de digitación`,
                },
                {
                  label: "Clientes activos",
                  value: `${num(base.active30)} en 30 días · ${num(base.active60)} en 60 · ${num(base.active90)} en 90`,
                },
                { label: "Más de 90 días sin venir", value: num(base.silent90plus) },
                { label: "Con tarjeta y sin ninguna compra", value: num(base.neverBought) },
                {
                  label: "Mensajes este mes",
                  value: `${num(impact.pressure.one)} clientes con 1 · ${num(impact.pressure.twoOrThree)} con 2 a 3 · ${num(impact.pressure.fourPlus)} con 4 o más`,
                },
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}

/** The answer in soles, with the assumptions next to it so they can be moved. */
function Conclusion({ view }: { view: LoyaltyImpactView }) {
  const { impact } = view
  const [saved, setSaved] = useState<ImpactSettings>(view.settings)
  const [factor, setFactor] = useState(String(view.settings.factorPct))
  const [margin, setMargin] = useState(String(view.settings.marginPct))
  const [fee, setFee] = useState(String(view.settings.monthlyFee))
  const [origin, setOrigin] = useState(view.settings.factorOrigin)
  const [neverSaved, setNeverSaved] = useState(view.settingsAreDefault)
  const [saving, setSaving] = useState(false)

  const current: ImpactSettings = {
    factorPct: clamp(factor, 0, 100, saved.factorPct),
    factorOrigin: origin,
    marginPct: clamp(margin, 0, 100, saved.marginPct),
    monthlyFee: clamp(fee, 0, 1_000_000, saved.monthlyFee),
    windowDays: impact.windowDays,
  }
  const c = concludeImpact(impact, current)
  const dirty =
    neverSaved ||
    current.factorPct !== saved.factorPct ||
    current.factorOrigin !== saved.factorOrigin ||
    current.marginPct !== saved.marginPct ||
    current.monthlyFee !== saved.monthlyFee ||
    current.windowDays !== saved.windowDays

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/loyalty-impact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: view.tenant.id, settings: current }),
      })
      const json = await res.json()
      if (json.success) {
        setSaved(current)
        setNeverSaved(false)
        toast.success("Supuestos guardados para este comercio")
      } else toast.error(json.error ?? "No se pudo guardar")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setSaving(false)
    }
  }

  const months = impact.period.months
  return (
    <Panel>
      <PanelHeader
        title="Conclusión"
        actions={
          <Button
            size="sm"
            className="h-7 text-[12px] gap-1.5"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar supuestos
          </Button>
        }
      />
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <label htmlFor="impact-factor" className={FIELD_LABEL}>
              Venta de regreso que no habría ocurrido sin la tarjeta
            </label>
            <input
              id="impact-factor"
              type="number"
              min={0}
              max={100}
              step={1}
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className={NUMBER_INPUT}
            />
            <span className="ml-1.5 text-[12.5px] text-ent-fg-3">%</span>
          </div>
          <div>
            <span className={FIELD_LABEL}>Origen del porcentaje</span>
            <Select value={origin} onValueChange={(v) => setOrigin(v as typeof origin)}>
              <SelectTrigger
                className="h-8 w-[230px] text-[12.5px]"
                aria-label="Origen del porcentaje"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reference">{ORIGIN_LABEL.reference}</SelectItem>
                <SelectItem value="measured">{ORIGIN_LABEL.measured}</SelectItem>
                {/* Needs the sign-up question about how often they came before; not built yet. */}
                <SelectItem value="declared" disabled={origin !== "declared"}>
                  {ORIGIN_LABEL.declared} (aún no disponible)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="impact-margin" className={FIELD_LABEL}>
              Margen promedio del comercio
            </label>
            <input
              id="impact-margin"
              type="number"
              min={0}
              max={100}
              step={1}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className={NUMBER_INPUT}
            />
            <span className="ml-1.5 text-[12.5px] text-ent-fg-3">%</span>
          </div>
          <div>
            <label htmlFor="impact-fee" className={FIELD_LABEL}>
              Cuota mensual de Cuik
            </label>
            <span className="mr-1.5 text-[12.5px] text-ent-fg-3">S/</span>
            <input
              id="impact-fee"
              type="number"
              min={0}
              step={10}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={NUMBER_INPUT}
            />
          </div>
        </div>

        <p className="text-[14px] leading-relaxed text-ent-fg max-w-[78ch]">
          En {months} {months === 1 ? "mes" : "meses"}, {num(impact.headline.buyers)} clientes
          compraron {soles(impact.headline.sales)} con la tarjeta. Estimamos que entre{" "}
          {soles(c.low)} y {soles(c.high)} de esa venta no habría ocurrido sin el programa. El punto
          medio son {soles(c.generated)}, unas {num(c.purchases)} compras.
          {c.paid > 0 &&
            ` Con una cuota de ${soles(current.monthlyFee)} al mes son ${soles(c.paid)} en ese tiempo: cada sol devolvió S/ ${c.salesPerSol} en venta y S/ ${c.profitPerSol} en utilidad.`}
        </p>
      </div>

      <StatStrip
        className="border-0 border-t rounded-none"
        stats={[
          {
            label: "Venta registrada con tarjeta",
            value: soles(impact.headline.sales),
            hint: `${num(impact.headline.buyers)} clientes`,
          },
          {
            label: "Venta generada, estimada",
            value: soles(c.generated),
            hint: `entre ${soles(c.low)} y ${soles(c.high)}`,
            tone: "ok",
          },
          { label: "Compras generadas", value: num(c.purchases) },
          {
            label: "Utilidad de referencia",
            value: soles(c.profit),
            hint: `margen ${current.marginPct} %`,
          },
        ]}
      />
      <StatStrip
        className="border-0 border-t rounded-none"
        stats={[
          { label: "Por el programa", value: soles(c.fromProgram), hint: "supuesto" },
          {
            label: "Por campañas",
            value: soles(c.fromCampaigns),
            hint: `medido en ${impact.campaignTotals.kindsAbove} de ${impact.campaignTotals.kindsMeasured} tipos`,
          },
          { label: "Pagado a Cuik", value: soles(c.paid), hint: `${months} meses` },
          {
            label: "Retorno por cada sol",
            value: c.salesPerSol === null ? "—" : `S/ ${c.salesPerSol}`,
            hint: c.profitPerSol === null ? undefined : `S/ ${c.profitPerSol} en utilidad`,
          },
        ]}
      />
      <div className="px-3 py-2 border-t border-ent-line text-[12px] text-ent-fg-3 leading-snug">
        {ORIGIN_NOTE[origin]} El rango va de la mitad a una vez y media de ese porcentaje. Lo de
        campañas no depende del supuesto: se mide contra clientes comparables y solo suma cuando un
        tipo de envío, con todos sus envíos juntos, supera el azar.
        {current.monthlyFee === 0 && " Escribe la cuota mensual para ver el retorno."}
      </div>
    </Panel>
  )
}

/** "Came back at least X times": the X is typed and everything follows. */
function Returning({ impact }: { impact: LoyaltyImpact }) {
  const [text, setText] = useState("1")
  const times = Math.round(clamp(text, 1, 999, 1))
  const { headline: h, byVisitDays } = impact
  const totals = useMemo(() => {
    const rows = byVisitDays.filter((b) => b.visitDays >= times + 1)
    const add = (key: "clients" | "purchases" | "sales" | "returnSales") =>
      rows.reduce((a, r) => a + r[key], 0)
    return {
      clients: add("clients"),
      purchases: add("purchases"),
      sales: add("sales"),
      returnSales: add("returnSales"),
    }
  }, [byVisitDays, times])

  return (
    <Panel>
      <PanelHeader
        title="Clientes que volvieron"
        actions={
          <label className="flex items-center gap-1.5 text-[12.5px] text-ent-fg-2">
            Volvieron al menos
            <input
              id="impact-times"
              type="number"
              min={1}
              step={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={NUMBER_INPUT}
            />
            {times === 1 ? "vez" : "veces"}
          </label>
        }
      />
      <StatStrip
        className="border-0 rounded-none"
        stats={[
          {
            label: "Clientes",
            value: num(totals.clients),
            hint: `${pctText(percent(totals.clients, h.buyers))} de los que compraron`,
          },
          { label: "Compras", value: num(totals.purchases) },
          {
            label: "Venta de esos clientes",
            value: soles(totals.sales),
            hint: `${pctText(percent(totals.sales, h.sales))} de la venta`,
          },
          { label: "De sus visitas de regreso", value: soles(totals.returnSales) },
        ]}
      />
      <StatStrip
        className="border-0 border-t rounded-none"
        stats={[
          {
            label: "Gasto por cliente",
            value: totals.clients ? soles(totals.sales / totals.clients) : "—",
          },
          {
            label: "Ticket",
            value: totals.purchases ? soles(totals.sales / totals.purchases) : "—",
          },
          {
            label: "Ticket típico del comercio",
            value: h.medianTicket === null ? "—" : soles(h.medianTicket),
          },
          { label: "Con tarjeta en total", value: num(h.registered) },
        ]}
      />
      <div className="border-t border-ent-line">
        <DataTable>
          <thead>
            <tr>
              <Th>Veces que volvió</Th>
              <Th align="right">Clientes</Th>
              <Th align="right">Compras</Th>
              <Th align="right">Venta</Th>
              <Th align="right">Venta de regreso</Th>
              <Th align="right">Gasto por cliente</Th>
            </tr>
          </thead>
          <tbody>
            {byVisitDays.map((b) => {
              const back = b.visitDays - 1
              return (
                <Tr key={b.visitDays} className={back >= times ? "bg-ent-accent-soft" : undefined}>
                  <Td>{back === 0 ? "No volvió" : `${back} ${back === 1 ? "vez" : "veces"}`}</Td>
                  <Td align="right">{num(b.clients)}</Td>
                  <Td align="right">{num(b.purchases)}</Td>
                  <Td align="right">{soles(b.sales)}</Td>
                  <Td align="right">{b.returnSales ? soles(b.returnSales) : "—"}</Td>
                  <Td align="right">{soles(b.sales / b.clients)}</Td>
                </Tr>
              )
            })}
          </tbody>
        </DataTable>
      </div>
      <div className="px-3 py-2 border-t border-ent-line text-[12px] text-ent-fg-3">
        Las filas resaltadas entran en el filtro. "Volvió 1 vez" es un cliente con 2 días de compra.
      </div>
    </Panel>
  )
}

function MonthBars({ months }: { months: LoyaltyImpact["months"] }) {
  const shown = months.slice(-12)
  const max = Math.max(1, ...shown.map((m) => m.sales))
  return (
    <Panel>
      <PanelHeader
        title="Ventas con tarjeta por mes"
        actions={
          <span className="flex items-center gap-3 text-[11.5px] text-ent-fg-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-ent-line-strong" />
              Primera compra
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-ent-accent" />
              De regreso
            </span>
          </span>
        }
      />
      <div className="flex items-end gap-2 h-[150px] px-3 pt-3">
        {shown.map((m) => (
          <div
            key={m.month}
            className="flex-1 min-w-0 h-full flex flex-col justify-end"
            title={`${fmtMonth(m.month)}: ${soles(m.sales)}, de regreso ${soles(m.returnSales)}`}
          >
            <div
              className="bg-ent-line-strong rounded-t-[2px]"
              style={{ height: `${((m.sales - m.returnSales) / max) * 100}%` }}
            />
            <div className="bg-ent-accent" style={{ height: `${(m.returnSales / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-3 pt-1 pb-3 text-[11px] text-ent-fg-3">
        {shown.map((m) => (
          <span key={m.month} className="flex-1 min-w-0 text-center truncate">
            {fmtMonth(m.month)}
          </span>
        ))}
      </div>
    </Panel>
  )
}

function Kinds({ impact }: { impact: LoyaltyImpact }) {
  return (
    <Panel>
      <PanelHeader
        title="Comunicaciones por tipo"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            Volvieron dentro del plazo, contra clientes del mismo segmento que no recibieron ningún
            envío
          </span>
        }
      />
      {impact.byKind.length === 0 ? (
        <PanelMessage>Este comercio todavía no ha enviado campañas.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th align="right">Envíos medidos</Th>
              <Th align="right">Clientes</Th>
              <Th align="right">Volvieron</Th>
              <Th align="right">Sin envío habrían vuelto</Th>
              <Th align="right">Diferencia</Th>
              <Th align="right">Venta extra</Th>
              <Th>Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {impact.byKind.map((k) => (
              <Tr key={k.kind}>
                <Td>{KIND_LABEL[k.kind]}</Td>
                <Td align="right">
                  {num(k.measured)} de {num(k.campaigns)}
                </Td>
                <Td align="right">{num(k.recipients)}</Td>
                <Td align="right">{num(k.returned)}</Td>
                <Td align="right">{num(k.expected)}</Td>
                <Td align="right">{signed(k.extraClients)}</Td>
                <Td align="right">{k.extraSales > 0 ? soles(k.extraSales) : "—"}</Td>
                <Td>
                  <StatusChip tone={VERDICT_TONE[k.verdict]}>
                    {VERDICT_LABEL[k.verdict]}
                    {JUDGED.has(k.verdict) && !k.reliable ? " · orientativo" : ""}
                  </StatusChip>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <div className="px-3 py-2 border-t border-ent-line text-[12px] text-ent-fg-3 leading-snug">
        Cada tipo junta todos sus envíos medibles, los que salieron bien y los que no. Si un cliente
        recibió varios mensajes antes de comprar, la compra cuenta solo para el último. Un envío no
        se mide cuando fue a todos los clientes comparables o cuando más de 1 de cada 5
        destinatarios recibió otro mensaje dentro del plazo. Con menos de 30 clientes el resultado
        es orientativo y no suma a la conclusión.
      </div>
    </Panel>
  )
}

function Campaigns({ tenantId, impact }: { tenantId: string; impact: LoyaltyImpact }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Panel>
      <PanelHeader
        title="Campañas"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            {impact.campaigns.length > CAMPAIGN_ROWS
              ? `Últimos ${CAMPAIGN_ROWS} de ${num(impact.campaigns.length)} envíos. `
              : ""}
            Abre una fila para ver la foto del día del envío
          </span>
        }
      />
      {impact.campaigns.length === 0 ? (
        <PanelMessage>Este comercio todavía no ha enviado campañas.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Campaña</Th>
              <Th>Tipo</Th>
              <Th align="right">Llegó a</Th>
              <Th align="right">Volvieron</Th>
              <Th align="right">Sin envío</Th>
              <Th align="right">Compraron</Th>
              <Th align="right">Venta extra</Th>
              <Th>Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {impact.campaigns.slice(0, CAMPAIGN_ROWS).map((c) => (
              <Fragment key={c.id}>
                <Tr
                  className="cursor-pointer"
                  tabIndex={0}
                  aria-expanded={open === c.id}
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                    setOpen(open === c.id ? null : c.id)
                  }}
                >
                  <Td>{fmtDay(c.sentOn)}</Td>
                  <Td className="max-w-[240px] truncate" title={c.name}>
                    {c.name}
                  </Td>
                  <Td>{KIND_LABEL[c.kind]}</Td>
                  <Td
                    align="right"
                    title={
                      c.handedOver > 0
                        ? `${num(c.handedOver)} recibieron otro mensaje antes de volver: aquí cuentan como que no volvieron`
                        : undefined
                    }
                  >
                    {num(c.recipients)}
                  </Td>
                  <Td align="right">
                    {c.recipients > 0 ? `${num(c.returned)} (${pctText(c.returnedPct)})` : "—"}
                  </Td>
                  <Td align="right" title={`Azar: ± ${num(c.margin)} clientes`}>
                    {c.recipients > 0 ? num(c.expected) : "—"}
                  </Td>
                  <Td align="right">{c.recipients > 0 ? soles(c.salesInWindow) : "—"}</Td>
                  <Td align="right">{c.extraSales === null ? "—" : soles(c.extraSales)}</Td>
                  <Td>
                    <StatusChip tone={VERDICT_TONE[c.verdict]}>
                      {VERDICT_LABEL[c.verdict]}
                      {JUDGED.has(c.verdict) && !c.reliable ? " · orientativo" : ""}
                    </StatusChip>
                  </Td>
                </Tr>
                {open === c.id && (
                  <tr>
                    <td colSpan={9} className="bg-ent-panel-2 border-b border-ent-line p-3">
                      <CampaignDetail
                        tenantId={tenantId}
                        campaign={c}
                        windowDays={impact.windowDays}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

function CampaignDetail({
  tenantId,
  campaign: c,
  windowDays,
}: {
  tenantId: string
  campaign: CampaignImpact
  windowDays: number
}) {
  const [list, setList] = useState<CampaignClientsView | null>(null)
  const [failed, setFailed] = useState(false)
  const url = `/api/admin/loyalty-impact/campaigns/${c.id}?tenantId=${tenantId}&window=${windowDays}`

  useEffect(() => {
    let cancelled = false
    setList(null)
    setFailed(false)
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json.success) setList(json.data)
        else setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const movesFrom = (segment: string) =>
    c.moves
      .filter((m) => m.from === segment)
      .map((m) => `${SEGMENT_LABELS[m.to]}: ${num(m.clients)}`)
      .join(" · ")

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[12.5px] font-semibold text-ent-fg mb-1.5">
          Foto del día del envío: cómo estaba cada cliente el {fmtDay(c.sentOn)}
        </div>
        <Panel>
          <DataTable>
            <thead>
              <tr>
                <Th>Segmento al enviar</Th>
                <Th align="right">Llegó a</Th>
                <Th align="right">Volvieron</Th>
                <Th align="right">Sin envío</Th>
                <Th>Comparado con</Th>
                <Th>Dónde quedaron al cierre del plazo</Th>
              </tr>
            </thead>
            <tbody>
              {c.bySegment.map((s) => (
                <Tr key={s.segment}>
                  <Td>{SEGMENT_LABELS[s.segment]}</Td>
                  <Td align="right">{num(s.recipients)}</Td>
                  <Td align="right">{num(s.returned)}</Td>
                  <Td align="right">{num(s.expected)}</Td>
                  <Td>
                    {s.expectedFrom === "same_day"
                      ? "Clientes iguales sin envío, ese día"
                      : "Historia del comercio, con y sin campañas"}
                  </Td>
                  <Td>
                    {c.windowComplete ? movesFrom(s.segment) || "Ninguno volvió" : "Plazo en curso"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
        {c.handedOver > 0 && (
          <div className="mt-1.5 text-[12px] text-ent-fg-3">
            {num(c.handedOver)} de los {num(c.recipients)} recibieron otro mensaje antes de volver.
            Aquí cuentan como que no volvieron, y su compra queda en el envío posterior.
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-[12.5px] font-semibold text-ent-fg">
            Cliente por cliente
            {list && <span className="font-normal text-ent-fg-3"> · {num(list.rows.length)}</span>}
          </div>
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <a href={`${url}&format=xlsx`}>
              <Download className="w-3.5 h-3.5" />
              Excel
            </a>
          </Button>
        </div>
        <Panel>
          {failed ? (
            <PanelMessage>No se pudo cargar la lista.</PanelMessage>
          ) : !list ? (
            <PanelMessage>
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando clientes…
            </PanelMessage>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Segmento al enviar</Th>
                    <Th align="right">Sin venir ese día</Th>
                    <Th>Volvió</Th>
                    <Th align="right">Compró</Th>
                    <Th>Segmento al cierre</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.slice(0, 300).map((r) => (
                    <Tr key={r.clientId}>
                      <Td>{r.name}</Td>
                      <Td>{SEGMENT_LABELS[r.segmentAtSend]}</Td>
                      <Td align="right">
                        {r.silenceDays === null
                          ? "Nunca había comprado"
                          : `${num(r.silenceDays)} días`}
                      </Td>
                      <Td>
                        {r.handedOver
                          ? "Pasó a un mensaje posterior"
                          : r.returnedOn
                            ? fmtDay(r.returnedOn)
                            : "No volvió"}
                      </Td>
                      <Td align="right">{r.sales > 0 && !r.handedOver ? soles(r.sales) : "—"}</Td>
                      <Td>
                        {r.segmentAtClose === null
                          ? "Plazo en curso"
                          : SEGMENT_LABELS[r.segmentAtClose]}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </Panel>
        {list && list.rows.length > 300 && (
          <div className="mt-1.5 text-[12px] text-ent-fg-3">
            Se muestran 300 de {num(list.rows.length)}. El Excel trae a todos.
          </div>
        )}
      </div>
    </div>
  )
}
