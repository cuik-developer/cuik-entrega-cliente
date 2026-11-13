"use client"

import { isValidRuc } from "@cuik/shared/validators"
import { Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type Fiscal = {
  ruc: string | null
  razonSocial: string | null
  direccionFiscal: string | null
  billingEmail: string | null
  isRetentionAgent: boolean
}
type Form = {
  ruc: string
  razonSocial: string
  direccionFiscal: string
  billingEmail: string
  isRetentionAgent: boolean
}

const formFrom = (f: Fiscal | null): Form => ({
  ruc: f?.ruc ?? "",
  razonSocial: f?.razonSocial ?? "",
  direccionFiscal: f?.direccionFiscal ?? "",
  billingEmail: f?.billingEmail ?? "",
  isRetentionAgent: f?.isRetentionAgent ?? false,
})

/**
 * "Datos de facturación" in Comercios › tenant › Datos del negocio: the
 * merchant's billing identity (RUC, razón social, dirección fiscal, invoice
 * e-mail) next to its phone and contact e-mail. Same row as the Facturación
 * tab (`tenant_billing`), saved through its own endpoint so neither form
 * overwrites the other.
 */
export function TenantFiscalSection({
  tenantId,
  onSaved,
}: {
  tenantId: string
  onSaved?: () => void
}) {
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/fiscal`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setForm(formFrom(json.data))
      setSaved(formFrom(json.data))
    } catch {
      toast.error("No se pudieron cargar los datos de facturación")
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  if (!form) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-ent-fg-3" />
      </div>
    )
  }

  const ruc = form.ruc.trim()
  const rucError =
    ruc === ""
      ? null
      : ruc.length !== 11
        ? "El RUC tiene 11 dígitos"
        : isValidRuc(ruc)
          ? null
          : "RUC inválido: revisa los dígitos"
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/fiscal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const fe = json.details?.fieldErrors as Record<string, string[]> | undefined
        toast.error((fe && Object.values(fe)[0]?.[0]) ?? json.error ?? "No se pudo guardar")
        return
      }
      setForm(formFrom(json.data))
      setSaved(formFrom(json.data))
      toast.success("Datos de facturación guardados")
      onSaved?.()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value })

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">
          Datos de facturación
        </h3>
        <p className="text-[12px] text-ent-fg-3 mt-0.5">
          A nombre de quién se emiten las facturas de Cuik a este comercio.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fiscal-ruc" className="text-xs font-medium text-ent-fg-2">
            RUC
          </Label>
          <Input
            id="fiscal-ruc"
            value={form.ruc}
            inputMode="numeric"
            maxLength={11}
            onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))}
            placeholder="20123456789"
            className="h-9 text-sm"
            aria-invalid={rucError ? true : undefined}
          />
          {rucError && <p className="text-[11.5px] text-ent-bad">{rucError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fiscal-razon" className="text-xs font-medium text-ent-fg-2">
            Razón social
          </Label>
          <Input
            id="fiscal-razon"
            value={form.razonSocial}
            onChange={(e) => set("razonSocial", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-direccion" className="text-xs font-medium text-ent-fg-2">
            Dirección fiscal
          </Label>
          <Input
            id="fiscal-direccion"
            value={form.direccionFiscal}
            onChange={(e) => set("direccionFiscal", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fiscal-email" className="text-xs font-medium text-ent-fg-2">
            Correo para facturas
          </Label>
          <Input
            id="fiscal-email"
            type="email"
            value={form.billingEmail}
            onChange={(e) => set("billingEmail", e.target.value)}
            className="h-9 text-sm"
            placeholder="facturas@negocio.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ent-fg-2">Agente de retención del IGV</Label>
          <div className="flex items-center gap-2 h-9">
            <Switch
              checked={form.isRetentionAgent}
              onCheckedChange={(v) => set("isRetentionAgent", v)}
            />
            <span className="text-[12.5px] text-ent-fg-2">
              {form.isRetentionAgent ? "Sí: retiene 3 % en facturas de más de S/ 700" : "No"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 text-[12px] gap-1.5"
          onClick={save}
          disabled={saving || !dirty || rucError !== null}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Guardar datos de facturación
        </Button>
      </div>
    </div>
  )
}
