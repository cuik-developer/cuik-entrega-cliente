"use client"

import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ApiPlan, PlanModalAction } from "./tenant-shared"

/* ────────────────────────────────────────────────────────────
   Plan Selection Modal — fetches real plans from API
   ──────────────────────────────────────────────────────────── */
export function PlanSelectionModal({
  tenantName,
  currentPlanId,
  action,
  onClose,
  onConfirm,
}: {
  tenantName: string
  currentPlanId: string | null
  action: PlanModalAction
  onClose: () => void
  /** Resolves false when the change was rejected (modal stays open, button re-enabled). */
  onConfirm: (planId: string) => Promise<boolean> | boolean | undefined
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [plans, setPlans] = useState<ApiPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setLoadingPlans(true)
    setPlansError(null)
    fetch("/api/admin/plans")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json()
      })
      .then((json) => {
        setPlans(json.data)
      })
      .catch((err) => {
        setPlansError(err instanceof Error ? err.message : "Error al cargar planes")
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [])

  const title =
    action === "activate"
      ? "Activar con Plan"
      : action === "change"
        ? "Cambiar Plan"
        : "Reactivar con Plan"

  const handleConfirm = async () => {
    if (!selectedPlan) return
    setConfirming(true)
    try {
      const ok = await onConfirm(selectedPlan)
      if (ok === false) setConfirming(false)
    } catch {
      setConfirming(false)
    }
  }

  const isChangePlan = action === "change"

  return (
    // biome-ignore lint/a11y/useSemanticElements: modal backdrop overlay requires div for click-to-dismiss
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div
        role="dialog"
        className="bg-white rounded-[4px] w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-ent-line">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-ent-fg">{title}</h3>
              <p className="text-sm text-ent-fg-3">
                Selecciona un plan para <strong>{tenantName}</strong>
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-ent-fg-3 hover:text-ent-fg-2">
              &#10005;
            </button>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-ent-fg-3" />
              <span className="ml-2 text-sm text-ent-fg-3">Cargando planes...</span>
            </div>
          ) : plansError ? (
            <div className="text-center py-8">
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">{plansError}</p>
            </div>
          ) : (
            plans.map((plan) => {
              const isCurrent = isChangePlan && plan.id === currentPlanId
              return (
                <button
                  type="button"
                  key={plan.id}
                  onClick={() => !isCurrent && setSelectedPlan(plan.id)}
                  disabled={isCurrent}
                  className={`w-full text-left rounded-[4px] p-4 border-2 transition-colors ${
                    isCurrent
                      ? "border-ent-line bg-ent-panel-2 opacity-60 cursor-not-allowed"
                      : selectedPlan === plan.id
                        ? "border-ent-accent bg-ent-accent-soft"
                        : "border-ent-line hover:border-ent-line-strong"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ent-fg">{plan.name}</span>
                      {isCurrent && (
                        <Badge className="text-[10px] bg-slate-200 text-ent-fg-2 border-0">
                          Plan actual
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-ent-fg-3">
                    {plan.maxClients.toLocaleString()} clientes, {plan.maxLocations} locales,{" "}
                    {plan.maxPromos} promos
                  </p>
                </button>
              )
            })
          )}
        </div>
        <div className="p-6 pt-0 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            disabled={!selectedPlan || loadingPlans || confirming}
            onClick={handleConfirm}
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}
