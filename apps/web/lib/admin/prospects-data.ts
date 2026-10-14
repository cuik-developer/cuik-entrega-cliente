import { asc, db, desc, eq, fxRates, plans, prospects, sql, tenants } from "@cuik/db"
import { asInterval, todayYmd } from "./billing"
import { fxFor } from "./finance"
import { type PipelineSummary, pipelineSummary } from "./prospects"

/** The CRM screen: prospects with their plan and linked tenant, the pipeline figures, and the pick lists. */
export async function loadProspects() {
  const today = todayYmd()
  const todayMonth = today.slice(0, 7)
  const [rows, planRows, tenantRows, rateRows] = await Promise.all([
    db
      .select({
        id: prospects.id,
        name: prospects.name,
        contactName: prospects.contactName,
        phone: prospects.phone,
        email: prospects.email,
        city: prospects.city,
        source: prospects.source,
        stage: prospects.stage,
        probability: prospects.probability,
        planId: prospects.planId,
        planName: plans.name,
        monthlyAmount: prospects.monthlyAmount,
        currency: prospects.currency,
        intervalMonths: prospects.intervalMonths,
        billingMode: prospects.billingMode,
        expectedStartMonth: prospects.expectedStartMonth,
        expectedCloseOn: prospects.expectedCloseOn,
        demoStartOn: prospects.demoStartOn,
        demoEndOn: prospects.demoEndOn,
        tenantId: prospects.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        tenantStatus: tenants.status,
        nextStep: prospects.nextStep,
        nextStepOn: prospects.nextStepOn,
        lostReason: prospects.lostReason,
        notes: prospects.notes,
        createdAt: prospects.createdAt,
        updatedAt: prospects.updatedAt,
      })
      .from(prospects)
      .leftJoin(plans, eq(plans.id, prospects.planId))
      .leftJoin(tenants, eq(tenants.id, prospects.tenantId))
      .orderBy(desc(prospects.updatedAt)),
    // Pick lists: active plans and live tenants, plus whatever a prospect
    // already points to, so editing never drops a link silently.
    db
      .select({ id: plans.id, name: plans.name, price: plans.price })
      .from(plans)
      .where(
        sql`${plans.active} = true OR ${plans.id} IN (SELECT plan_id FROM finance.prospects WHERE plan_id IS NOT NULL)`,
      )
      .orderBy(asc(plans.price)),
    db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
      .from(tenants)
      .where(
        sql`${tenants.status} IN ('pending', 'trial', 'active', 'paused') OR ${tenants.id} IN (SELECT tenant_id FROM finance.prospects WHERE tenant_id IS NOT NULL)`,
      )
      .orderBy(asc(tenants.name)),
    db.select().from(fxRates),
  ])
  const rates: Record<string, number> = {}
  for (const r of rateRows) rates[r.month] = Number(r.usdPen)
  const fx = fxFor(todayMonth, rates)
  const list = rows.map((r) => ({
    ...r,
    monthlyAmount: r.monthlyAmount === null ? null : Number(r.monthlyAmount),
    intervalMonths: asInterval(r.intervalMonths),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
  const summary: PipelineSummary = pipelineSummary(list, fx.rate, today)
  return { today, fx, prospects: list, summary, plans: planRows, tenants: tenantRows }
}

export type ProspectsData = Awaited<ReturnType<typeof loadProspects>>
export type ProspectRow = ProspectsData["prospects"][number]
