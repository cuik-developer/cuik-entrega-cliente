import { and, clients, db, eq, passInstances, rewardCatalog, tenants } from "@cuik/db"
import { generateAuthToken } from "@cuik/wallet/apple"
import { buildSaveToWalletUrl } from "@cuik/wallet/google"
import { validateGoogleEnv } from "@cuik/wallet/shared"
import { notFound } from "next/navigation"
import {
  assemblePassConfig,
  getActiveDesignForTenant,
} from "@/app/(dashboard)/panel/mi-pase/queries"
import { verifyClientToken } from "@/lib/client-token"
import { googleSaveOrigins } from "@/lib/wallet/google-save-origins"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import type { ServerData } from "./bienvenido-client"
import BienvenidoClient from "./bienvenido-client"

const DEFAULT_PRIMARY = "#0e70db"

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: server page with multiple sequential DB queries and token verification
export default async function TenantBienvenidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tenant: slug } = await params
  const resolvedSearchParams = await searchParams

  // Fetch tenant with id (needed for pass design + catalog queries)
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      branding: tenants.branding,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) {
    notFound()
  }

  const primaryColor =
    (tenant.branding as Record<string, string> | null)?.primaryColor ?? DEFAULT_PRIMARY

  const clientToken =
    typeof resolvedSearchParams.clientToken === "string"
      ? resolvedSearchParams.clientToken
      : undefined

  let serverData: ServerData | undefined

  if (clientToken) {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
      serverData = { error: "expired" }
    } else {
      const result = verifyClientToken(secret, clientToken)
      if (!result.valid || !result.clientId) {
        serverData = { error: "expired" }
      } else {
        try {
          // Fetch client data
          const clientRows = await db
            .select({ id: clients.id, name: clients.name, qrCode: clients.qrCode })
            .from(clients)
            .where(and(eq(clients.id, result.clientId), eq(clients.tenantId, tenant.id)))
            .limit(1)

          const client = clientRows[0]
          if (!client) {
            serverData = { error: "expired" }
          } else {
            // Fetch pass_instances for wallet URLs
            const passRows = await db
              .select({
                authToken: passInstances.authToken,
                googleSaveUrl: passInstances.googleSaveUrl,
                googleObjectId: passInstances.googleObjectId,
              })
              .from(passInstances)
              .where(eq(passInstances.clientId, client.id))
              .limit(1)

            const pass = passRows[0]

            // Rebuild the download token from the tenant's CURRENT Apple secret.
            // The stored pass_instances.auth_token was signed with the secret in
            // force at registration; after the tenant's certificate/secret changes
            // the download route rejects it ("Invalid token"). Passes already on
            // phones keep working: the Apple web service also accepts the old one.
            const appleConfig = pass ? await getTenantAppleConfig(tenant.id) : null
            const appleToken =
              appleConfig?.authSecret && client.qrCode
                ? generateAuthToken(appleConfig.authSecret, client.qrCode)
                : (pass?.authToken ?? null)
            const appleUrl = appleToken
              ? `/api/${slug}/wallet/apple/${client.id}/${appleToken}`
              : null
            // Sign a fresh Google save link too: the stored one expires after
            // 24 h and only lists the origin it was created on (www before the
            // 20 Oct redirect), so Google answers "something went wrong".
            let googleUrl = pass?.googleSaveUrl ?? null
            const googleConfig = pass?.googleObjectId ? validateGoogleEnv() : null
            if (pass?.googleObjectId && googleConfig) {
              try {
                googleUrl = await buildSaveToWalletUrl({
                  objectId: pass.googleObjectId,
                  serviceAccountEmail: googleConfig.serviceAccountJson.client_email,
                  privateKey: googleConfig.serviceAccountJson.private_key,
                  origins: googleSaveOrigins(),
                })
              } catch (err) {
                console.error("[bienvenido] Could not sign Google save link:", err)
              }
            }

            serverData = {
              nombre: client.name,
              appleUrl,
              googleUrl,
            }
          }
        } catch (err) {
          console.error("[bienvenido] Error fetching client data:", err)
          serverData = { error: "expired" }
        }
      }
    }
  }

  // Fetch pass design for real wallet preview
  const designResult = await getActiveDesignForTenant(tenant.id)
  const passConfig = designResult
    ? assemblePassConfig(designResult.design, designResult.assets)
    : null
  const promotionType =
    designResult?.promotion?.type === "points" ? ("points" as const) : ("stamps" as const)

  // Check if tenant has active catalog items (for "Ver premios" link)
  const [catalogCount] = await db
    .select({ count: rewardCatalog.id })
    .from(rewardCatalog)
    .where(and(eq(rewardCatalog.tenantId, tenant.id), eq(rewardCatalog.active, true)))
    .limit(1)

  const hasCatalog = !!catalogCount

  return (
    <BienvenidoClient
      tenantName={tenant.name}
      tenantSlug={slug}
      primaryColor={primaryColor}
      logoUrl={(tenant.branding as Record<string, string> | null)?.logoUrl ?? null}
      serverData={serverData}
      passConfig={passConfig}
      promotionType={promotionType}
      hasCatalog={hasCatalog}
    />
  )
}
