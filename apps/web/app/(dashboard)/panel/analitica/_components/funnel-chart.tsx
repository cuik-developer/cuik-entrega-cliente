"use client"

import type { FunnelData, FunnelStepKey } from "@cuik/shared/types/analytics"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STEP_META: Record<FunnelStepKey, { label: string; hint: string }> = {
  registered: { label: "Registrados", hint: "Clientes en tu base (sin bloqueados)" },
  visited: { label: "Visitaron al menos 1 vez", hint: "Tienen una visita registrada" },
  loyal: { label: "Visitaron 3+ veces", hint: "Ya son clientes recurrentes" },
  redeemed: { label: "Canjearon un premio", hint: "Completaron un ciclo y lo cobraron" },
}

type Props = {
  data: FunnelData
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

export function FunnelChart({ data }: Props) {
  const steps = data.steps
  const base = steps[0]?.count ?? 0

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">Embudo de fidelización</CardTitle>
        <p className="text-xs text-muted-foreground">
          Histórico · todo el comercio. Cuántos clientes llegan a cada etapa.
        </p>
      </CardHeader>
      <CardContent>
        {base === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aún no tenés clientes registrados.
          </p>
        ) : (
          <ol className="space-y-3">
            {steps.map((step, i) => {
              const meta = STEP_META[step.key]
              const width = Math.max(pct(step.count, base), step.count > 0 ? 3 : 0)
              // Step-over-step conversion; hidden when the previous step is empty.
              const prev = i > 0 ? steps[i - 1].count : 0
              const conversion = prev > 0 ? pct(step.count, prev) : null
              return (
                <li key={step.key} title={meta.hint}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{meta.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-bold text-foreground">{step.count}</span>
                      {" · "}
                      {pct(step.count, base)}%
                      {conversion !== null && (
                        <span className="ml-2 text-[11px]">({conversion}% del paso anterior)</span>
                      )}
                    </span>
                  </div>
                  <div className="h-5 w-full rounded-md bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-md transition-[width]"
                      style={{
                        width: `${width}%`,
                        backgroundColor: `color-mix(in srgb, var(--color-primary) ${100 - i * 15}%, transparent)`,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
