"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatStrip,
  Td,
  Th,
  Toolbar,
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
import { Switch } from "@/components/ui/switch"
import { useTenant } from "@/hooks/use-tenant"
import { fmtMonth, soles } from "@/lib/growth/labels"
import type { PurchaseAnalytics } from "@/lib/pos/purchases"

type Period = "month" | "3m" | "12m" | "all"

function periodRange(p: Period, timezone: string): { from: string; to: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone })
  const [y, m] = today.split("-").map(Number)
  const start = (monthsBack: number) =>
    new Date(Date.UTC(y, m - 1 - monthsBack, 1)).toISOString().slice(0, 10)
  if (p === "month") return { from: `${today.slice(0, 7)}-01`, to: today }
  if (p === "3m") return { from: start(3), to: today }
  if (p === "12m") return { from: start(12), to: today }
  return { from: "all", to: today }
}

const PERIOD_LABEL: Record<Period, string> = {
  month: "Este mes",
  "3m": "Últimos 3 meses",
  "12m": "Últimos 12 meses",
  all: "Todo",
}

const days = (n: number | null) => (n == null ? "—" : `${n} d`)
const pct = (n: number | null) => (n == null ? "—" : `${n} %`)

/**
 * Panel › Análisis › Compras: what the point of sale sells by category,
 * brand and product, how often clients come back for each, and how much of
 * it comes from clients with the card.
 */
export default function ComprasPage() {
  const { tenantSlug, timezone, readOnly, isLoading, error: tenantError } = useTenant()
  const [period, setPeriod] = useState<Period>("3m")
  const [store, setStore] = useState("")
  const [cuikOnly, setCuikOnly] = useState(false)
  const [data, setData] = useState<PurchaseAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { from, to } = periodRange(period, timezone)
  const query = new URLSearchParams({ from, to })
  if (store) query.set("store", store)
  if (cuikOnly) query.set("cuik", "1")

  useEffect(() => {
    if (!tenantSlug) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({ from, to })
    if (store) q.set("store", store)
    if (cuikOnly) q.set("cuik", "1")
    fetch(`/api/${tenantSlug}/purchases?${q}`)
      .then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json() }))
      .then((r) => {
        if (cancelled) return
        if (r.status === 403)
          setError("Solo el dueño o un administrador del comercio puede ver las compras.")
        else if (!r.ok || !r.json.success) setError(r.json.error ?? "No se pudo cargar")
        else setData(r.json.data)
      })
      .catch(() => !cancelled && setError("Error de conexión"))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tenantSlug, from, to, store, cuikOnly])

  if (tenantError) return <Notice tone="bad">{tenantError}</Notice>

  const t = data?.totals
  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Panel", href: "/panel" }, { label: "Compras" }]}
        title="Compras"
        subtitle="Qué vende tu punto de venta por categoría, marca y producto, cada cuánto vuelven tus clientes por cada una y cuánto de la venta viene de clientes con tarjeta."
        actions={
          !readOnly &&
          tenantSlug && (
            <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
              <a href={`/api/${tenantSlug}/purchases?${query}&format=xlsx`}>Exportar compras</a>
            </Button>
          )
        }
      />

      <Panel>
        <Toolbar>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-7 w-[170px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && data.stores.length > 1 && (
            <Select
              value={store || "__all"}
              onValueChange={(v) => setStore(v === "__all" ? "" : v)}
            >
              <SelectTrigger className="h-7 w-[200px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las tiendas</SelectItem>
                {data.stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2 text-[12px] text-ent-fg-2">
            <Switch
              id="cuik-only"
              checked={cuikOnly}
              onCheckedChange={setCuikOnly}
              aria-label="Solo clientes con tarjeta"
            />
            <label htmlFor="cuik-only">Solo clientes con tarjeta</label>
          </div>
          {(loading || isLoading) && <Loader2 className="w-3.5 h-3.5 animate-spin text-ent-fg-3" />}
        </Toolbar>
      </Panel>

      {error && <Notice tone="bad">{error}</Notice>}

      {data && !data.hasData && !error && (
        <Panel>
          <PanelMessage>
            <span>Sin ventas del punto de venta en este periodo.</span>
            <span>
              Las compras llegan con el conector POS; si tu comercio no lo tiene, escríbenos.
            </span>
          </PanelMessage>
        </Panel>
      )}

      {data && t && data.hasData && (
        <>
          <StatStrip
            stats={[
              {
                label: "Ventas",
                value: soles(t.amount),
                hint: `${t.sales.toLocaleString("es-PE")} tickets`,
              },
              {
                label: "Ticket promedio",
                value: soles(t.avgTicket),
                hint: `${t.lines.toLocaleString("es-PE")} líneas`,
              },
              {
                label: "Clientes con tarjeta que compraron",
                value: t.clients.toLocaleString("es-PE"),
                hint: `${t.buyersNoCard.toLocaleString("es-PE")} con documento sin tarjeta · ${t.guestSales.toLocaleString("es-PE")} ventas de invitado`,
              },
              {
                label: "Venta de clientes con tarjeta",
                value: pct(t.cuikAmountShare),
                hint: `${pct(t.cuikSalesShare)} de los tickets`,
                tone: t.cuikAmountShare != null && t.cuikAmountShare < 50 ? "warn" : "ok",
              },
            ]}
          />

          {data.unclassified.lines > 0 && (
            <Notice tone="warn">
              {data.unclassified.lines.toLocaleString("es-PE")} líneas (
              {soles(data.unclassified.amount)}) no tienen categoría: sus productos no están en la
              maestra ni traen categoría del POS. Cuik completa la maestra para que entren al
              análisis.
            </Notice>
          )}

          <Panel>
            <PanelHeader title={`Categorías (${data.categories.length})`} />
            <DataTable>
              <thead>
                <tr>
                  <Th>Categoría</Th>
                  <Th className="text-right">Ventas S/</Th>
                  <Th className="text-right">% total</Th>
                  <Th className="text-right">Tickets</Th>
                  <Th className="text-right">Ticket prom.</Th>
                  <Th className="text-right">Unidades</Th>
                  <Th className="text-right">Clientes tarjeta</Th>
                  <Th className="text-right">Sin tarjeta</Th>
                  <Th className="text-right">Frecuencia</Th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <Tr key={c.key}>
                    <Td className="font-medium">{c.label}</Td>
                    <Td className="text-right tabular-nums">{soles(c.amount)}</Td>
                    <Td className="text-right tabular-nums text-ent-fg-2">{c.share} %</Td>
                    <Td className="text-right tabular-nums">{c.tickets.toLocaleString("es-PE")}</Td>
                    <Td className="text-right tabular-nums">{soles(c.avgTicket)}</Td>
                    <Td className="text-right tabular-nums text-ent-fg-2">
                      {c.qty.toLocaleString("es-PE")}
                    </Td>
                    <Td className="text-right tabular-nums">{c.clients.toLocaleString("es-PE")}</Td>
                    <Td className="text-right tabular-nums text-ent-fg-2">
                      {c.buyersNoCard.toLocaleString("es-PE")}
                    </Td>
                    <Td
                      className="text-right tabular-nums"
                      title={c.frequencySample ? `${c.frequencySample} intervalos` : ""}
                    >
                      {days(c.frequencyDays)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
            <div className="px-3 py-2 text-[11.5px] text-ent-fg-3 border-t border-ent-line">
              Frecuencia: mediana de días entre dos compras de un mismo cliente con tarjeta en esa
              categoría (últimos 12 meses, al menos 3 intervalos). “Sin tarjeta”: documentos
              distintos en caja sin cliente Cuik.
            </div>
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel>
              <PanelHeader title={`Marcas (${data.brands.length})`} />
              <DataTable>
                <thead>
                  <tr>
                    <Th>Marca</Th>
                    <Th className="text-right">Ventas S/</Th>
                    <Th className="text-right">%</Th>
                    <Th className="text-right">Clientes</Th>
                    <Th className="text-right">Frec.</Th>
                    <Th>Donde más vende</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.brands.map((b) => (
                    <Tr key={b.brand}>
                      <Td className="font-medium">{b.brand}</Td>
                      <Td className="text-right tabular-nums">{soles(b.amount)}</Td>
                      <Td className="text-right tabular-nums text-ent-fg-2">{b.share} %</Td>
                      <Td className="text-right tabular-nums">{b.clients}</Td>
                      <Td className="text-right tabular-nums">{days(b.frequencyDays)}</Td>
                      <Td className="text-ent-fg-2">
                        {b.topCategory ?? "—"}
                        {b.topCategoryShare != null && (
                          <span className="text-ent-fg-3"> · {b.topCategoryShare} %</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </Panel>

            <Panel>
              <PanelHeader title="Tendencia por mes" />
              {data.trend.length === 0 ? (
                <PanelMessage>Sin meses en el periodo.</PanelMessage>
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Mes</Th>
                      <Th className="text-right">Total</Th>
                      {data.trendKeys.map((k) => (
                        <Th key={k} className="text-right">
                          {data.categories.find((c) => c.key === k)?.label ?? k}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((m) => (
                      <Tr key={m.month}>
                        <Td className="whitespace-nowrap">{fmtMonth(m.month)}</Td>
                        <Td className="text-right tabular-nums font-medium">{soles(m.total)}</Td>
                        {data.trendKeys.map((k) => (
                          <Td key={k} className="text-right tabular-nums text-ent-fg-2">
                            {soles(m.byCategory[k] ?? 0)}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHeader title={`Productos que más venden (${data.products.length})`} />
            <DataTable>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Categoría</Th>
                  <Th>Marca</Th>
                  <Th className="text-right">Ventas S/</Th>
                  <Th className="text-right">Tickets</Th>
                  <Th className="text-right">Unidades</Th>
                  <Th className="text-right">Clientes</Th>
                  <Th className="text-right">Recompra</Th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <Tr key={p.sku ?? p.name ?? ""}>
                    <Td className="max-w-[320px] truncate" title={p.name ?? ""}>
                      {p.name ?? p.sku}
                      {p.sku && <span className="text-ent-fg-3"> · {p.sku}</span>}
                    </Td>
                    <Td className="text-ent-fg-2">
                      {p.categoryKey
                        ? (data.categories.find((c) => c.key === p.categoryKey)?.label ??
                          p.categoryKey)
                        : "—"}
                    </Td>
                    <Td className="text-ent-fg-2">{p.brand ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{soles(p.amount)}</Td>
                    <Td className="text-right tabular-nums">{p.tickets.toLocaleString("es-PE")}</Td>
                    <Td className="text-right tabular-nums text-ent-fg-2">
                      {p.qty.toLocaleString("es-PE")}
                    </Td>
                    <Td className="text-right tabular-nums">{p.clients}</Td>
                    <Td className="text-right tabular-nums">{days(p.frequencyDays)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </Panel>
        </>
      )}

      {!data && !error && (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      )}
    </div>
  )
}
