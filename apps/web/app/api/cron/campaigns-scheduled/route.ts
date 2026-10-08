import { campaigns, db, sql } from "@cuik/db"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { executeCampaign } from "@/lib/campaigns"
import { runDueRecurringCampaigns } from "@/lib/campaigns/recurring"

const STUCK_AFTER_MINUTES = 30

async function recoverStuckCampaigns(): Promise<number> {
  const stuck = await db.execute(sql`
    WITH stuck AS (
      SELECT c.id, c.scheduled_at,
             (SELECT count(*) FROM campaigns.notifications n
               WHERE n.campaign_id = c.id AND n.status = 'sent')::int AS sent
      FROM campaigns.campaigns c
      WHERE c.status = 'sending'
        AND c.updated_at < (NOW() AT TIME ZONE 'UTC') - make_interval(mins => ${STUCK_AFTER_MINUTES})
    )
    UPDATE campaigns.campaigns c
    SET status = CASE WHEN s.sent > 0 THEN 'sent'::campaign_status
                      WHEN s.scheduled_at IS NOT NULL THEN 'scheduled'::campaign_status
                      ELSE 'draft'::campaign_status END,
        sent_count = CASE WHEN s.sent > 0 THEN s.sent ELSE c.sent_count END,
        delivered_count = CASE WHEN s.sent > 0 THEN s.sent ELSE c.delivered_count END,
        sent_at = CASE WHEN s.sent > 0 THEN (NOW() AT TIME ZONE 'UTC') ELSE c.sent_at END,
        content = COALESCE(c.content, '{}'::jsonb) || jsonb_build_object('recoveredFromSending', true),
        updated_at = (NOW() AT TIME ZONE 'UTC')
    FROM stuck s
    WHERE c.id = s.id
    RETURNING c.id, c.status
  `)
  const rows = stuck.rows as Array<{ id: string; status: string }>
  for (const r of rows)
    console.warn(`[Cron:campaigns] recovered stuck campaign ${r.id} -> ${r.status}`)
  return rows.length
}

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const cronSecret = request.headers.get("x-cron-secret")
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    // Recover campaigns stuck in "sending" (process died mid-send: deploy,
    // restart, timeout). If notifications were already recorded, close it as
    // sent with the real count (never re-push to the same people); otherwise
    // put it back where it was so it is retried / editable.
    const recovered = await recoverStuckCampaigns()

    // Find scheduled campaigns that are due
    const dueCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      // scheduled_at is timestamp WITHOUT tz holding UTC wall time: compare against
      // UTC explicitly so the result never depends on the session TimeZone.
      .where(
        sql`${campaigns.status} = 'scheduled' AND ${campaigns.scheduledAt} <= (NOW() AT TIME ZONE 'UTC')`,
      )

    const errors: string[] = []
    let processed = 0

    for (const campaign of dueCampaigns) {
      try {
        const result = await executeCampaign(campaign.id)
        processed++
        if (result.status === "failed") {
          errors.push(`Campaign ${campaign.id}: ${result.errors.join(", ")}`)
        }
      } catch (err) {
        errors.push(`Campaign ${campaign.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Recurring campaigns: materialize + send every template whose slot has come.
    const recurring = await runDueRecurringCampaigns()
    errors.push(...recurring.errors)

    return successResponse({
      processed,
      recovered,
      recurring: {
        processed: recurring.processed,
        sent: recurring.sent,
        skipped: recurring.skipped,
      },
      errors,
    })
  } catch (error) {
    console.error("[POST /api/cron/campaigns-scheduled]", error)
    return errorResponse("Internal server error", 500)
  }
}
