import { and, campaignSegments, campaigns, clients, db, eq, sql } from "@cuik/db"
import type { AutomationsConfig, BirthdayAutomation } from "@cuik/shared/validators"
import { automationsConfigSchema, DEFAULT_BIRTHDAY_AUTOMATION } from "@cuik/shared/validators"

import { executeCampaign } from "./execute-campaign"

export type BirthdayClient = { id: string; name: string; lastName: string | null }

/** Parse tenants.automations (jsonb, may be null/partial) into a full birthday config. */
export function getBirthdayConfig(raw: unknown): BirthdayAutomation {
  const parsed = automationsConfigSchema.safeParse(raw ?? {})
  const cfg: AutomationsConfig = parsed.success ? parsed.data : {}
  return { ...DEFAULT_BIRTHDAY_AUTOMATION, ...(cfg.birthday ?? {}) }
}

/** "YYYY-MM-DD" of now in the tenant timezone. */
export function todayLocal(timezone: string, now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: timezone })
}

/** Local hour 0-23 of now in the tenant timezone. */
export function hourLocal(timezone: string, now = new Date()): number {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: timezone })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value ?? "0",
  )
  return Number.isFinite(h) ? h : 0
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * Clients (not blocked, with a birthday) whose birthday falls on `dateLocal`
 * ("YYYY-MM-DD", tenant time). People born on Feb 29 are greeted on Feb 28 in
 * non-leap years so they are never skipped.
 */
export async function findBirthdayClients(
  tenantId: string,
  dateLocal: string,
): Promise<BirthdayClient[]> {
  const [y, m, d] = dateLocal.split("-").map(Number)
  const mmdd = [`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`]
  if (m === 2 && d === 28 && !isLeapYear(y)) mmdd.push("02-29")

  return db
    .select({ id: clients.id, name: clients.name, lastName: clients.lastName })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        sql`${clients.status} <> 'blocked'`,
        sql`${clients.birthday} IS NOT NULL`,
        sql`to_char(${clients.birthday}, 'MM-DD') = ANY(${`{${mmdd.join(",")}}`}::text[])`,
      ),
    )
    .orderBy(clients.name)
}

export type UpcomingBirthday = BirthdayClient & { date: string; daysUntil: number }

/**
 * Birthdays in the next `days` days (excluding today), tenant time, soonest
 * first. Done in JS on (id, name, MM-DD) rows — small per tenant and it avoids
 * leap-year SQL gymnastics.
 */
export async function upcomingBirthdays(
  tenantId: string,
  dateLocal: string,
  days = 7,
): Promise<UpcomingBirthday[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      mmdd: sql<string>`to_char(${clients.birthday}, 'MM-DD')`,
    })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        sql`${clients.status} <> 'blocked'`,
        sql`${clients.birthday} IS NOT NULL`,
      ),
    )

  const [y, m, d] = dateLocal.split("-").map(Number)
  const today = Date.UTC(y, m - 1, d)
  const out: UpcomingBirthday[] = []
  for (const r of rows) {
    const [bm, bd] = r.mmdd.split("-").map(Number)
    // Next occurrence this year or next; Feb 29 → Feb 28 when the year has no 29.
    for (const year of [y, y + 1]) {
      const day = bm === 2 && bd === 29 && !isLeapYear(year) ? 28 : bd
      const t = Date.UTC(year, bm - 1, day)
      const diff = Math.round((t - today) / 86_400_000)
      if (diff >= 1 && diff <= days) {
        out.push({
          id: r.id,
          name: r.name,
          lastName: r.lastName,
          date: new Date(t).toISOString().slice(0, 10),
          daysUntil: diff,
        })
        break
      }
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
}

export async function birthdayCoverage(
  tenantId: string,
): Promise<{ withBirthday: number; total: number }> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      withBirthday: sql<number>`COUNT(*) FILTER (WHERE ${clients.birthday} IS NOT NULL)::int`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sql`${clients.status} <> 'blocked'`))
  return { withBirthday: Number(row?.withBirthday ?? 0), total: Number(row?.total ?? 0) }
}

export type BirthdayRunResult =
  | { status: "skipped"; reason: "disabled" | "already_sent" | "no_birthdays" }
  | {
      status: "sent"
      campaignId: string
      targetCount: number
      sentCount: number
      failedCount: number
    }

/**
 * Creates and sends today's birthday campaign for one tenant. Idempotent per
 * local day: the campaign row carries { automation: "birthday", date } in
 * `content`, and a second call the same day is a no-op. The campaign lands in
 * the regular history with its recipients, like any other push.
 */
export async function runBirthdayAutomation(params: {
  tenantId: string
  timezone: string
  config: BirthdayAutomation
  dateLocal?: string
}): Promise<BirthdayRunResult> {
  const { tenantId, timezone, config } = params
  if (!config.enabled) return { status: "skipped", reason: "disabled" }
  const dateLocal = params.dateLocal ?? todayLocal(timezone)

  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.tenantId, tenantId),
        sql`${campaigns.content}->>'automation' = 'birthday'`,
        sql`${campaigns.content}->>'date' = ${dateLocal}`,
      ),
    )
    .limit(1)
  if (existing.length > 0) return { status: "skipped", reason: "already_sent" }

  const birthdayClients = await findBirthdayClients(tenantId, dateLocal)
  if (birthdayClients.length === 0) return { status: "skipped", reason: "no_birthdays" }

  const [y, m, d] = dateLocal.split("-").map(Number)
  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId,
      name: `Cumpleaños · ${label}`,
      type: "push",
      message: config.message,
      status: "draft",
      content: { automation: "birthday", date: dateLocal },
    })
    .returning({ id: campaigns.id })

  await db.insert(campaignSegments).values({
    campaignId: campaign.id,
    segmentName: "cumpleanos",
    filter: { clientIds: birthdayClients.map((c) => c.id) },
  })

  const result = await executeCampaign(campaign.id)
  return {
    status: "sent",
    campaignId: campaign.id,
    targetCount: result.targetCount,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
  }
}
