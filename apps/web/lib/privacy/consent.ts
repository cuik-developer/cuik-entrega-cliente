import { and, clients, consentEvents, db, eq } from "@cuik/db"
import { PRIVACY_NOTICE_VERSION } from "./shared"

/**
 * Proof of consent (Ley 29733): every time a client accepts the program's
 * privacy notice or gives or withdraws the promotions authorization, one row
 * is appended to loyalty.consent_events with the notice version, the channel,
 * the IP and the browser. clients.marketing_opt_in keeps the current state;
 * the events are the history that backs it.
 */

export type ConsentKind = "privacy" | "marketing"
/** "registro": the registration form; "preferencias": the emailed preferences link. */
export type ConsentSource = "registro" | "preferencias"

export type ConsentContext = {
  source: ConsentSource
  ip: string | null
  userAgent: string | null
}

type Executor = Pick<typeof db, "insert">

const cap = (v: string | null, n: number) => (v ? v.slice(0, n) : null)

export function consentRow(
  input: {
    tenantId: string
    clientId: string
    kind: ConsentKind
    granted: boolean
  } & ConsentContext,
) {
  return {
    tenantId: input.tenantId,
    clientId: input.clientId,
    kind: input.kind,
    granted: input.granted,
    version: PRIVACY_NOTICE_VERSION,
    source: input.source,
    ip: cap(input.ip, 64),
    userAgent: cap(input.userAgent, 400),
  }
}

/** The two events of a registration: the notice (always accepted) and promotions (yes or no). */
export async function recordRegistrationConsent(
  exec: Executor,
  input: { tenantId: string; clientId: string; marketingOptIn: boolean } & Omit<
    ConsentContext,
    "source"
  >,
): Promise<void> {
  const ctx = { ip: input.ip, userAgent: input.userAgent, source: "registro" as const }
  await exec.insert(consentEvents).values([
    consentRow({
      tenantId: input.tenantId,
      clientId: input.clientId,
      kind: "privacy",
      granted: true,
      ...ctx,
    }),
    consentRow({
      tenantId: input.tenantId,
      clientId: input.clientId,
      kind: "marketing",
      granted: input.marketingOptIn,
      ...ctx,
    }),
  ])
}

/**
 * Gives or withdraws the promotions authorization from the preferences page:
 * the client's state and its event change together. Returns false when the
 * client is not in the tenant.
 */
export async function setMarketingConsent(
  input: { tenantId: string; clientId: string; granted: boolean } & ConsentContext,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(clients)
      .set({ marketingOptIn: input.granted })
      .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId)))
      .returning({ id: clients.id })
    if (updated.length === 0) return false
    await tx.insert(consentEvents).values(consentRow({ ...input, kind: "marketing" }))
    return true
  })
}
