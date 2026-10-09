"use client"

import { Loader2 } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Crumbs } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { PlanSelectionModal } from "../plan-selection-modal"
import { TenantDetail } from "../tenant-detail"
import { type ApiTenant, type PlanModalAction, patchTenant } from "../tenant-shared"

const VALID_TABS = new Set([
  "general",
  "promocion",
  "registro",
  "segmentacion",
  "campanas",
  "apple",
  "facturacion",
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
  // Frozen at mount: the URL is cleaned below before the tenant finishes loading.
  const [initialTab] = useState(forcedTab)

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
  const tenantRef = useRef<ApiTenant | null>(null)
  tenantRef.current = tenant
  const load = useCallback(async () => {
    const hadTenant = tenantRef.current !== null
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
  }, [id])

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
    <div className="space-y-2">
      <Crumbs
        items={[
          { label: "Inicio", href: "/admin/tenants" },
          { label: "Tenants", href: "/admin/tenants" },
          { label: tenant?.name ?? "Tenant" },
        ]}
      />

      {error ? (
        <div className="bg-white rounded-[4px] border border-ent-line p-8 text-center text-sm text-ent-fg-3 space-y-3">
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
          <Loader2 className="w-6 h-6 animate-spin text-ent-fg-3" />
        </div>
      ) : (
        <TenantDetail
          key={tenant.id}
          tenant={tenant}
          defaultTab={initialTab ?? "general"}
          forceTab={initialTab !== null}
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
