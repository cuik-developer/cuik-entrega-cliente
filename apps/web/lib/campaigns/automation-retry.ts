import { campaigns, db, eq, sql } from "@cuik/db"
import { executeCampaign } from "./execute-campaign"

/** Sends of one automation campaign per local day (the first one plus two retries). */
export const MAX_AUTOMATION_ATTEMPTS = 3

export type AutomationCampaignRow = {
  id: string
  status: string
  content: unknown
}

/**
 * Attempts already made for an automation campaign (stored in its content;
 * rows created before this field existed count as one attempt).
 */
export function automationAttempts(content: unknown): number {
  const n = (content as { attempts?: unknown } | null)?.attempts
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

/**
 * Whether today's automation campaign should be sent again: it is still a
 * draft (an automation campaign is created and executed at once, so a draft
 * means nothing was delivered) and it has attempts left.
 */
export function shouldRetryAutomation(row: AutomationCampaignRow): boolean {
  return row.status === "draft" && automationAttempts(row.content) < MAX_AUTOMATION_ATTEMPTS
}

/**
 * Re-executes a failed automation campaign, counting the attempt first so a
 * crash mid-send cannot loop forever. Returns the execution result.
 */
export async function retryAutomationCampaign(row: AutomationCampaignRow) {
  const next = automationAttempts(row.content) + 1
  await db
    .update(campaigns)
    .set({
      content: sql`coalesce(${campaigns.content}, '{}'::jsonb) || ${JSON.stringify({ attempts: next })}::jsonb`,
    })
    .where(eq(campaigns.id, row.id))
  console.info(`[Automation:Retry] campaign=${row.id} attempt=${next}/${MAX_AUTOMATION_ATTEMPTS}`)
  return executeCampaign(row.id)
}
