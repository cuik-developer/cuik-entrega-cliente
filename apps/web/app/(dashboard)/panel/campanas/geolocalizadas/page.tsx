import { PageHeader, PanelMessage } from "@/components/admin/enterprise"

import { WalletSection } from "../../configuracion/_components/wallet-section"
import { getTenantConfig } from "../../configuracion/actions"

/**
 * Location-based messages: the pass shows a text on the lock screen when the
 * client is near one of the configured places (Apple and Google geofences).
 */
export default async function CampanasGeolocalizadasPage() {
  const result = await getTenantConfig()
  if (!result.success) return <PanelMessage className="py-20">{result.error}</PanelMessage>
  if (!result.data) return <PanelMessage className="py-20">Sin comercio asignado</PanelMessage>

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Inicio", href: "/panel" },
          { label: "Campañas", href: "/panel/campanas" },
          { label: "Geolocalizadas" },
        ]}
        title="Campañas geolocalizadas"
        subtitle="Mensajes que el pase muestra en la pantalla bloqueada cuando el cliente está cerca de tus locales."
      />
      <div className="max-w-3xl">
        <WalletSection initialData={result.data} />
      </div>
    </div>
  )
}
