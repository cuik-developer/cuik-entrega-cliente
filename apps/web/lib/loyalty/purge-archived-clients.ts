import {
  and,
  appleDevices,
  clientNotes,
  clients,
  clientTagAssignments,
  db,
  eq,
  inArray,
  lte,
  passInstances,
  sql,
} from "@cuik/db"

import { ARCHIVE_RETENTION_DAYS } from "./archive"

export { ARCHIVE_RETENTION_DAYS, purgeDateFor } from "./archive"

export type PurgeResult = { anonymized: number; errors: string[] }

/**
 * Anonymize every client archived more than ARCHIVE_RETENTION_DAYS ago.
 *
 * The row stays (status "deleted") so visits, points and rewards keep adding
 * up in analytics and reports; what goes is everything personal: name,
 * last name, DNI, phone, email, birthday, custom registration fields, notes,
 * tags and the wallet pass registrations. The QR is rotated so an old pass
 * can never be scanned again. One transaction per client.
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
      await db.transaction(async (tx) => {
        // Lock and re-check: an admin may have restored the client meanwhile.
        const [row] = await tx
          .select({ status: clients.status, archivedAt: clients.archivedAt })
          .from(clients)
          .where(eq(clients.id, c.id))
          .for("update")
          .limit(1)
        if (!row || row.status !== "archived" || !row.archivedAt || row.archivedAt > cutoff) return

        const serials = await tx
          .select({ serialNumber: passInstances.serialNumber })
          .from(passInstances)
          .where(eq(passInstances.clientId, c.id))
        const serialList = serials.map((s) => s.serialNumber)
        if (serialList.length > 0) {
          await tx.delete(appleDevices).where(inArray(appleDevices.serialNumber, serialList))
        }
        await tx.delete(passInstances).where(eq(passInstances.clientId, c.id))
        await tx.delete(clientTagAssignments).where(eq(clientTagAssignments.clientId, c.id))
        await tx.delete(clientNotes).where(eq(clientNotes.clientId, c.id))

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
      })
    } catch (err) {
      errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { anonymized, errors }
}
