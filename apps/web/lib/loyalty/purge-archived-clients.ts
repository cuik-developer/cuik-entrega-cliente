import {
  and,
  clientNotes,
  clients,
  clientTagAssignments,
  db,
  eq,
  gt,
  lte,
  pointsTransactions,
  sql,
  tenants,
} from "@cuik/db"

import { triggerWalletUpdate } from "@/lib/wallet/trigger-wallet-update"
import { ARCHIVE_RETENTION_DAYS } from "./archive"

export { ARCHIVE_RETENTION_DAYS, purgeDateFor } from "./archive"

export type PurgeResult = { anonymized: number; errors: string[] }

/**
 * Anonymize every client archived more than ARCHIVE_RETENTION_DAYS ago.
 *
 * The row stays (status "deleted") so visits, points and rewards keep adding
 * up in analytics and reports; what goes is everything personal: name,
 * last name, DNI, phone, email, birthday, custom registration fields, notes
 * and tags. The QR is rotated so an old pass can never be scanned again.
 *
 * The pass registrations (serial + device token, no personal data) are kept
 * on purpose: they carry the LAST update, which expires the pass so Wallet
 * files it under "Expired passes" (a server cannot delete a pass from a
 * phone). Apple / Google drop the registration when the person removes it.
 * One transaction per client, wallet push after commit.
 */
export async function purgeArchivedClients(params?: {
  tenantId?: string
  now?: Date
  limit?: number
}): Promise<PurgeResult> {
  const now = params?.now ?? new Date()
  const cutoff = new Date(now.getTime() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const due = await db
    .select({ id: clients.id, tenantId: clients.tenantId })
    .from(clients)
    .where(
      and(
        eq(clients.status, "archived"),
        lte(clients.archivedAt, cutoff),
        ...(params?.tenantId ? [eq(clients.tenantId, params.tenantId)] : []),
      ),
    )
    .limit(params?.limit ?? 500)

  let anonymized = 0
  const errors: string[] = []

  for (const c of due) {
    try {
      const wallet = await db.transaction(async (tx) => {
        // Lock and re-check: an admin may have restored the client meanwhile.
        const [row] = await tx
          .select({
            status: clients.status,
            archivedAt: clients.archivedAt,
            qrCode: clients.qrCode,
            totalVisits: clients.totalVisits,
          })
          .from(clients)
          .where(eq(clients.id, c.id))
          .for("update")
          .limit(1)
        if (!row || row.status !== "archived" || !row.archivedAt || row.archivedAt > cutoff) {
          return null
        }

        await tx.delete(clientTagAssignments).where(eq(clientTagAssignments.clientId, c.id))
        await tx.delete(clientNotes).where(eq(clientNotes.clientId, c.id))
        // Close the open point lots: nothing of a deleted client may expire, warn or count.
        await tx
          .update(pointsTransactions)
          .set({ remaining: 0 })
          .where(and(eq(pointsTransactions.clientId, c.id), gt(pointsTransactions.remaining, 0)))

        await tx
          .update(clients)
          .set({
            name: "Cliente eliminado",
            lastName: null,
            dni: null,
            phone: null,
            email: null,
            birthday: null,
            customData: null,
            marketingOptIn: false,
            qrCode: sql`'DEL_' || ${clients.id}::text`,
            status: "deleted",
            anonymizedAt: now,
          })
          .where(eq(clients.id, c.id))
        anonymized++
        // The old QR is the pass serial: needed for the final update below.
        return { serial: row.qrCode, totalVisits: row.totalVisits }
      })

      if (wallet?.serial) {
        const [tenant] = await db
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, c.tenantId))
          .limit(1)
        await triggerWalletUpdate({
          qrCode: wallet.serial,
          clientId: c.id,
          clientName: "Cliente eliminado",
          tenantId: c.tenantId,
          tenantName: tenant?.name ?? "Cuik",
          stampsInCycle: 0,
          maxVisits: 0,
          totalVisits: wallet.totalVisits,
          pendingRewards: 0,
          pointsBalance: 0,
          expired: true,
        }).catch((err) => console.error("[purge] final wallet update failed:", err))
      }
    } catch (err) {
      errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { anonymized, errors }
}
