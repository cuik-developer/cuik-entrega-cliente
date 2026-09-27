import { errorResponse, successResponse } from "@/lib/api-utils"
import { ARCHIVE_RETENTION_DAYS, purgeArchivedClients } from "@/lib/loyalty/purge-archived-clients"

/**
 * POST /api/cron/clients-purge
 * Run once a day. Anonymizes every client that has been archived for more
 * than ARCHIVE_RETENTION_DAYS (30): personal data wiped, pass registrations
 * removed, QR rotated; visits and points history kept under "Cliente
 * eliminado". Idempotent: a client is anonymized once.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!secret || secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }
    const result = await purgeArchivedClients()
    return successResponse({ retentionDays: ARCHIVE_RETENTION_DAYS, ...result })
  } catch (error) {
    console.error("[POST /api/cron/clients-purge]", error)
    return errorResponse("Internal server error", 500)
  }
}
