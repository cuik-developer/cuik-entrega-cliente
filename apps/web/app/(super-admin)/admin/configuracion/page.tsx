import { DEFAULT_PLATFORM_CONFIG } from "@cuik/shared/validators"

export const dynamic = "force-dynamic"

import { Card, CardContent } from "@/components/ui/card"

import { getGlobalConfig } from "./actions"
import { ConfigForm } from "./config-form"

export default async function SuperAdminConfigPage() {
  const result = await getGlobalConfig()

  const config = result.success ? result.data : DEFAULT_PLATFORM_CONFIG

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          Configuracion
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ajustes globales de la plataforma.
        </p>
      </div>

      {!result.success && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No se pudo cargar la configuracion guardada. Mostrando valores por defecto.
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <ConfigForm initialData={config} />
        </CardContent>
      </Card>
    </div>
  )
}
