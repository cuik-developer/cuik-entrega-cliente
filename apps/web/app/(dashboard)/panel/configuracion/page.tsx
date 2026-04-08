import { headers } from "next/headers"

import { auth } from "@/lib/auth"

import { getLocations, getTenantConfig } from "./actions"
import { ConfiguracionForm } from "./configuracion-form"

export default async function ConfiguracionPage() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return <p className="text-muted-foreground">No autenticado</p>
  }

  const [result, locationsResult] = await Promise.all([getTenantConfig(), getLocations()])

  if (!result.success) {
    return <p className="text-muted-foreground">{result.error}</p>
  }

  if (!result.data) {
    return <p className="text-muted-foreground">Sin comercio asignado</p>
  }

  const initialLocations = locationsResult.success ? locationsResult.data : []

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos generales del comercio.</p>
      </div>

      <ConfiguracionForm initialData={result.data} initialLocations={initialLocations} />
    </div>
  )
}
