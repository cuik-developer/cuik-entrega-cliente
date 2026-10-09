"use client"

import { describePointsRate, expirationPolicySchema } from "@cuik/shared/validators"
import { CheckCircle2, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FieldList } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { activeTimeLabel, formatYmd, todayYmd } from "@/lib/admin/billing"
import { describeExpirationPolicy } from "@/lib/loyalty/expiration"
import { type ApiTenant, patchTenant, type TenantPromotion } from "./tenant-shared"

export type CatalogSummaryItem = { name: string; pointsCost: number }

/* ── Program description (pure) ───────────────────────────────────── */

type ProgramRows = {
  type: string
  target: string
  expiration: string
  rewards: string
}

function policyText(raw: unknown): string {
  const parsed = expirationPolicySchema.safeParse(raw ?? { mode: "never" })
  if (!parsed.success || parsed.data.mode === "never") return "No"
  return `Sí · ${describeExpirationPolicy(parsed.data).toLowerCase()}`
}

/** What the active program offers, in the words of the Resumen tab. */
export function describeProgram(
  promo: TenantPromotion,
  catalog: CatalogSummaryItem[],
): ProgramRows {
  const cfg = (promo.config ?? {}) as {
    stamps?: { stampsExpiration?: unknown }
    points?: { pointsExpiration?: unknown }
  }
  if (promo.type === "points") {
    const costs = catalog.map((c) => c.pointsCost).filter((c) => c > 0)
    const minCost = costs.length ? Math.min(...costs) : null
    return {
      type: "Puntos",
      target: [
        describePointsRate((cfg.points ?? {}) as Parameters<typeof describePointsRate>[0]),
        minCost !== null ? `premios desde ${minCost} puntos` : "sin premios en el catálogo",
      ].join(" · "),
      expiration: policyText(cfg.points?.pointsExpiration),
      rewards: catalog.length
        ? catalog.map((c) => `${c.name} (${c.pointsCost} pts)`).join(", ")
        : "Sin premios en el catálogo",
    }
  }
  return {
    type: "Sellos",
    target: promo.maxVisits ? `${promo.maxVisits} visitas` : "—",
    expiration: policyText(cfg.stamps?.stampsExpiration),
    rewards: promo.rewardValue?.trim() || "—",
  }
}

/* ── Trial end, editable in place ─────────────────────────────────── */

function ymdOf(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // Shown in the platform timezone, same as the formatted date next to it.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function TrialEndEditor({ tenant, onSaved }: { tenant: ApiTenant; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(ymdOf(tenant.trialEndsAt))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toast.error("Elige una fecha")
      return
    }
    setSaving(true)
    // End of that day in Lima: the demo is usable the whole day.
    const result = await patchTenant(tenant.id, {
      trialEndsAt: new Date(`${value}T23:59:59.000-05:00`).toISOString(),
    })
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar la fecha")
      return
    }
    toast.success("Fecha de la demo actualizada")
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    const current = tenant.trialEndsAt ? formatYmd(ymdOf(tenant.trialEndsAt)) : "—"
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{current}</span>
        <button
          type="button"
          className="text-[12px] text-ent-accent hover:underline"
          onClick={() => {
            setValue(ymdOf(tenant.trialEndsAt) || todayYmd())
            setEditing(true)
          }}
        >
          Cambiar
        </button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Nueva fecha de fin de la demo"
        className="h-7 px-2 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"
      />
      <Button size="sm" className="h-7 text-[12px]" onClick={save} disabled={saving}>
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3 h-3" />
        )}
        Guardar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[12px]"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        Cancelar
      </Button>
    </span>
  )
}

/* ── Resumen block ────────────────────────────────────────────────── */

export function TenantProgramSummary({
  tenant,
  promotions,
  promotionsLoading,
  catalog,
  onOpenTab,
  onSaved,
}: {
  tenant: ApiTenant
  promotions: TenantPromotion[]
  promotionsLoading: boolean
  catalog: CatalogSummaryItem[]
  onOpenTab: (tab: string) => void
  onSaved: () => void
}) {
  const active = promotions.filter((p) => p.active)
  const program = active[0] ? describeProgram(active[0], catalog) : null
  const serviceStart = tenant.billing?.serviceStartOn ?? null
  const today = todayYmd()
  const link = (tab: string, label: string) => (
    <button
      type="button"
      onClick={() => onOpenTab(tab)}
      className="text-[12px] text-ent-accent hover:underline"
    >
      {label}
    </button>
  )

  const programRows = promotionsLoading
    ? [{ label: "Tipo de fidelización", value: "Cargando…" }]
    : program
      ? [
          {
            label: "Tipo de fidelización",
            value: (
              <span className="inline-flex items-center gap-2 flex-wrap">
                {program.type}
                {active.length > 1 && (
                  <span className="text-ent-warn text-[12px]">+{active.length - 1} activas</span>
                )}
                {link("promocion", "Ver programa")}
              </span>
            ),
          },
          {
            label: program.type === "Puntos" ? "Puntos" : "Visitas para premio",
            value: program.target,
          },
          { label: "Vencimiento", value: program.expiration },
          { label: "Premios", value: program.rewards },
        ]
      : [
          {
            label: "Tipo de fidelización",
            value: (
              <span className="inline-flex items-center gap-2">
                <span className="text-ent-warn">Sin programa activo</span>
                {link("promocion", "Configurar")}
              </span>
            ),
          },
        ]

  const rows = [
    { label: "Plan actual", value: tenant.planName ?? "Sin plan" },
    ...programRows,
    {
      label: "Inicio de servicios",
      value: serviceStart ? (
        formatYmd(serviceStart)
      ) : (
        <span className="inline-flex items-center gap-2">
          <span className="text-ent-fg-3">Sin configurar</span>
          {link("facturacion", "Configurar en Facturación")}
        </span>
      ),
    },
    {
      label: "Tiempo activo",
      value: serviceStart ? activeTimeLabel(serviceStart, today) : "—",
    },
    {
      label: "Demo expira",
      value: (
        <TrialEndEditor key={tenant.trialEndsAt ?? "none"} tenant={tenant} onSaved={onSaved} />
      ),
    },
    { label: "Slug", value: <span className="font-mono text-[12px]">{tenant.slug}</span> },
  ]

  return (
    <div className="border border-ent-line rounded-[4px] px-3">
      <FieldList rows={rows} />
    </div>
  )
}
