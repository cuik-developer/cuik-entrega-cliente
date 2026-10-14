"use client"

import { PROSPECT_STAGES } from "@cuik/shared/validators"
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
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
import { BILLING_INTERVAL_LABEL, type BillingInterval } from "@/lib/admin/billing"
import {
  isOpen,
  PROSPECT_STAGE_LABEL,
  PROSPECT_STAGE_PROBABILITY,
  type ProspectStage,
  prospectMonthlyPen,
} from "@/lib/admin/prospects"
import type { ProspectRow, ProspectsData } from "@/lib/admin/prospects-data"
import { cn } from "@/lib/utils"

type Currency = "PEN" | "USD"
const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"
const STAGE_TONE: Record<ProspectStage, "ok" | "info" | "warn" | "bad" | "mute"> = {
  lead: "mute",
  demo_scheduled: "warn",
  demo_done: "warn",
  proposal: "info",
  negotiation: "info",
  won: "ok",
  lost: "bad",
  standby: "mute",
}

function soles(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function money(amount: number, currency: Currency) {
  return `${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function dmy(ymd: string | null) {
  if (!ymd) return ""
  const [y, m, d] = ymd.split("-")
  return `${d}/${m}/${y.slice(2)}`
}
function monthLabel(ym: string | null) {
  if (!ym) return ""
  const [y, m] = ym.split("-").map(Number)
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
  return `${names[(m - 1 + 12) % 12] ?? ym} ${y}`
}
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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
  return json.data as ProspectsData
}

type Form = {
  name: string
  contactName: string
  phone: string
  email: string
  city: string
  source: string
  stage: ProspectStage
  probability: string
  planId: string
  monthlyAmount: string
  currency: Currency
  intervalMonths: BillingInterval
  billingMode: "advance" | "arrears"
  expectedStartMonth: string
  expectedCloseOn: string
  demoStartOn: string
  demoEndOn: string
  tenantId: string
  nextStep: string
  nextStepOn: string
  lostReason: string
  notes: string
}
const EMPTY: Form = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  city: "",
  source: "",
  stage: "lead",
  probability: "10",
  planId: "",
  monthlyAmount: "",
  currency: "PEN",
  intervalMonths: 1,
  billingMode: "arrears",
  expectedStartMonth: "",
  expectedCloseOn: "",
  demoStartOn: "",
  demoEndOn: "",
  tenantId: "",
  nextStep: "",
  nextStepOn: "",
  lostReason: "",
  notes: "",
}
function toForm(p: ProspectRow): Form {
  return {
    name: p.name,
    contactName: p.contactName ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    city: p.city ?? "",
    source: p.source ?? "",
    stage: p.stage,
    probability: String(p.probability),
    planId: p.planId ?? "",
    monthlyAmount: p.monthlyAmount === null ? "" : String(p.monthlyAmount),
    currency: p.currency,
    intervalMonths: p.intervalMonths,
    billingMode: p.billingMode,
    expectedStartMonth: p.expectedStartMonth ?? "",
    expectedCloseOn: p.expectedCloseOn ?? "",
    demoStartOn: p.demoStartOn ?? "",
    demoEndOn: p.demoEndOn ?? "",
    tenantId: p.tenantId ?? "",
    nextStep: p.nextStep ?? "",
    nextStepOn: p.nextStepOn ?? "",
    lostReason: p.lostReason ?? "",
    notes: p.notes ?? "",
  }
}
function toPayload(f: Form) {
  return {
    ...f,
    probability:
      f.probability.trim() === "" ? PROSPECT_STAGE_PROBABILITY[f.stage] : Number(f.probability),
    monthlyAmount: f.monthlyAmount === "" ? null : Number(f.monthlyAmount),
  }
}

/**
 * CRM de prospectos: who Cuik is talking to, at which stage, under which
 * terms it would be billed and with what probability. Open prospects can be
 * folded into the Tablero projection, weighted by probability.
 */
export function ProspectosClient() {
  const [data, setData] = useState<ProspectsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<"open" | "all" | ProspectStage>("open")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<ProspectRow | "new" | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/finance/prospects")
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

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.prospects.filter((p) => {
      if (stageFilter === "open" && !isOpen(p)) return false
      if (stageFilter !== "open" && stageFilter !== "all" && p.stage !== stageFilter) return false
      if (!q) return true
      return [p.name, p.contactName, p.city, p.source, p.tenantName]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    })
  }, [data, stageFilter, search])

  if (error) return <PanelMessage className="py-20">{error}</PanelMessage>
  if (!data) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }
  const s = data.summary
  const soon = addDays(data.today, 7)
  const stats: Stat[] = [
    {
      label: "Prospectos abiertos",
      value: s.open,
      hint: s.inDemo > 0 ? `${s.inDemo} en demo` : undefined,
    },
    {
      label: "Valor mensual ponderado",
      value: soles(s.weightedMonthlyPen),
      hint: `${soles(s.fullMonthlyPen)} si entran todos`,
    },
    {
      label: "Demos por terminar",
      value: s.demosEnding,
      hint: "en 7 días",
      tone: s.demosEnding > 0 ? "warn" : "mute",
    },
    {
      label: "Pasos vencidos",
      value: s.stepsDue,
      hint: s.stepsDue > 0 ? "atender hoy" : "al día",
      tone: s.stepsDue > 0 ? "bad" : "ok",
    },
  ]

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      setData(await call("PATCH", `/api/admin/finance/prospects/${id}`, body))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    }
  }
  async function remove(p: ProspectRow) {
    if (!confirm(`¿Eliminar a ${p.name}? No se puede deshacer.`)) return
    try {
      setData(await call("DELETE", `/api/admin/finance/prospects/${p.id}`))
      toast.success("Prospecto eliminado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[
          { label: "Inicio", href: "/admin" },
          { label: "Finanzas", href: "/admin/finanzas/tablero" },
          { label: "Prospectos" },
        ]}
        title="Prospectos"
        subtitle="Con quién está hablando Cuik, en qué etapa va y bajo qué condiciones se facturaría. Los abiertos entran al Tablero ponderados por su probabilidad cuando activas «Incluir prospectos»."
        actions={
          <Button size="sm" className="h-8 text-[12.5px] gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="w-3.5 h-3.5" /> Nuevo prospecto
          </Button>
        }
      />
      <StatStrip stats={stats} />

      {editing && (
        <ProspectForm
          initial={editing === "new" ? EMPTY : toForm(editing)}
          id={editing === "new" ? null : editing.id}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setData(d)
            setEditing(null)
          }}
        />
      )}

      <Panel>
        <Toolbar>
          <div className="flex items-center gap-1 flex-wrap">
            {(["open", "all", ...PROSPECT_STAGES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStageFilter(st)}
                className={cn(
                  "h-7 px-2.5 rounded-[3px] text-[12px] border",
                  stageFilter === st
                    ? "bg-ent-fg text-white border-ent-fg"
                    : "border-ent-line text-ent-fg-2 hover:bg-ent-panel-2",
                )}
              >
                {st === "open" ? "Abiertos" : st === "all" ? "Todos" : PROSPECT_STAGE_LABEL[st]}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar negocio, contacto, ciudad…"
            className="h-8 w-[240px] text-[12.5px] ml-auto"
          />
        </Toolbar>
        {rows.length === 0 ? (
          <PanelMessage className="py-10">
            {data.prospects.length === 0
              ? "Todavía no hay prospectos. Crea el primero con «Nuevo prospecto»."
              : "Nada que coincida con el filtro."}
          </PanelMessage>
        ) : (
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr>
                  <Th>Negocio</Th>
                  <Th>Etapa</Th>
                  <Th align="right">Prob.</Th>
                  <Th>Plan y condiciones</Th>
                  <Th align="right">S/ al mes</Th>
                  <Th>Demo</Th>
                  <Th>Próximo paso</Th>
                  <Th>Comercio</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const monthly = prospectMonthlyPen(p, data.fx.rate)
                  const demoWarn = p.demoEndOn && isOpen(p) && p.demoEndOn <= soon
                  const stepDue = p.nextStepOn && isOpen(p) && p.nextStepOn <= data.today
                  return (
                    <Tr key={p.id}>
                      <Td>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-ent-fg-3 truncate max-w-[220px]">
                          {[p.contactName, p.phone, p.city].filter(Boolean).join(" · ")}
                        </div>
                      </Td>
                      <Td>
                        <select
                          className="h-7 rounded-[3px] border border-ent-line bg-white px-1.5 text-[12px]"
                          value={p.stage}
                          onChange={(e) => {
                            const stage = e.target.value as ProspectStage
                            // Losing one needs a reason: open the form instead of patching.
                            if (stage === "lost") {
                              setEditing({ ...p, stage, probability: 0 })
                              return
                            }
                            // Keep a hand-set probability; replace only the stage default.
                            const probability =
                              p.probability === PROSPECT_STAGE_PROBABILITY[p.stage]
                                ? PROSPECT_STAGE_PROBABILITY[stage]
                                : p.probability
                            patch(p.id, { stage, probability })
                          }}
                          title="Cambiar etapa"
                        >
                          {PROSPECT_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {PROSPECT_STAGE_LABEL[st]}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td align="right" className="tabular-nums">
                        <StatusChip tone={STAGE_TONE[p.stage]}>{p.probability} %</StatusChip>
                      </Td>
                      <Td className="text-ent-fg-2 whitespace-nowrap">
                        {p.planName ?? "—"}
                        {p.monthlyAmount !== null && (
                          <>
                            {" · "}
                            {money(p.monthlyAmount, p.currency)}{" "}
                            {BILLING_INTERVAL_LABEL[p.intervalMonths].toLowerCase()}
                            {p.billingMode === "advance" ? " adelantado" : " vencido"}
                          </>
                        )}
                        {p.expectedStartMonth && (
                          <div className="text-[11px] text-ent-fg-3">
                            desde {monthLabel(p.expectedStartMonth)}
                          </div>
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {monthly > 0 ? soles(monthly) : ""}
                      </Td>
                      <Td className={cn("whitespace-nowrap", demoWarn && "text-ent-warn")}>
                        {p.demoEndOn
                          ? `hasta ${dmy(p.demoEndOn)}`
                          : p.demoStartOn
                            ? `desde ${dmy(p.demoStartOn)}`
                            : ""}
                      </Td>
                      <Td className={cn(stepDue && "text-ent-bad")}>
                        <div className="truncate max-w-[200px]">{p.nextStep ?? ""}</div>
                        {p.nextStepOn && (
                          <div className="text-[11px] text-ent-fg-3">{dmy(p.nextStepOn)}</div>
                        )}
                      </Td>
                      <Td>
                        {p.tenantId ? (
                          <Link
                            href={`/admin/tenants/${p.tenantId}?tab=facturacion`}
                            className="inline-flex items-center gap-1 text-ent-accent hover:underline whitespace-nowrap"
                          >
                            {p.tenantName}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-ent-fg-3">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="text-ent-fg-3 hover:text-ent-fg"
                            onClick={() => setEditing(p)}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="text-ent-fg-3 hover:text-red-600"
                            onClick={() => remove(p)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </Panel>

      <Notice tone="info">
        Al ganar un prospecto, enlázalo con su comercio y configura la facturación en la ficha del
        tenant (monto, periodicidad, inicio de servicio): desde ese momento el Tablero lo proyecta
        como ingreso real y deja de usar la probabilidad.
      </Notice>
    </div>
  )
}

function ProspectForm({
  initial,
  id,
  data,
  onClose,
  onSaved,
}: {
  initial: Form
  id: string | null
  data: ProspectsData
  onClose: () => void
  onSaved: (d: ProspectsData) => void
}) {
  const [f, setF] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }))

  async function save() {
    setBusy(true)
    try {
      const d = id
        ? await call("PATCH", `/api/admin/finance/prospects/${id}`, toPayload(f))
        : await call("POST", "/api/admin/finance/prospects", toPayload(f))
      toast.success(id ? "Prospecto actualizado" : "Prospecto creado")
      onSaved(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHeader title={id ? `Editar · ${initial.name}` : "Nuevo prospecto"} />
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Negocio" className="col-span-2">
          <Input
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="D'Frios"
          />
        </Field>
        <Field label="Contacto">
          <Input value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Correo">
          <Input value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Ciudad">
          <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Origen">
          <Input
            value={f.source}
            onChange={(e) => set({ source: e.target.value })}
            placeholder="Referido, Instagram…"
          />
        </Field>
        <Field label="Etapa">
          <select
            className={sel}
            value={f.stage}
            onChange={(e) => {
              const stage = e.target.value as ProspectStage
              set({ stage, probability: String(PROSPECT_STAGE_PROBABILITY[stage]) })
            }}
          >
            {PROSPECT_STAGES.map((st) => (
              <option key={st} value={st}>
                {PROSPECT_STAGE_LABEL[st]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Probabilidad %">
          <Input
            type="number"
            min={0}
            max={100}
            value={f.probability}
            onChange={(e) => set({ probability: e.target.value })}
          />
        </Field>
        <Field label="Plan">
          <select
            className={sel}
            value={f.planId}
            onChange={(e) => {
              const plan = data.plans.find((p) => p.id === e.target.value)
              set({
                planId: e.target.value,
                ...(plan && plan.price > 0 ? { monthlyAmount: String(plan.price / 100) } : {}),
              })
            }}
          >
            <option value="">Sin plan</option>
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · S/ {p.price / 100}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Monto por factura">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={f.monthlyAmount}
            onChange={(e) => set({ monthlyAmount: e.target.value })}
          />
        </Field>
        <Field label="Moneda">
          <select
            className={sel}
            value={f.currency}
            onChange={(e) => set({ currency: e.target.value as Currency })}
          >
            <option value="PEN">S/ soles</option>
            <option value="USD">US$ dólares</option>
          </select>
        </Field>
        <Field label="Periodicidad">
          <select
            className={sel}
            value={String(f.intervalMonths)}
            onChange={(e) => set({ intervalMonths: Number(e.target.value) as BillingInterval })}
          >
            {([1, 3, 6, 12] as BillingInterval[]).map((n) => (
              <option key={n} value={String(n)}>
                {BILLING_INTERVAL_LABEL[n]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modalidad">
          <select
            className={sel}
            value={f.billingMode}
            onChange={(e) => set({ billingMode: e.target.value as "advance" | "arrears" })}
          >
            <option value="arrears">A periodo vencido</option>
            <option value="advance">Por adelantado</option>
          </select>
        </Field>
        <Field label="Empezaría a facturar (AAAA-MM)">
          <Input
            value={f.expectedStartMonth}
            onChange={(e) => set({ expectedStartMonth: e.target.value })}
            placeholder="2026-11"
          />
        </Field>
        <Field label="Cierre estimado">
          <Input
            type="date"
            value={f.expectedCloseOn}
            onChange={(e) => set({ expectedCloseOn: e.target.value })}
          />
        </Field>
        <Field label="Demo desde">
          <Input
            type="date"
            value={f.demoStartOn}
            onChange={(e) => set({ demoStartOn: e.target.value })}
          />
        </Field>
        <Field label="Demo hasta">
          <Input
            type="date"
            value={f.demoEndOn}
            onChange={(e) => set({ demoEndOn: e.target.value })}
          />
        </Field>
        <Field label="Comercio enlazado" className="col-span-2">
          <select
            className={sel}
            value={f.tenantId}
            onChange={(e) => set({ tenantId: e.target.value })}
          >
            <option value="">Ninguno todavía</option>
            {data.tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Próximo paso" className="col-span-2 sm:col-span-3">
          <Input
            value={f.nextStep}
            onChange={(e) => set({ nextStep: e.target.value })}
            placeholder="Llamar para cerrar, enviar propuesta…"
          />
        </Field>
        <Field label="Fecha del paso">
          <Input
            type="date"
            value={f.nextStepOn}
            onChange={(e) => set({ nextStepOn: e.target.value })}
          />
        </Field>
        {f.stage === "lost" && (
          <Field label="Motivo de pérdida" className="col-span-2 sm:col-span-4">
            <Input value={f.lostReason} onChange={(e) => set({ lostReason: e.target.value })} />
          </Field>
        )}
        <Field label="Notas" className="col-span-2 sm:col-span-4">
          <textarea
            className="w-full min-h-[64px] rounded-md border border-ent-line bg-white px-2 py-1.5 text-sm"
            value={f.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={busy || !f.name.trim()} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
