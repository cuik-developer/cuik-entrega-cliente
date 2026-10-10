"use client"

import { PageHeader } from "@/components/admin/enterprise"
import { useTenant } from "@/hooks/use-tenant"

import { BirthdayAutomationCard } from "../../configuracion/_components/birthday-automation-card"
import { PointsExpiryAutomationCard } from "../../configuracion/_components/points-expiry-automation-card"
import { RecurringCampaignsCard } from "../../configuracion/_components/recurring-campaigns-card"

/** Campaigns that run on their own once configured: birthday, points about to expire, recurring. */
export default function CampanasAutomatizadasPage() {
  const { tenantSlug, isLoading } = useTenant()
  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Inicio", href: "/panel" },
          { label: "Campañas", href: "/panel/campanas" },
          { label: "Automatizadas" },
        ]}
        title="Campañas automatizadas"
        subtitle="Se configuran una vez y se envían solas. Cada envío aparece en Envíos como una campaña más."
      />
      {!isLoading && tenantSlug && (
        <div className="max-w-3xl space-y-3">
          <BirthdayAutomationCard tenantSlug={tenantSlug} />
          <PointsExpiryAutomationCard tenantSlug={tenantSlug} />
          <RecurringCampaignsCard tenantSlug={tenantSlug} />
        </div>
      )}
    </div>
  )
}
