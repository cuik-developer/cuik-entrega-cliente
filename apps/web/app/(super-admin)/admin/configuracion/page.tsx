import { DEFAULT_PLATFORM_CONFIG, DEFAULT_SOLICITUD_EMAIL_TEMPLATES } from "@cuik/shared/validators"

export const dynamic = "force-dynamic"

import { Card, CardContent } from "@/components/ui/card"

import { getGlobalConfig, getInternalTenantsConfig, getSolicitudEmailTemplates } from "./actions"
import { ConfigForm } from "./config-form"
import { EmailTemplatesForm } from "./email-templates-form"
import { InternalTenantsForm } from "./internal-tenants-form"

export default async function SuperAdminConfigPage() {
  const [result, templatesResult, internalResult] = await Promise.all([
    getGlobalConfig(),
    getSolicitudEmailTemplates(),
    getInternalTenantsConfig(),
  ])

  const config = result.success ? result.data : DEFAULT_PLATFORM_CONFIG
  const templates = templatesResult.success
    ? templatesResult.data
    : DEFAULT_SOLICITUD_EMAIL_TEMPLATES

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[17px] leading-6 font-semibold text-ent-fg tracking-[-0.005em]">
          Configuracion
        </h1>
        <p className="mt-1 text-sm text-ent-fg-3 dark:text-ent-fg-3">
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

      <Card>
        <CardContent className="pt-6">
          <InternalTenantsForm
            tenants={internalResult.success ? internalResult.data.tenants : []}
            initialIds={internalResult.success ? internalResult.data.ids : []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <EmailTemplatesForm initialData={templates} />
        </CardContent>
      </Card>
    </div>
  )
}
