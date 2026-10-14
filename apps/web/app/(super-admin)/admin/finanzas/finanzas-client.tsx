"use client"

import { FINANCE_COST_CATEGORIES, FINANCE_INCOME_CATEGORIES } from "@cuik/shared/validators"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BILLING_INTERVAL_LABEL, type BillingInterval } from "@/lib/admin/billing"
import { fxFor, loanBalanceAt, loanSchedule } from "@/lib/admin/finance"
import type { FinanceData } from "@/lib/admin/finance-data"

type Currency = "PEN" | "USD"
type Recognition = "spread" | "cash"

const TODAY_MONTH = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7)
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"

function money(amount: number, currency: Currency) {
  return `${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
  return `${names[(m - 1 + 12) % 12] ?? ym} ${y}`
}

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fieldError = json?.details?.fieldErrors
      ? (Object.values(json.details.fieldErrors as Record<string, string[]>).flat()[0] ?? null)
      : null
    throw new Error(fieldError ?? json?.error ?? "No se pudo guardar")
  }
  return json.data as FinanceData
}

/**
 * Finanzas: Cuik's own costs, other incomes, the partner's loan and
 * contributions, and the monthly exchange rate. Merchant invoices live in
 * each tenant's Facturación; the ledger (Tablero, next block) joins both.
 */
export function FinanzasClient() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/finance")
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const rates = useMemo(() => {
    const r: Record<string, number> = {}
    for (const x of data?.rates ?? []) r[x.month] = x.usdPen
    return r
  }, [data])
  const fxNow = fxFor(TODAY_MONTH, rates)

  if (error) return <PanelMessage className="py-20">{error}</PanelMessage>
  if (!data) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Finanzas" }]}
        title="Costos e ingresos"
        subtitle="El dinero de Cuik: lo que se paga cada mes, lo que entra fuera de las facturas de los comercios, el préstamo y lo que aporta el socio. Todo se expresa en soles con el tipo de cambio del mes."
      />
      {fxNow.estimated && (
        <Notice tone="warn">
          No hay tipo de cambio cargado para {monthLabel(TODAY_MONTH)}: los montos en dólares se
          convierten a {fxNow.rate.toFixed(2)} hasta que lo escribas en la pestaña Tipo de cambio.
        </Notice>
      )}
      <Tabs defaultValue="costos">
        <TabsList className="h-8">
          <TabsTrigger value="costos" className="text-[12.5px]">
            Costos
          </TabsTrigger>
          <TabsTrigger value="ingresos" className="text-[12.5px]">
            Otros ingresos
          </TabsTrigger>
          <TabsTrigger value="socio" className="text-[12.5px]">
            Préstamo y aportes
          </TabsTrigger>
          <TabsTrigger value="tc" className="text-[12.5px]">
            Tipo de cambio
          </TabsTrigger>
        </TabsList>
        <TabsContent value="costos" className="space-y-3">
          <RecurringPanel type="cost" data={data} onData={setData} />
          <EntriesPanel types={["cost"]} data={data} onData={setData} title="Costos variables" />
        </TabsContent>
        <TabsContent value="ingresos" className="space-y-3">
          <RecurringPanel type="income" data={data} onData={setData} />
          <EntriesPanel
            types={["income"]}
            data={data}
            onData={setData}
            title="Ingresos puntuales"
          />
        </TabsContent>
        <TabsContent value="socio" className="space-y-3">
          <LoansPanel data={data} onData={setData} />
          <EntriesPanel
            types={["contribution", "return"]}
            data={data}
            onData={setData}
            title="Aportes del socio y devoluciones"
          />
        </TabsContent>
        <TabsContent value="tc">
          <FxPanel data={data} onData={setData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ───────────────────────── Recurring (fixed costs / recurring incomes) ───────────────────────── */

function RecurringPanel({
  type,
  data,
  onData,
}: {
  type: "cost" | "income"
  data: FinanceData
  onData: (d: FinanceData) => void
}) {
  const rows = data.recurring.filter((r) => r.type === type)
  const categories = type === "cost" ? FINANCE_COST_CATEGORIES : FINANCE_INCOME_CATEGORIES
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    category: categories[0] as string,
    name: "",
    amount: "",
    currency: "PEN" as Currency,
    everyMonths: 1 as BillingInterval,
    fromMonth: TODAY_MONTH,
    toMonth: "",
    recognition: "spread" as Recognition,
  })

  async function save() {
    setBusy(true)
    try {
      onData(
        await call("POST", "/api/admin/finance/recurring", {
          ...f,
          type,
          amount: Number(f.amount),
        }),
      )
      toast.success(type === "cost" ? "Costo fijo guardado" : "Ingreso recurrente guardado")
      setOpen(false)
      setF({ ...f, name: "", amount: "" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }
  async function toggle(id: string, active: boolean) {
    try {
      onData(await call("PATCH", `/api/admin/finance/recurring/${id}`, { active }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este registro? No se puede deshacer.")) return
    try {
      onData(await call("DELETE", `/api/admin/finance/recurring/${id}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={type === "cost" ? "Costos fijos" : "Ingresos recurrentes"}
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => setOpen((o) => !o)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        }
      />
      <p className="px-4 pt-3 text-[12px] text-ent-fg-3">
        {type === "cost"
          ? "Se pagan solos cada mes, trimestre, semestre o año: servidor, dominios, licencias, Apple Developer, un sueldo cuando toque."
          : "Lo que entra de forma regular fuera de las facturas de los comercios."}
      </p>
      {open && (
        <div className="m-4 rounded-[4px] border border-ent-accent/30 bg-ent-accent/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Servidor Hetzner"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <select
              className={sel}
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Periodicidad</Label>
            <select
              className={sel}
              value={String(f.everyMonths)}
              onChange={(e) =>
                setF({ ...f, everyMonths: Number(e.target.value) as BillingInterval })
              }
            >
              {([1, 3, 6, 12] as BillingInterval[]).map((n) => (
                <option key={n} value={String(n)}>
                  {BILLING_INTERVAL_LABEL[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monto por pago</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Moneda</Label>
            <select
              className={sel}
              value={f.currency}
              onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}
            >
              <option value="PEN">S/ soles</option>
              <option value="USD">US$ dólares</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Desde (AAAA-MM)</Label>
            <Input
              value={f.fromMonth}
              onChange={(e) => setF({ ...f, fromMonth: e.target.value })}
              placeholder="2026-01"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta (opcional)</Label>
            <Input
              value={f.toMonth}
              onChange={(e) => setF({ ...f, toMonth: e.target.value })}
              placeholder="sin fin"
            />
          </div>
          {f.everyMonths > 1 && (
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">En el tablero cuenta</Label>
              <select
                className={sel}
                value={f.recognition}
                onChange={(e) => setF({ ...f, recognition: e.target.value as Recognition })}
              >
                <option value="spread">Repartido mes a mes</option>
                <option value="cash">Todo en el mes del pago</option>
              </select>
            </div>
          )}
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || !f.name || f.amount === "" || !MONTH_RE.test(f.fromMonth)}
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <PanelMessage className="py-8">Todavía no hay registros.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Categoría</Th>
              <Th align="right">Monto</Th>
              <Th>Cada</Th>
              <Th>Vigencia</Th>
              <Th>Estado</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-ent-fg-2">{r.category}</Td>
                <Td align="right" className="tabular-nums">
                  {money(r.amount, r.currency)}
                </Td>
                <Td className="text-ent-fg-2">
                  {BILLING_INTERVAL_LABEL[(r.everyMonths as BillingInterval) ?? 1]}
                  {r.everyMonths > 1
                    ? r.recognition === "cash"
                      ? " · todo en el mes"
                      : " · repartido"
                    : ""}
                </Td>
                <Td className="text-ent-fg-2">
                  {monthLabel(r.fromMonth)}
                  {r.toMonth ? ` – ${monthLabel(r.toMonth)}` : " en adelante"}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => toggle(r.id, !r.active)}
                    title="Cambiar estado"
                  >
                    <StatusChip tone={r.active ? "ok" : "mute"}>
                      {r.active ? "Activo" : "Pausado"}
                    </StatusChip>
                  </button>
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    className="text-ent-fg-3 hover:text-red-600"
                    onClick={() => remove(r.id)}
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/* ───────────────────────── One-off entries ───────────────────────── */

const ENTRY_LABEL: Record<string, string> = {
  cost: "Costo",
  income: "Ingreso",
  contribution: "Aporte del socio",
  return: "Devolución al socio",
}

function EntriesPanel({
  types,
  title,
  data,
  onData,
}: {
  types: ("cost" | "income" | "contribution" | "return")[]
  title: string
  data: FinanceData
  onData: (d: FinanceData) => void
}) {
  const rows = data.entries.filter((e) => (types as string[]).includes(e.type))
  const partner = types.includes("contribution")
  const categories =
    types[0] === "cost" ? FINANCE_COST_CATEGORIES : partner ? ["Socio"] : FINANCE_INCOME_CATEGORIES
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    type: types[0],
    category: categories[0] as string,
    name: "",
    amount: "",
    currency: "PEN" as Currency,
    month: TODAY_MONTH,
    months: 1,
    recognition: "spread" as Recognition,
  })

  async function save() {
    setBusy(true)
    try {
      onData(await call("POST", "/api/admin/finance/entries", { ...f, amount: Number(f.amount) }))
      toast.success("Registrado")
      setOpen(false)
      setF({ ...f, name: "", amount: "" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este registro? No se puede deshacer.")) return
    try {
      onData(await call("DELETE", `/api/admin/finance/entries/${id}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={title}
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => setOpen((o) => !o)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        }
      />
      <p className="px-4 pt-3 text-[12px] text-ent-fg-3">
        {partner
          ? "Cada mes que cubres de tu bolsillo es un aporte; cuando Cuik te devuelve, una devolución. Registra como aporte inicial todo lo invertido antes de llevar este control."
          : types[0] === "cost"
            ? "Pagos de una sola vez: publicidad, pasajes, una herramienta por un mes, comisiones."
            : "Entradas de una sola vez: una consultoría, un diseño, un servicio puntual."}
      </p>
      {open && (
        <div className="m-4 rounded-[4px] border border-ent-accent/30 bg-ent-accent/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {types.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <select
                className={sel}
                value={f.type}
                onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={`space-y-1 ${types.length > 1 ? "" : "col-span-2"}`}>
            <Label className="text-xs">Detalle</Label>
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder={partner ? "Cubro octubre" : "Anuncios Instagram"}
            />
          </div>
          {!partner && (
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <select
                className={sel}
                value={f.category}
                onChange={(e) => setF({ ...f, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Mes (AAAA-MM)</Label>
            <Input value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monto</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Moneda</Label>
            <select
              className={sel}
              value={f.currency}
              onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}
            >
              <option value="PEN">S/ soles</option>
              <option value="USD">US$ dólares</option>
            </select>
          </div>
          {!partner && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Cubre (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={f.months}
                  onChange={(e) => setF({ ...f, months: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              {f.months > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">En el tablero cuenta</Label>
                  <select
                    className={sel}
                    value={f.recognition}
                    onChange={(e) => setF({ ...f, recognition: e.target.value as Recognition })}
                  >
                    <option value="spread">Repartido mes a mes</option>
                    <option value="cash">Todo en este mes</option>
                  </select>
                </div>
              )}
            </>
          )}
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || !f.name || f.amount === "" || !MONTH_RE.test(f.month)}
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <PanelMessage className="py-8">Todavía no hay registros.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Mes</Th>
              {types.length > 1 && <Th>Tipo</Th>}
              <Th>Detalle</Th>
              {!partner && <Th>Categoría</Th>}
              <Th align="right">Monto</Th>
              {!partner && <Th>Cubre</Th>}
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <Tr key={e.id}>
                <Td className="tabular-nums">{monthLabel(e.month)}</Td>
                {types.length > 1 && <Td className="text-ent-fg-2">{ENTRY_LABEL[e.type]}</Td>}
                <Td className="font-medium">
                  {e.name}
                  {e.tenantName ? <span className="text-ent-fg-3"> · {e.tenantName}</span> : null}
                </Td>
                {!partner && <Td className="text-ent-fg-2">{e.category}</Td>}
                <Td align="right" className="tabular-nums">
                  {money(e.amount, e.currency)}
                </Td>
                {!partner && (
                  <Td className="text-ent-fg-2">
                    {e.months > 1
                      ? `${e.months} meses · ${e.recognition === "cash" ? "todo en el mes" : "repartido"}`
                      : "1 mes"}
                  </Td>
                )}
                <Td align="right">
                  <button
                    type="button"
                    className="text-ent-fg-3 hover:text-red-600"
                    onClick={() => remove(e.id)}
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/* ───────────────────────── Loans ───────────────────────── */

function LoansPanel({ data, onData }: { data: FinanceData; onData: (d: FinanceData) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    name: "Préstamo",
    principal: "",
    currency: "USD" as Currency,
    installment: "",
    installments: "",
    firstMonth: TODAY_MONTH,
  })

  async function save() {
    setBusy(true)
    try {
      onData(
        await call("POST", "/api/admin/finance/loans", {
          ...f,
          principal: Number(f.principal),
          installment: Number(f.installment),
          installments: Number(f.installments),
        }),
      )
      toast.success("Préstamo registrado")
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este préstamo? No se puede deshacer.")) return
    try {
      onData(await call("DELETE", `/api/admin/finance/loans/${id}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Préstamo"
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => setOpen((o) => !o)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        }
      />
      <p className="px-4 pt-3 text-[12px] text-ent-fg-3">
        Cuotas iguales desde el primer mes. El tablero descuenta cada cuota del mes y muestra el
        saldo que falta.
      </p>
      {open && (
        <div className="m-4 rounded-[4px] border border-ent-accent/30 bg-ent-accent/5 p-4 grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nombre</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Capital</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.principal}
              onChange={(e) => setF({ ...f, principal: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Moneda</Label>
            <select
              className={sel}
              value={f.currency}
              onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}
            >
              <option value="USD">US$ dólares</option>
              <option value="PEN">S/ soles</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cuota mensual</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.installment}
              onChange={(e) => setF({ ...f, installment: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">N° de cuotas</Label>
            <Input
              type="number"
              min={1}
              max={360}
              value={f.installments}
              onChange={(e) => setF({ ...f, installments: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Primera cuota (AAAA-MM)</Label>
            <Input
              value={f.firstMonth}
              onChange={(e) => setF({ ...f, firstMonth: e.target.value })}
            />
          </div>
          <div className="col-span-2 sm:col-span-6 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={
                busy ||
                !f.name ||
                f.principal === "" ||
                f.installment === "" ||
                f.installments === "" ||
                !MONTH_RE.test(f.firstMonth)
              }
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {data.loans.length === 0 ? (
        <PanelMessage className="py-8">Sin préstamos registrados.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Préstamo</Th>
              <Th align="right">Capital</Th>
              <Th align="right">Cuota</Th>
              <Th>Cuotas</Th>
              <Th align="right">Saldo hoy</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.loans.map((l) => {
              const sched = loanSchedule(l)
              const paid = sched.filter((s) => s.month <= TODAY_MONTH).length
              return (
                <Tr key={l.id}>
                  <Td className="font-medium">{l.name}</Td>
                  <Td align="right" className="tabular-nums">
                    {money(l.principal, l.currency)}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {money(l.installment, l.currency)}
                  </Td>
                  <Td className="text-ent-fg-2">
                    {paid} de {l.installments} · {monthLabel(l.firstMonth)} –{" "}
                    {monthLabel(sched[sched.length - 1].month)}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {money(loanBalanceAt(l, TODAY_MONTH), l.currency)}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      className="text-ent-fg-3 hover:text-red-600"
                      onClick={() => remove(l.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/* ───────────────────────── FX ───────────────────────── */

function FxPanel({ data, onData }: { data: FinanceData; onData: (d: FinanceData) => void }) {
  const [month, setMonth] = useState(TODAY_MONTH)
  const [rate, setRate] = useState("")
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      onData(await call("PUT", "/api/admin/finance/fx", { month, usdPen: Number(rate) }))
      toast.success(`Tipo de cambio de ${monthLabel(month)} guardado`)
      setRate("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHeader title="Tipo de cambio US$ → S/" />
      <p className="px-4 pt-3 text-[12px] text-ent-fg-3">
        Un valor por mes, escrito a mano. Los meses sin valor usan el último anterior; mientras no
        haya ninguno se usa 3.75 y el tablero lo marca como estimado.
      </p>
      <div className="m-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Mes (AAAA-MM)</Label>
          <Input className="w-32" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Soles por dólar</Label>
          <Input
            className="w-32"
            type="number"
            min={0}
            step="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="3.75"
          />
        </div>
        <Button size="sm" disabled={busy || rate === "" || !MONTH_RE.test(month)} onClick={save}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
        </Button>
      </div>
      {data.rates.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th align="right">S/ por US$</Th>
            </tr>
          </thead>
          <tbody>
            {data.rates.map((r) => (
              <Tr key={r.month}>
                <Td>{monthLabel(r.month)}</Td>
                <Td align="right" className="tabular-nums">
                  {r.usdPen.toFixed(4)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}
