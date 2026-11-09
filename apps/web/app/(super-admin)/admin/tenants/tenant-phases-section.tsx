"use client"

import { Flag, Loader2, Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PhaseBaseline, ProgramPhase } from "@/lib/loyalty/program-phases"

function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
}

/** The baseline in one line per block, readable without opening a report. */
function baselineRows(b: PhaseBaseline): { label: string; value: string }[] {
  const rows = [
    {
      label: "Clientes",
      value: `${b.clients.total} activos · ${b.clients.withCardInProgress} con tarjeta en curso${
        b.clients.avgStampsOnCard !== null ? ` · ${b.clients.avgStampsOnCard} sellos promedio` : ""
      }`,
    },
    {
      label: "Visitas",
      value: `${b.visits.last30} en 30 días (${b.visits.uniqueClients30} clientes) · ${b.visits.last90} en 90 días (${b.visits.uniqueClients90} clientes)`,
    },
    {
      label: "Premios",
      value: `${b.rewards.redeemedLast90} canjeados en 90 días · ${b.rewards.pending} pendientes`,
    },
  ]
  if (b.cashback) {
    rows.push({
      label: "Cashback sembrado",
      value: `${b.cashback.seededClients} clientes · S/ ${b.cashback.seededTotal}`,
    })
  }
  return rows
}

/**
 * Program phases ("etapas") of a tenant: dated markers with a baseline
 * snapshot, so the before/after of a change of strategy can be measured
 * without touching the history. Created here by hand, or automatically when
 * the stamps reward switches to cashback.
 */
export function TenantPhasesSection({ tenantId }: { tenantId: string }) {
  const [phases, setPhases] = useState<ProgramPhase[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [startsOn, setStartsOn] = useState(todayYmd())
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/phases`)
      const json = await res.json()
      if (!json.success) throw new Error()
      setPhases(json.data)
    } catch {
      toast.error("No se pudieron cargar las etapas")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!name.trim()) {
      toast.error("Indica el nombre de la etapa")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), startsOn, note: note.trim() || null }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo crear la etapa")
        return
      }
      toast.success("Etapa creada con su línea base")
      setName("")
      setNote("")
      setStartsOn(todayYmd())
      setAdding(false)
      await load()
    } catch {
      toast.error("No se pudo crear la etapa")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
          Etapas del programa
        </p>
        {!adding && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[12px] gap-1"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3 h-3" /> Nueva etapa
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-[4px] border border-ent-line p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1">
              <Label htmlFor="phase-name" className="text-xs">
                Nombre
              </Label>
              <Input
                id="phase-name"
                value={name}
                maxLength={80}
                placeholder="Ej: Cashback 5 % y cajeros por persona"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phase-date" className="text-xs">
                Empieza
              </Label>
              <Input
                id="phase-date"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="phase-note" className="text-xs">
              Nota (qué cambia y por qué)
            </Label>
            <Textarea
              id="phase-note"
              value={note}
              maxLength={2000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-[11.5px] text-ent-fg-3">
            Al guardar se toma la foto de hoy: clientes, tarjetas en curso, visitas de 30 y 90 días,
            premios. Los informes comparan contra esa foto.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[12px]"
              onClick={() => setAdding(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Crear etapa"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3 h-3 animate-spin text-ent-fg-3" />
          <span className="text-xs text-ent-fg-3">Cargando...</span>
        </div>
      ) : phases.length === 0 ? (
        <p className="text-xs text-ent-fg-3">
          Sin etapas. Crea una cuando cambie la estrategia (premio, cajeros, campaña): el antes y el
          después se miden contra su línea base.
        </p>
      ) : (
        <div className="space-y-1.5">
          {phases.map((p) => (
            <div key={p.id} className="rounded-[4px] border border-ent-line bg-ent-panel-2 p-3">
              <button
                type="button"
                className="w-full flex items-start justify-between gap-3 text-left"
                onClick={() => setOpen(open === p.id ? null : p.id)}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Flag className="w-4 h-4 text-ent-accent shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ent-fg">{p.name}</div>
                    <div className="text-[11.5px] text-ent-fg-3">
                      Desde el {fmtDay(p.startsOn)}
                      {p.createdBy.name ? ` · ${p.createdBy.name}` : ""}
                    </div>
                  </div>
                </div>
                <span className="text-[11.5px] text-ent-accent shrink-0">
                  {open === p.id ? "Ocultar" : "Línea base"}
                </span>
              </button>
              {open === p.id && (
                <div className="mt-2 space-y-1.5 border-t border-ent-line pt-2">
                  {p.note && <p className="text-xs text-ent-fg-2 whitespace-pre-wrap">{p.note}</p>}
                  {p.baseline ? (
                    <dl className="grid gap-1 text-xs">
                      {baselineRows(p.baseline).map((r) => (
                        <div key={r.label} className="grid grid-cols-[130px_1fr] gap-2">
                          <dt className="text-ent-fg-3">{r.label}</dt>
                          <dd className="text-ent-fg">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-ent-fg-3">Sin línea base registrada.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
