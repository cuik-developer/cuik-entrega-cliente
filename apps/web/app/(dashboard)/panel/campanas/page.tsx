"use client"

import { Megaphone, Plus } from "lucide-react"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"

import { CampaignList } from "./_components/campaign-list"
import { ChurnPreventionCard } from "./_components/churn-prevention-card"
import { CreateCampaignForm } from "./_components/create-campaign-form"

export default function CampanasPage() {
  const { tenantSlug, isLoading, error } = useTenant()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleCampaignCreated = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !tenantSlug) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-muted-foreground">{error ?? "Sin comercio asignado"}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Campañas</h1>
            <p className="text-sm text-muted-foreground">
              Envia mensajes segmentados a tus clientes via Wallet.
            </p>
          </div>
        </div>
        <Button
          className="bg-primary text-white text-sm gap-2"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva campaña</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {/* Churn prevention */}
      <ChurnPreventionCard tenantSlug={tenantSlug} onCampaignSent={handleCampaignCreated} />

      {/* Campaign list */}
      <CampaignList tenantSlug={tenantSlug} refreshKey={refreshKey} />

      {/* Create dialog */}
      <CreateCampaignForm
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        tenantSlug={tenantSlug}
        onSuccess={handleCampaignCreated}
      />
    </div>
  )
}
