"use client"

import type { TenantFeatures } from "@cuik/shared/validators"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"

type Features = Required<TenantFeatures>

const ITEMS: { key: keyof Features; title: string; detail: string }[] = [
  {
    key: "adminCashier",
    title: "Modo cajero para administradores",
    detail:
      "El dueño y los administradores del comercio ven “Cajero” en su menú (Escanear, Buscar e Historial) para atender en caja sin otra cuenta.",
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

  async function toggle(key: keyof Features, value: boolean) {
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
        return
      }
      setFeatures(json.data)
      toast.success(value ? "Activado" : "Desactivado")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setSaving(null)
    }
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
      </div>
    </div>
  )
}
