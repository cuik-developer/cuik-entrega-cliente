"use client"

import { Loader2, Plus } from "lucide-react"
import Link from "next/link"
import { useCallback, useState } from "react"

import { Notice, PageHeader, PanelMessage } from "@/components/admin/enterprise"
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

  const handleCampaignCreated = useCallback(() => {
    setRefreshKey((k) => k + 1)
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
          if (!open) setEditId(null)
          setShowCreateDialog(open && editId === null)
        }}
        tenantSlug={tenantSlug}
        editId={editId}
        onSuccess={handleCampaignCreated}
      />
    </div>
  )
}
