import { and, clients, db, eq } from "@cuik/db"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isSilentClient } from "@/lib/loyalty/archive"
import { privacyTenant } from "@/lib/privacy/notice"
import { verifyPreferencesToken } from "@/lib/privacy/token"
import PreferenciasClient, { type PreferenciasState } from "./preferencias-client"

/**
 * Public page where a program's client gives or withdraws the authorization
 * for promotions outside the program (WhatsApp, email). Without a token it
 * asks for the email and sends a signed link; with a valid link it shows the
 * current choice. Linked from the privacy notice (and from the pass once its
 * design carries the link as a back field).
 */

const DEFAULT_PRIMARY = "#0e70db"

export const metadata: Metadata = {
  title: "Preferencias de promociones",
  robots: { index: false },
}

export default async function PreferenciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tenant: slug } = await params
  const sp = await searchParams
  const tenant = await privacyTenant(slug)
  if (!tenant) notFound()

  const primaryColor =
    (tenant.branding as Record<string, string> | null)?.primaryColor ?? DEFAULT_PRIMARY

  const token = typeof sp.token === "string" ? sp.token : null
  let state: PreferenciasState = { mode: "ask" }
  if (token) {
    const clientId = verifyPreferencesToken(token)
    const [client] = clientId
      ? await db
          .select({
            name: clients.name,
            marketingOptIn: clients.marketingOptIn,
            status: clients.status,
          })
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
          .limit(1)
      : []
    state =
      client && !isSilentClient(client.status)
        ? {
            mode: "edit",
            token,
            clientName: client.name,
            marketingOptIn: client.marketingOptIn,
          }
        : { mode: "expired" }
  }

  return (
    <PreferenciasClient
      slug={slug}
      tenantName={tenant.name}
      primaryColor={primaryColor}
      initial={state}
    />
  )
}
