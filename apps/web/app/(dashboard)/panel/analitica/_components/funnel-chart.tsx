"use client"

import type { FunnelData, FunnelStepKey } from "@cuik/shared/types/analytics"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"

const STEP_META: Record<FunnelStepKey, { label: string; hint: string }> = {
  registered: { label: "Registrados", hint: "Clientes en tu base (sin bloqueados)" },
  visited: { label: "Visitaron al menos 1 vez", hint: "Tienen una visita registrada" },
  loyal: { label: "Visitaron 3+ veces", hint: "Ya son clientes recurrentes" },
  redeemed: { label: "Canjearon un premio", hint: "Completaron un ciclo y lo cobraron" },
}

const POINTS_REDEEMED = {
  label: "Canjearon puntos",
  hint: "Cambiaron puntos por un premio del catálogo",
}

type Props = {
  data: FunnelData
  programType?: "stamps" | "points" | null
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

const ORDER: FunnelStepKey[] = ["registered", "visited", "loyal", "redeemed"]

export function FunnelChart({ data, programType }: Props) {
  const steps = [...data.steps].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
  const base = steps[0]?.count ?? 0

  return (
    <Panel>
      <PanelHeader
        title="Embudo de fidelización"
        actions={<span className="text-[11.5px] text-ent-fg-3">Histórico · todo el comercio</span>}
      />
      {base === 0 ? (
        <PanelMessage>Aún no tenés clientes registrados.</PanelMessage>
      ) : (
        <ol className="p-3 space-y-2.5">
          {steps.map((step, i) => {
            const meta =
              step.key === "redeemed" && programType === "points"
                ? POINTS_REDEEMED
                : STEP_META[step.key]
            const width = Math.max(pct(step.count, base), step.count > 0 ? 2 : 0)
            // Step-over-step conversion; hidden when the previous step is empty.
            const prev = i > 0 ? steps[i - 1].count : 0
            const conversion = prev > 0 ? pct(step.count, prev) : null
            return (
              <li key={step.key} title={meta.hint}>
                <div className="flex items-baseline justify-between gap-3 text-[12px] mb-1">
                  <span className="text-ent-fg-2 truncate">{meta.label}</span>
                  <span className="tabular-nums text-ent-fg-3 shrink-0">
                    <span className="font-semibold text-ent-fg">
                      {step.count.toLocaleString("es-PE")}
                    </span>
                    {" · "}
                    {pct(step.count, base)}%
                    {conversion !== null && (
                      <span className="ml-2 text-[11px]">({conversion}% del paso anterior)</span>
                    )}
                  </span>
                </div>
                <div className="h-3.5 w-full rounded-[2px] bg-ent-panel-2 overflow-hidden">
                  <div
                    className="h-full rounded-[2px] transition-[width]"
                    style={{
                      width: `${width}%`,
                      backgroundColor: `color-mix(in srgb, var(--color-ent-accent) ${100 - i * 18}%, transparent)`,
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
