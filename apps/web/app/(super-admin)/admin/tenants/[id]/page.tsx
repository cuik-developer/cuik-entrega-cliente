"use client"

import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PlanSelectionModal } from "../plan-selection-modal"
import { TenantDetail } from "../tenant-detail"
import { type ApiTenant, type PlanModalAction, patchTenant } from "../tenant-shared"

const VALID_TABS = new Set([
  "general",
  "promocion",
  "registro",
  "segmentacion",
  "apple",
  "notas",
  "editar",
])

/**
 * Full page for one tenant (super-admin). `?tab=` deep-links a section
 * (used by the list's pencil / shield shortcuts); otherwise the section
 * remembered for this tenant in the session is opened.
 */
export default function TenantPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const tabParam = search.get("tab")
  const forcedTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : null

  const [tenant, setTenant] = useState<ApiTenant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planModal, setPlanModal] = useState<{
    tenantId: string
    tenantName: string
    currentPlanId: string | null
    action: PlanModalAction
  } | null>(null)

  // Refetch after an action must never blank a page that is already showing
  // the tenant: a failed refresh is a toast, only the first load can error out.
  const load = useCallback(async () => {
    const hadTenant = tenant !== null
    try {
      const res = await fetch(`/api/admin/tenants/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (hadTenant) {
          toast.error(json.error ?? "No se pudo actualizar la información del tenant")
          return
        }
        setError(
          res.status === 404 ? "Este tenant no existe." : (json.error ?? "No se pudo cargar"),
        )
        return
      }
      setTenant(json.data)
    } catch {
      if (hadTenant) toast.error("Error de conexión al actualizar")
      else setError("Error de conexión")
    }
  }, [id, tenant])

  // The forced section is applied once at mount; drop it from the URL so a
  // reload or back/forward respects the section the user picked afterwards.
  useEffect(() => {
    if (forcedTab) router.replace(`/admin/tenants/${id}`)
  }, [forcedTab, id, router])

  useEffect(() => {
    load()
  }, [load])

  async function handlePlanConfirm(planId: string): Promise<boolean> {
    if (!planModal) return false
    const payload: Record<string, unknown> = { planId }
    if (planModal.action === "activate" || planModal.action === "reactivate") {
      payload.status = "active"
    }
    const result = await patchTenant(planModal.tenantId, payload)
    if (result.ok) {
      toast.success(`"${planModal.tenantName}" actualizado correctamente`)
      setPlanModal(null)
      load()
      return true
    }
    toast.error(result.error ?? "Error al actualizar tenant")
    return false
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs -ml-2">
        <Link href="/admin/tenants">
          <ArrowLeft className="w-3.5 h-3.5" /> Tenants
        </Link>
      </Button>

      {error ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500 space-y-3">
          <p>{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null)
              load()
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : !tenant ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <TenantDetail
          key={tenant.id}
          tenant={tenant}
          defaultTab={forcedTab ?? "general"}
          forceTab={forcedTab !== null}
          onActionComplete={load}
          onOpenPlanModal={(tenantId, action) =>
            setPlanModal({
              tenantId,
              tenantName: tenant.name,
              currentPlanId: tenant.planId,
              action,
            })
          }
        />
      )}

      {planModal && (
        <PlanSelectionModal
          tenantName={planModal.tenantName}
          currentPlanId={planModal.currentPlanId}
          action={planModal.action}
          onClose={() => setPlanModal(null)}
          onConfirm={handlePlanConfirm}
        />
      )}
    </div>
  )
}
