"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FieldList } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUDIENCES } from "@/lib/growth/audiences"
import { fmtDayYear } from "@/lib/growth/labels"
import { DEFAULT_RULES, type GrowthRules } from "@/lib/growth/rules"

const labelClass = "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3"

type NumKey =
  | "cooldownDays"
  | "maxEarlyDays"
  | "minPurchases"
  | "riskFactor"
  | "attributionDays"
  | "controlPct"
  | "minControl"
  | "feeFixed"
  | "pilotMonths"

const NUM_FIELDS: { key: NumKey; label: string; hint: string; step?: string }[] = [
  {
    key: "cooldownDays",
    label: "Cooldown (días)",
    hint: "Sin volver a sugerir a un contactado. Cuik: 14 · rango 3–60.",
  },
  {
    key: "maxEarlyDays",
    label: "Adelanto máximo (días)",
    hint: "Sobre la fecha esperada. Cuik: 7 · rango 0–14.",
  },
  {
    key: "minPurchases",
    label: "Mínimo de compras",
    hint: "Para usar su propio intervalo. Cuik: 3.",
  },
  {
    key: "riskFactor",
    label: "Factor “En riesgo” (×)",
    hint: "Más de esto × su intervalo sin comprar. Cuik: 1.5 · rango 1.2–3.",
    step: "0.1",
  },
  {
    key: "attributionDays",
    label: "Ventana de atribución (días)",
    hint: "Desde el check “Enviado”. Cuik: 10 · rango 3–30.",
    step: "1",
  },
  {
    key: "controlPct",
    label: "Grupo de control (%)",
    hint: "De cada envío, sorteado al crear. Cuik: 10 · rango 0–30.",
  },
  {
    key: "minControl",
    label: "Mínimo en control",
    hint: "Menos que esto = resultado orientativo. Cuik: 30.",
  },
  { key: "feeFixed", label: "Fijo mensual (S/)", hint: "Cuik: 199." },
  {
    key: "pilotMonths",
    label: "Piloto (meses)",
    hint: "Meses sin cobro si no hay resultados. Cuik: 2.",
  },
]

type Form = Record<NumKey, string> & {
  feeVariablePct: string
  startsOn: string
  audiencesOff: string[]
}

function formFrom(r: GrowthRules): Form {
  return {
    cooldownDays: String(r.cooldownDays),
    maxEarlyDays: String(r.maxEarlyDays),
    minPurchases: String(r.minPurchases),
    riskFactor: String(r.riskFactor),
    attributionDays: String(r.attributionDays),
    controlPct: String(r.controlPct),
    minControl: String(r.minControl),
    feeFixed: String(r.feeFixed),
    pilotMonths: String(r.pilotMonths),
    feeVariablePct: r.feeVariablePct == null ? "" : String(r.feeVariablePct),
    startsOn: r.startsOn ?? "",
    audiencesOff: r.audiencesOff,
  }
}

/**
 * Super-admin › tenant › General: Growth rules and terms for this tenant
 * (what decides whom to suggest, when, how a sale is attributed and what is
 * billed). The merchant reads them in its panel and cannot edit them.
 */
export function TenantGrowthSection({ tenantId }: { tenantId: string }) {
  const [rules, setRules] = useState<GrowthRules | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(formFrom(DEFAULT_RULES))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/tenants/${tenantId}/growth`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setRules(json.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tenantId])

  function edit() {
    if (rules) setForm(formFrom(rules))
    setOpen(true)
  }

  async function save() {
    const body: Record<string, unknown> = {}
    for (const f of NUM_FIELDS) {
      const n = Number(form[f.key])
      if (form[f.key].trim() === "" || Number.isNaN(n)) {
        toast.error(`${f.label}: número inválido`)
        return
      }
      body[f.key] = n
    }
    body.feeVariablePct = form.feeVariablePct.trim() === "" ? null : Number(form.feeVariablePct)
    body.startsOn = form.startsOn || null
    body.audiencesOff = form.audiencesOff
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/growth`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo guardar")
        return
      }
      setRules(json.data)
      setOpen(false)
      toast.success("Reglas guardadas")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setSaving(false)
    }
  }

  const r = rules
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
          Growth · reglas y términos
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[12px]"
          onClick={edit}
          disabled={!r}
        >
          Editar
        </Button>
      </div>
      <div className="rounded-[4px] border border-ent-line px-3">
        {!r ? (
          <div className="py-3">
            <Loader2 className="w-4 h-4 animate-spin text-ent-fg-3" />
          </div>
        ) : (
          <FieldList
            rows={[
              {
                label: "Términos",
                value: `S/ ${r.feeFixed} fijo${r.feeVariablePct != null ? ` + ${r.feeVariablePct} % sobre venta atribuida` : " · sin variable"} · piloto ${r.pilotMonths} ${r.pilotMonths === 1 ? "mes" : "meses"}${r.startsOn ? ` desde el ${fmtDayYear(r.startsOn)}` : " · sin fecha de inicio"}`,
              },
              {
                label: "Cooldown",
                value: `${r.cooldownDays} días sin volver a sugerir a un cliente contactado`,
              },
              {
                label: "Momento",
                value: `Día habitual antes de la fecha esperada · máx. ${r.maxEarlyDays} días antes · mínimo ${r.minPurchases} compras, si no usa el intervalo de su categoría`,
              },
              { label: "En riesgo", value: `Más de ${r.riskFactor} × su intervalo sin comprar` },
              {
                label: "Atribución",
                value: `${r.attributionDays} días desde el check “Enviado” · control ${r.controlPct} % · mínimo ${r.minControl} en control`,
              },
              {
                label: "Audiencias apagadas",
                value:
                  r.audiencesOff.length === 0
                    ? "Ninguna"
                    : r.audiencesOff
                        .map((s) => AUDIENCES.find((a) => a.slug === s)?.name ?? s)
                        .join(", "),
              },
            ]}
          />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Growth · reglas y términos</DialogTitle>
            <DialogDescription>
              Lo que decide a quién se sugiere, cuándo, cómo se atribuye la venta y cuánto se
              factura. El comercio ve estos valores y no los edita.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {NUM_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className={labelClass}>{f.label}</Label>
                <Input
                  type="number"
                  step={f.step ?? "1"}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-8 text-[12.5px]"
                />
                <div className="text-[11px] text-ent-fg-3">{f.hint}</div>
              </div>
            ))}
            <div className="space-y-1">
              <Label className={labelClass}>Variable sobre venta atribuida (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={form.feeVariablePct}
                onChange={(e) => setForm({ ...form, feeVariablePct: e.target.value })}
                placeholder="vacío = sin variable"
                className="h-8 text-[12.5px]"
              />
              <div className="text-[11px] text-ent-fg-3">
                Abierto por comercio. Se calcula cada mes sobre los tickets atribuidos por fecha de
                venta.
              </div>
            </div>
            <div className="space-y-1">
              <Label className={labelClass}>Inicio del servicio</Label>
              <Input
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                className="h-8 text-[12.5px]"
              />
              <div className="text-[11px] text-ent-fg-3">
                Desde aquí cuentan los meses de piloto.
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Audiencias habilitadas</Label>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {AUDIENCES.map((a) => {
                const off = form.audiencesOff.includes(a.slug)
                return (
                  <div key={a.slug} className="flex items-center gap-2 text-[12.5px]">
                    <Checkbox
                      id={`aud-${a.slug}`}
                      checked={!off}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          audiencesOff: v
                            ? form.audiencesOff.filter((s) => s !== a.slug)
                            : [...form.audiencesOff, a.slug],
                        })
                      }
                    />
                    <Label htmlFor={`aud-${a.slug}`} className="text-[12.5px] font-normal">
                      {a.name}
                    </Label>
                  </div>
                )
              })}
            </div>
            <div className="text-[11px] text-ent-fg-3">
              Una audiencia apagada deja de calcularse para este comercio desde la próxima noche.
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm(
                  formFrom({
                    ...DEFAULT_RULES,
                    feeVariablePct: rules?.feeVariablePct ?? null,
                    startsOn: rules?.startsOn ?? null,
                  }),
                )
              }
              disabled={saving}
            >
              Volver a los valores de Cuik
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
