import { headers } from "next/headers"

import { PanelMessage } from "@/components/admin/enterprise"
import { auth } from "@/lib/auth"

import { getLocations, getTenantConfig } from "./actions"
import { type ConfigTab, ConfiguracionTabs } from "./configuracion-tabs"

// Mirrors CONFIG_TABS in the client module: a client module cannot hand a
// server component a plain array (only functions cross that boundary).
const TABS: readonly string[] = ["negocio", "sucursales", "reportes"]

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return <PanelMessage className="py-20">No autenticado</PanelMessage>
  }

  const [result, locationsResult, params] = await Promise.all([
    getTenantConfig(),
    getLocations(),
    searchParams,
  ])

  if (!result.success) {
    return <PanelMessage className="py-20">{result.error}</PanelMessage>
  }

  if (!result.data) {
    return <PanelMessage className="py-20">Sin comercio asignado</PanelMessage>
  }

  const initialLocations = locationsResult.success ? locationsResult.data : []
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const initialTab = rawTab && TABS.includes(rawTab) ? (rawTab as ConfigTab) : null

  return (
    <ConfiguracionTabs
      initialData={result.data}
      initialLocations={initialLocations}
      initialTab={initialTab}
    />
  )
}
