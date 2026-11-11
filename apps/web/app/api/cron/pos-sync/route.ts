import { errorResponse, successResponse } from "@/lib/api-utils"
import { isCronAuthorized } from "@/lib/cron-auth"
import { computeMissingCortes } from "@/lib/pos/corte"
import { syncAllEnabled } from "@/lib/pos/sync"

export const maxDuration = 300

/**
 * POST /api/cron/pos-sync
 * Run every 15 minutes. Pulls new and modified POS orders of every tenant with
 * the connector on (incremental, at most MAX_ORDERS_PER_RUN per tenant per
 * run: a backfill finishes over a few runs), pairs them with the visits, and
 * computes the previous month's corte once per tenant when that month has no
 * report yet (tenants still backfilling wait).
 */
export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return errorResponse("Unauthorized", 401)
    const synced = await syncAllEnabled()
    const cortes = await computeMissingCortes(synced)
    return successResponse({ synced, cortes })
  } catch (error) {
    console.error("[POST /api/cron/pos-sync]", error)
    return errorResponse("Internal server error", 500)
  }
}
