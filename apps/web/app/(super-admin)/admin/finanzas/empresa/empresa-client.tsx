"use client"

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CompanyData } from "@/lib/admin/company-data"
import { monthShort, REGIME_LABEL, type TaxRegime, validityLabel } from "@/lib/admin/issuers"

type Issuer = CompanyData["issuers"][number]
type Profile = CompanyData["profiles"][number]
type Bracket = { upToUit: number | null; rate: number }

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"

/** 0.295 → "29.5" (percent for inputs and tables, no float noise). */
const pct = (rate: number) => String(Math.round(rate * 10000) / 100)
/** "29.5" → 0.295 */
const fromPct = (v: string) => Math.round(Number(v) * 100) / 10000

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
    const formError = (json?.details?.formErrors as string[] | undefined)?.[0] ?? null
    throw new Error(fieldError ?? formError ?? json?.error ?? "No se pudo guardar")
  }
  return json.data as CompanyData
}

function bracketsLabel(brackets: Bracket[]): string {
  if (brackets.length === 0) return "—"
  return brackets
    .map((b) =>
      b.upToUit === null ? `${pct(b.rate)} %` : `${pct(b.rate)} % hasta ${b.upToUit} UIT`,
    )
    .join(" · ")
}

/**
 * Finanzas › Empresa y régimen: which legal entity issues Cuik's invoices in
 * each month (Making Brands until Oct 2026, CUIK E.I.R.L. after), the tax
 * regime and rates in force, and the UIT per year. The monthly IGV / income
 * tax calculation reads everything from here; nothing is hard-coded.
 */
export function EmpresaClient() {
  const [data, setData] = useState<CompanyData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/finance/company")
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

  if (error) return <PanelMessage className="py-20">{error}</PanelMessage>
  if (!data) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  const current = data.issuers.find((i) => i.id === data.currentIssuerId) ?? null
  const currentProfile = data.profiles.find((p) => p.id === data.currentProfileId) ?? null
  const year = Number(data.month.slice(0, 4))
  const hasUit = data.uit.some((u) => u.year === year)

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[
          { label: "Inicio", href: "/admin" },
          { label: "Finanzas", href: "/admin/finanzas/tablero" },
          { label: "Empresa y régimen" },
        ]}
        title="Empresa y régimen"
        subtitle={
          current
            ? `Hoy factura ${current.razonSocial} · RUC ${current.ruc}${currentProfile ? ` · ${REGIME_LABEL[currentProfile.regime]}` : ""}`
            : "Quién emite las facturas de Cuik y bajo qué régimen tributario."
        }
      />
      {!current && (
        <Notice tone="bad">
          Ningún emisor cubre {monthShort(data.month)}: registra la razón social que factura este
          mes.
        </Notice>
      )}
      {current && !currentProfile && (
        <Notice tone="warn">
          {current.razonSocial} no tiene régimen para {monthShort(data.month)}: agrégalo en Régimen
          y tasas.
        </Notice>
      )}
      {currentProfile && !currentProfile.validatedByAccountant && (
        <Notice tone="warn">
          Las tasas de {REGIME_LABEL[currentProfile.regime]} todavía no están validadas por el
          contador. Los cálculos de IGV y renta se mostrarán como estimados hasta que las marques
          como validadas.
        </Notice>
      )}
      {!hasUit && (
        <Notice tone="warn">
          Falta el valor de la UIT {year}: se usa para los tramos de renta anual y el tope de gastos
          de representación.
        </Notice>
      )}
      <IssuersPanel data={data} onData={setData} />
      <ProfilesPanel data={data} onData={setData} />
      <UitPanel data={data} onData={setData} />
    </div>
  )
}

/* ───────────────────────── Emisores ───────────────────────── */

type IssuerForm = {
  ruc: string
  razonSocial: string
  nombreComercial: string
  domicilioFiscal: string
  fromMonth: string
  toMonth: string
  notes: string
}
const emptyIssuer: IssuerForm = {
  ruc: "",
  razonSocial: "",
  nombreComercial: "",
  domicilioFiscal: "",
  fromMonth: "",
  toMonth: "",
  notes: "",
}

function IssuersPanel({ data, onData }: { data: CompanyData; onData: (d: CompanyData) => void }) {
  // null = closed; "new" = adding; an id = editing that issuer.
  const [editing, setEditing] = useState<string | null>(null)
  const [f, setF] = useState<IssuerForm>(emptyIssuer)
  const [busy, setBusy] = useState(false)

  function open(issuer: Issuer | null) {
    setEditing(issuer?.id ?? "new")
    setF(
      issuer
        ? {
            ruc: issuer.ruc,
            razonSocial: issuer.razonSocial,
            nombreComercial: issuer.nombreComercial ?? "",
            domicilioFiscal: issuer.domicilioFiscal ?? "",
            fromMonth: issuer.fromMonth ?? "",
            toMonth: issuer.toMonth ?? "",
            notes: issuer.notes ?? "",
          }
        : emptyIssuer,
    )
  }

  async function save() {
    setBusy(true)
    try {
      onData(
        editing === "new"
          ? await call("POST", "/api/admin/finance/issuers", f)
          : await call("PUT", `/api/admin/finance/issuers/${editing}`, f),
      )
      toast.success("Emisor guardado")
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const monthsOk =
    (f.fromMonth === "" || MONTH_RE.test(f.fromMonth)) &&
    (f.toMonth === "" || MONTH_RE.test(f.toMonth))

  return (
    <Panel>
      <PanelHeader
        title="Emisores"
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => open(null)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo emisor
          </Button>
        }
      />
      <p className="px-3 pt-2.5 text-[12px] text-ent-fg-3">
        La razón social que emite las facturas a los comercios en cada mes. Dos emisores no pueden
        cubrir el mismo mes. Las facturas registradas antes de noviembre 2026 se muestran como
        emitidas por Making Brands.
      </p>
      {editing && (
        <div className="m-3 rounded-[4px] border border-ent-line bg-ent-panel-2 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">RUC</Label>
            <Input
              value={f.ruc}
              inputMode="numeric"
              maxLength={11}
              onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/\D/g, "") })}
            />
          </div>
          <div className="space-y-1 col-span-1 sm:col-span-2">
            <Label className="text-xs">Razón social</Label>
            <Input
              value={f.razonSocial}
              onChange={(e) => setF({ ...f, razonSocial: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre comercial</Label>
            <Input
              value={f.nombreComercial}
              onChange={(e) => setF({ ...f, nombreComercial: e.target.value })}
            />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-4">
            <Label className="text-xs">Domicilio fiscal</Label>
            <Input
              value={f.domicilioFiscal}
              onChange={(e) => setF({ ...f, domicilioFiscal: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Factura desde (AAAA-MM)</Label>
            <Input
              value={f.fromMonth}
              placeholder="sin inicio"
              onChange={(e) => setF({ ...f, fromMonth: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta (AAAA-MM)</Label>
            <Input
              value={f.toMonth}
              placeholder="vigente"
              onChange={(e) => setF({ ...f, toMonth: e.target.value })}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notas</Label>
            <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || f.ruc.length !== 11 || !f.razonSocial.trim() || !monthsOk}
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {data.issuers.length === 0 ? (
        <PanelMessage className="py-8">Todavía no hay emisores.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Razón social</Th>
              <Th>RUC</Th>
              <Th>Domicilio fiscal</Th>
              <Th>Factura</Th>
              <Th>Estado</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.issuers.map((i) => {
              const isCurrent = i.id === data.currentIssuerId
              const future = i.fromMonth !== null && i.fromMonth > data.month
              return (
                <Tr key={i.id}>
                  <Td className="font-medium">
                    {i.razonSocial}
                    {i.nombreComercial ? (
                      <span className="block text-[11.5px] font-normal text-ent-fg-3">
                        {i.nombreComercial}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="tabular-nums">{i.ruc}</Td>
                  <Td className="text-ent-fg-2">{i.domicilioFiscal ?? "—"}</Td>
                  <Td className="text-ent-fg-2 whitespace-nowrap">{validityLabel(i)}</Td>
                  <Td>
                    <StatusChip tone={isCurrent ? "ok" : future ? "info" : "mute"}>
                      {isCurrent ? "Vigente" : future ? "Próximo" : "Histórico"}
                    </StatusChip>
                  </Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Editar emisor"
                      onClick={() => open(i)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
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

/* ───────────────────────── Régimen y tasas ───────────────────────── */

type ProfileForm = {
  issuerId: string
  fromMonth: string
  regime: TaxRegime
  igvPct: string
  monthlyPct: string
  brackets: { upToUit: string; ratePct: string }[]
  repPct: string
  repUit: string
  validatedByAccountant: boolean
  notes: string
}

/**
 * Starting values when a regime is picked. Only a suggestion to save typing:
 * every rate stays editable and is stored per profile; the accountant
 * confirms them with "Validado por el contador".
 */
const REGIME_PRESET: Record<TaxRegime, Pick<ProfileForm, "monthlyPct" | "brackets">> = {
  rmt: {
    monthlyPct: "1",
    brackets: [
      { upToUit: "15", ratePct: "10" },
      { upToUit: "", ratePct: "29.5" },
    ],
  },
  rer: { monthlyPct: "1.5", brackets: [] },
  general: { monthlyPct: "1.5", brackets: [{ upToUit: "", ratePct: "29.5" }] },
}

function profileForm(p: Profile | null, issuerId: string, month: string): ProfileForm {
  if (!p) {
    return {
      issuerId,
      fromMonth: month,
      regime: "rmt",
      igvPct: "18",
      ...REGIME_PRESET.rmt,
      repPct: "0.5",
      repUit: "40",
      validatedByAccountant: false,
      notes: "",
    }
  }
  return {
    issuerId: p.issuerId,
    fromMonth: p.fromMonth,
    regime: p.regime,
    igvPct: pct(p.igvRate),
    monthlyPct: pct(p.monthlyRate),
    brackets: p.annualBrackets.map((b) => ({
      upToUit: b.upToUit === null ? "" : String(b.upToUit),
      ratePct: pct(b.rate),
    })),
    repPct: pct(p.representationCapPct),
    repUit: String(p.representationCapUit),
    validatedByAccountant: p.validatedByAccountant,
    notes: p.notes ?? "",
  }
}

function ProfilesPanel({ data, onData }: { data: CompanyData; onData: (d: CompanyData) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [f, setF] = useState<ProfileForm>(() =>
    profileForm(null, data.currentIssuerId ?? data.issuers[0]?.id ?? "", data.month),
  )
  const [busy, setBusy] = useState(false)
  const issuerName = (id: string) => data.issuers.find((i) => i.id === id)?.razonSocial ?? "—"

  function open(p: Profile | null) {
    setEditing(p?.id ?? "new")
    setF(profileForm(p, data.currentIssuerId ?? data.issuers[0]?.id ?? "", data.month))
  }

  const numbersOk = [
    f.igvPct,
    f.monthlyPct,
    f.repPct,
    f.repUit,
    ...f.brackets.map((b) => b.ratePct),
  ].every((v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0)

  async function save() {
    setBusy(true)
    try {
      const body = {
        issuerId: f.issuerId,
        fromMonth: f.fromMonth,
        regime: f.regime,
        igvRate: fromPct(f.igvPct),
        monthlyRate: fromPct(f.monthlyPct),
        annualBrackets: f.brackets.map((b) => ({
          upToUit: b.upToUit.trim() === "" ? null : Number(b.upToUit),
          rate: fromPct(b.ratePct),
        })),
        representationCapPct: fromPct(f.repPct),
        representationCapUit: Number(f.repUit),
        validatedByAccountant: f.validatedByAccountant,
        notes: f.notes,
      }
      onData(
        editing === "new"
          ? await call("POST", "/api/admin/finance/tax-profiles", body)
          : await call("PUT", `/api/admin/finance/tax-profiles/${editing}`, body),
      )
      toast.success("Régimen guardado")
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Profile) {
    if (
      !confirm(
        `¿Eliminar el régimen de ${issuerName(p.issuerId)} desde ${monthShort(p.fromMonth)}?`,
      )
    )
      return
    try {
      onData(await call("DELETE", `/api/admin/finance/tax-profiles/${p.id}`))
      toast.success("Régimen eliminado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  // Changing any rate takes the accountant's validation off: it has to be
  // marked again once the new values are confirmed.
  function setRates(patch: Partial<ProfileForm>) {
    setF({ ...f, ...patch, validatedByAccountant: false })
  }

  function setBracket(i: number, patch: Partial<ProfileForm["brackets"][number]>) {
    setRates({ brackets: f.brackets.map((b, j) => (j === i ? { ...b, ...patch } : b)) })
  }

  return (
    <Panel>
      <PanelHeader
        title="Régimen y tasas"
        actions={
          <Button
            size="sm"
            className="h-7 text-[12px] gap-1.5"
            disabled={data.issuers.length === 0}
            onClick={() => open(null)}
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo régimen
          </Button>
        }
      />
      <p className="px-3 pt-2.5 text-[12px] text-ent-fg-3">
        Cada régimen rige desde su mes hasta el siguiente del mismo emisor. Pago mensual: pago a
        cuenta (MYPE Tributario y General) o cuota definitiva (RER), sobre los ingresos sin IGV. Los
        tramos anuales se aplican a la utilidad del año. Los valores sugeridos al elegir un régimen
        los confirma el contador.
      </p>
      {editing && (
        <div className="m-3 rounded-[4px] border border-ent-line bg-ent-panel-2 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Emisor</Label>
            <select
              className={sel}
              value={f.issuerId}
              onChange={(e) => setF({ ...f, issuerId: e.target.value })}
            >
              {data.issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.razonSocial}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Desde (AAAA-MM)</Label>
            <Input
              value={f.fromMonth}
              onChange={(e) => setF({ ...f, fromMonth: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Régimen</Label>
            <select
              className={sel}
              value={f.regime}
              onChange={(e) => {
                const regime = e.target.value as TaxRegime
                setRates({ regime, ...REGIME_PRESET[regime] })
              }}
            >
              {(Object.keys(REGIME_LABEL) as TaxRegime[]).map((r) => (
                <option key={r} value={r}>
                  {REGIME_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IGV (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.igvPct}
              onChange={(e) => setRates({ igvPct: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pago mensual de renta (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.monthlyPct}
              onChange={(e) => setRates({ monthlyPct: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tope representación (% ingresos)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.repPct}
              onChange={(e) => setRates({ repPct: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máximo representación (UIT)</Label>
            <Input
              type="number"
              step="1"
              min={0}
              value={f.repUit}
              onChange={(e) => setRates({ repUit: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validado por el contador</Label>
            <div className="flex items-center gap-2 h-9">
              <Switch
                checked={f.validatedByAccountant}
                onCheckedChange={(v) => setF({ ...f, validatedByAccountant: v })}
              />
              <span className="text-[12.5px] text-ent-fg-2">
                {f.validatedByAccountant ? "Validado" : "Sin validar"}
              </span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4 space-y-1.5">
            <Label className="text-xs">Renta anual por tramos de utilidad</Label>
            {f.brackets.length === 0 && (
              <p className="text-[12px] text-ent-fg-3">
                Sin cálculo anual (el pago mensual es definitivo).
              </p>
            )}
            {f.brackets.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: brackets have no id and keep their order
              <div key={i} className="flex items-center gap-2 text-[12.5px]">
                <Input
                  className="w-24"
                  type="number"
                  step="0.01"
                  min={0}
                  value={b.ratePct}
                  onChange={(e) => setBracket(i, { ratePct: e.target.value })}
                />
                <span className="text-ent-fg-3">% hasta</span>
                <Input
                  className="w-24"
                  type="number"
                  step="1"
                  min={0}
                  placeholder="sin tope"
                  value={b.upToUit}
                  onChange={(e) => setBracket(i, { upToUit: e.target.value })}
                />
                <span className="text-ent-fg-3">UIT de utilidad</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Quitar tramo"
                  onClick={() => setRates({ brackets: f.brackets.filter((_, j) => j !== i) })}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[12px] gap-1.5"
              onClick={() => setRates({ brackets: [...f.brackets, { upToUit: "", ratePct: "" }] })}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar tramo
            </Button>
          </div>
          <div className="col-span-2 sm:col-span-4 space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={2}
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              placeholder="Qué validó el contador, fecha, observaciones…"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || !f.issuerId || !MONTH_RE.test(f.fromMonth) || !numbersOk}
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {data.profiles.length === 0 ? (
        <PanelMessage className="py-8">Todavía no hay regímenes.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Emisor</Th>
              <Th>Desde</Th>
              <Th>Régimen</Th>
              <Th align="right">IGV</Th>
              <Th align="right">Pago mensual</Th>
              <Th>Renta anual</Th>
              <Th>Contador</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.profiles.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{issuerName(p.issuerId)}</Td>
                <Td className="whitespace-nowrap">{monthShort(p.fromMonth)}</Td>
                <Td>
                  {REGIME_LABEL[p.regime]}
                  {p.id === data.currentProfileId ? (
                    <span className="ml-1.5 text-[11px] text-ent-fg-3">vigente</span>
                  ) : null}
                </Td>
                <Td align="right">{pct(p.igvRate)} %</Td>
                <Td align="right">{pct(p.monthlyRate)} %</Td>
                <Td className="text-ent-fg-2">{bracketsLabel(p.annualBrackets)}</Td>
                <Td>
                  <StatusChip
                    tone={p.validatedByAccountant ? "ok" : "warn"}
                    title={p.validatedAt ? `Validado el ${p.validatedAt.slice(0, 10)}` : undefined}
                  >
                    {p.validatedByAccountant ? "Validado" : "Sin validar"}
                  </StatusChip>
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Editar régimen"
                    onClick={() => open(p)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Eliminar régimen"
                    onClick={() => remove(p)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/* ───────────────────────── UIT ───────────────────────── */

function UitPanel({ data, onData }: { data: CompanyData; onData: (d: CompanyData) => void }) {
  const [year, setYear] = useState(data.month.slice(0, 4))
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      onData(
        await call("PUT", "/api/admin/finance/uit", { year: Number(year), value: Number(value) }),
      )
      toast.success(`UIT ${year} guardada`)
      setValue("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHeader title="UIT por año" />
      <div className="px-3 py-2.5 flex items-end gap-2 flex-wrap border-b border-ent-line">
        <div className="space-y-1">
          <Label className="text-xs">Año</Label>
          <Input
            className="w-24"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor (S/)</Label>
          <Input
            className="w-32"
            type="number"
            step="0.01"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-9"
          disabled={busy || year.length !== 4 || !(Number(value) > 0)}
          onClick={save}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
        </Button>
        <span className="text-[12px] text-ent-fg-3">
          El valor oficial lo publica el MEF cada año; si ya existe, se reemplaza.
        </span>
      </div>
      {data.uit.length === 0 ? (
        <PanelMessage className="py-6">Todavía no hay valores de UIT.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Año</Th>
              <Th align="right">UIT</Th>
            </tr>
          </thead>
          <tbody>
            {data.uit.map((u) => (
              <Tr key={u.year}>
                <Td>{u.year}</Td>
                <Td align="right">
                  S/ {u.value.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}
