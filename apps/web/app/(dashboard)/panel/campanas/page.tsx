"use client"

import type { CreateCampaignInput } from "@cuik/shared/validators"
import { Loader2, Plus } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Notice, PageHeader, PanelMessage } from "@/components/admin/enterprise"
import { PANEL_DEEP_LINK_EVENT } from "@/components/panel/command-search"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"

import { CampaignList } from "./_components/campaign-list"
import { ChurnPreventionCard } from "./_components/churn-prevention-card"
import { CreateCampaignForm } from "./_components/create-campaign-form"

/**
 * Merchant "Campañas": the list of sends, creation and detail. Everything
 * that is configured once and runs by itself (cumpleaños, puntos por vencer,
 * recurrentes, reportes por correo) lives in Configuración → Campañas
 * automáticas; the notice below points there.
 */
export default function CampanasPage() {
  const { tenantSlug, isLoading, error, readOnly } = useTenant()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [initialValues, setInitialValues] = useState<Partial<CreateCampaignInput> | null>(null)

  const handleCampaignCreated = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  // From Impacto: /panel/campanas?impacto=enfriados opens the form with the
  // card holders whose frequency broke, as a fixed list (snapshot of the corte).
  useEffect(() => {
    if (!tenantSlug) return
    if (new URLSearchParams(window.location.search).get("impacto") !== "enfriados") return
    window.history.replaceState(null, "", "/panel/campanas")
    let cancelled = false
    fetch(`/api/${tenantSlug}/impact/segment?kind=broken`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const ids: string[] = json.success ? json.data.clientIds : []
        if (ids.length === 0) {
          toast.error(
            "El último corte de Impacto no tiene clientes con tarjeta que se hayan enfriado",
          )
          return
        }
        setInitialValues({
          name: `Recuperación · clientes que se enfriaron (${ids.length})`,
          type: "push",
          segment: { clientIds: ids },
        })
        setShowCreateDialog(true)
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo leer el corte de Impacto")
      })
    return () => {
      cancelled = true
    }
  }, [tenantSlug])

  // Deep link from the panel search: /panel/campanas?nueva=1 opens the form,
  // also when the search is used while already on this page (window event).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nueva") === "1") {
      setShowCreateDialog(true)
      window.history.replaceState(null, "", "/panel/campanas")
    }
    const onDeepLink = (e: Event) => {
      if ((e as CustomEvent<Record<string, string>>).detail?.nueva === "1")
        setShowCreateDialog(true)
    }
    window.addEventListener(PANEL_DEEP_LINK_EVENT, onDeepLink)
    return () => window.removeEventListener(PANEL_DEEP_LINK_EVENT, onDeepLink)
  }, [])

  if (isLoading) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  if (error || !tenantSlug) {
    return <PanelMessage className="py-20">{error ?? "Sin comercio asignado"}</PanelMessage>
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/panel" }, { label: "Campañas" }]}
        title="Campañas"
        subtitle="Mensajes a tus clientes a través del pase. Haz clic en una fila para ver el detalle."
        actions={
          <Button
            size="sm"
            className="h-7 text-[12px] gap-1.5"
            onClick={() => setShowCreateDialog(true)}
            disabled={readOnly}
            title={readOnly ? "Solo lectura" : undefined}
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva campaña
          </Button>
        }
      />

      <Notice
        tone="info"
        action={
          <Link
            href="/panel/campanas/automatizadas"
            className="text-[12px] font-semibold text-ent-accent hover:underline whitespace-nowrap"
          >
            Ir a Automatizadas
          </Link>
        }
      >
        Saludo de cumpleaños, puntos por vencer y campañas recurrentes se configuran en{" "}
        <span className="font-medium">Campañas → Automatizadas</span>; los mensajes por ubicación en{" "}
        <span className="font-medium">Geolocalizadas</span>. Cada envío automático aparece en esta
        lista.
      </Notice>

      <ChurnPreventionCard tenantSlug={tenantSlug} onCampaignSent={handleCampaignCreated} />

      <CampaignList
        tenantSlug={tenantSlug}
        refreshKey={refreshKey}
        onEdit={readOnly ? undefined : setEditId}
      />

      <CreateCampaignForm
        open={showCreateDialog || editId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditId(null)
            setInitialValues(null)
          }
          setShowCreateDialog(open && editId === null)
        }}
        tenantSlug={tenantSlug}
        editId={editId}
        initialValues={initialValues}
        onSuccess={handleCampaignCreated}
      />
    </div>
  )
}
