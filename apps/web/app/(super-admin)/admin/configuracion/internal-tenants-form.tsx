"use client"

import { FlaskConical, Loader2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

import { saveInternalTenants } from "./actions"

export type TenantOption = { id: string; name: string; slug: string; status: string }

/** Which tenants are Cuik's own demos: excluded from Métricas unless asked for. */
export function InternalTenantsForm({
  tenants,
  initialIds,
}: {
  tenants: TenantOption[]
  initialIds: string[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds))
  const [saving, startSave] = useTransition()

  function save() {
    startSave(async () => {
      const result = await saveInternalTenants([...selected])
      if (result.success) toast.success("Comercios internos guardados")
      else toast.error(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[4px] bg-ent-panel-2 flex items-center justify-center shrink-0">
          <FlaskConical className="w-4 h-4 text-ent-fg-2" />
        </div>
        <div>
          <h2 className="text-base font-bold text-ent-fg">Comercios internos</h2>
          <p className="text-sm text-ent-fg-3">
            Demos y cuentas de prueba del equipo Cuik. Se excluyen de Métricas (y de su Excel) para
            que los números reflejen solo clientes reales. En Métricas podés incluirlos con un clic
            cuando los necesites.
          </p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p className="text-sm text-ent-fg-3">No hay comercios.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tenants.map((t) => {
            const checked = selected.has(t.id)
            return (
              <li key={t.id}>
                <label
                  className={`flex items-center gap-3 rounded-[4px] border px-3 py-2 text-sm cursor-pointer ${checked ? "border-slate-400 bg-ent-panel-2" : "border-ent-line"}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(selected)
                      if (v) next.add(t.id)
                      else next.delete(t.id)
                      setSelected(next)
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ent-fg truncate">{t.name}</span>
                    <span className="block text-xs text-ent-fg-3">
                      {t.slug} · {t.status === "trial" ? "demo" : t.status}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-xs text-ent-fg-3">
          {selected.size} marcado{selected.size === 1 ? "" : "s"} como interno
          {selected.size === 1 ? "" : "s"}
        </span>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  )
}
