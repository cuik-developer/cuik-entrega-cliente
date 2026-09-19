import { Gift } from "lucide-react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"

import { PremiosClient } from "./_components/premios-client"

/**
 * /panel/premios — the business manages its own points reward catalog
 * (items, cost, photo) and shares the public rewards page. The look of that
 * page comes from Branding (super-admin); here only the content is edited.
 */
export default async function PremiosPage() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })
  if (!session) redirect("/login")

  const tenant = await getTenantForUser(session.user.id)
  if (!tenant) redirect("/login")

  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000"
  const proto = headersList.get("x-forwarded-proto") || "http"
  const premiosUrl = `${proto}://${host}/${tenant.tenantSlug}/premios`

  if (tenant.promotionType !== "points") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Gift className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Premios</h1>
            <p className="text-sm text-muted-foreground">Catálogo de canje por puntos.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Tu programa actual es de <strong>sellos</strong>: el premio se define en la promoción y no
          hay catálogo que administrar. Si querés pasar a puntos, hablá con el equipo de Cuik.
        </div>
      </div>
    )
  }

  return (
    <PremiosClient
      tenantSlug={tenant.tenantSlug}
      tenantName={tenant.tenantName}
      premiosUrl={premiosUrl}
    />
  )
}
