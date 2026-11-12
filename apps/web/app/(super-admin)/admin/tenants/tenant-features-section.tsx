"use client"

import type { TenantFeatures } from "@cuik/shared/validators"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { refreshTenantPasses } from "../pases/actions"

type Features = Required<TenantFeatures>

type BoolKey = { [K in keyof Features]: Features[K] extends boolean ? K : never }[keyof Features]

const ITEMS: { key: BoolKey; title: string; detail: string }[] = [
  {
    key: "adminCashier",
    title: "Modo cajero para administradores",
    detail:
      "El dueño y los administradores del comercio ven “Cajero” en su menú (Escanear, Buscar e Historial) para atender en caja sin otra cuenta.",
  },
  {
    key: "growth",
    title: "Growth",
    detail:
      "Audiencias, envíos por WhatsApp y ventas atribuidas sobre las ventas del punto de venta. Necesita el conector POS; las reglas y los términos se fijan en Growth › Reglas por comercio.",
  },
]

/**
 * Features only Cuik can turn on for a tenant (tenants.features). All off by
 * default; the merchant sees the effect but cannot change them.
 */
export function TenantFeaturesSection({ tenantId }: { tenantId: string }) {
  const [features, setFeatures] = useState<Features | null>(null)
  const [saving, setSaving] = useState<keyof Features | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/tenants/${tenantId}/features`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setFeatures(json.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tenantId])

  async function save(key: keyof Features, value: Features[keyof Features]): Promise<boolean> {
    setSaving(key)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo guardar")
        return false
      }
      setFeatures(json.data)
      return true
    } catch {
      toast.error("Error de conexión")
      return false
    } finally {
      setSaving(null)
    }
  }

  async function toggle(key: BoolKey, value: boolean) {
    if (await save(key, value)) toast.success(value ? "Activado" : "Desactivado")
  }

  async function changeBarcode(value: Features["barcodeFormat"]) {
    if (!features || value === features.barcodeFormat) return
    const ok = window.confirm(
      value === "code128"
        ? "¿Cambiar a código de barras? Se actualizan todos los pases del comercio (iPhone y Android). En Apple Watch se sigue viendo el QR."
        : "¿Volver al código QR? Se actualizan todos los pases del comercio.",
    )
    if (!ok || !(await save("barcodeFormat", value))) return
    setSaving("barcodeFormat")
    const r = await refreshTenantPasses(tenantId)
    setSaving(null)
    if (r.success) toast.success("Guardado. Los pases se están actualizando.")
    else toast.error(`Guardado, pero no se pudieron actualizar los pases: ${r.error}`)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
        Accesos del comercio
      </p>
      <div className="rounded-[4px] border border-ent-line divide-y divide-ent-line">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ent-fg">{item.title}</div>
              <div className="text-[11.5px] text-ent-fg-3 leading-snug mt-0.5">{item.detail}</div>
            </div>
            {features === null || saving === item.key ? (
              <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-ent-fg-3" />
            ) : (
              <Switch
                checked={features[item.key]}
                onCheckedChange={(v) => void toggle(item.key, v)}
                aria-label={item.title}
              />
            )}
          </div>
        ))}
        <div className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ent-fg">Código del pase</div>
            <div className="text-[11.5px] text-ent-fg-3 leading-snug mt-0.5">
              Código de barras para tiendas con pistola lectora: más rápido en caja. Al cambiarlo se
              actualizan todos los pases; el Apple Watch sigue mostrando el QR.
            </div>
          </div>
          {features === null || saving === "barcodeFormat" ? (
            <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-ent-fg-3" />
          ) : (
            <Select
              value={features.barcodeFormat}
              onValueChange={(v) => void changeBarcode(v as Features["barcodeFormat"])}
            >
              <SelectTrigger className="h-8 w-[170px] text-[12.5px]" aria-label="Código del pase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qr">Código QR</SelectItem>
                <SelectItem value="code128">Código de barras</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  )
}
