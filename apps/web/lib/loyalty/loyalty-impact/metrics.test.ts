import { describe, expect, it } from "vitest"

import {
  addDays,
  campaignClients,
  clampWindow,
  computeLoyaltyImpact,
  concludeImpact,
  type ImpactCampaign,
  type ImpactClient,
  type ImpactVisit,
  type LoyaltyImpactInput,
  suggestWindow,
} from "./metrics"

const ms = (day: string, hour = 12) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)

const visit = (
  clientId: string,
  day: string,
  amount: number | null = 100,
  cycle = 1,
  hour = 12,
): ImpactVisit => ({ clientId, day, at: ms(day, hour), amount, cycle })

function input(partial: Partial<LoyaltyImpactInput>): LoyaltyImpactInput {
  return { today: "2026-06-30", clients: [], visits: [], campaigns: [], windowDays: 30, ...partial }
}
const run = (partial: Partial<LoyaltyImpactInput>) => computeLoyaltyImpact(input(partial))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** 100 clients registered on 1 Jan, each with one purchase on 1 Feb. */
function hundred(): { clients: ImpactClient[]; visits: ImpactVisit[]; ids: string[] } {
  const ids = Array.from({ length: 100 }, (_, i) => `c${String(i).padStart(3, "0")}`)
  return {
    ids,
    clients: ids.map((id) => ({ id, registeredOn: "2026-01-01" })),
    visits: ids.map((id) => visit(id, "2026-02-01")),
  }
}

const campaign = (
  recipients: string[],
  sentOn = "2026-03-01",
  extra: Partial<ImpactCampaign> = {},
): ImpactCampaign => ({
  id: "k1",
  name: "Te extrañamos",
  kind: "manual",
  sentOn,
  sentAt: ms(sentOn, 10),
  recipients,
  ...extra,
})

/** An old send to everybody: makes every client one that campaigns can reach. */
const reachable = (ids: string[]) => campaign(ids, "2025-11-01", { id: "old", name: "Bienvenida" })

describe("what happened and what it is worth", () => {
  const clients: ImpactClient[] = ["a", "b", "c", "d"].map((id) => ({
    id,
    registeredOn: "2026-01-01",
  }))
  const visits = [
    visit("a", "2026-01-05"),
    visit("a", "2026-01-20"),
    visit("a", "2026-02-10"),
    visit("b", "2026-01-06", 50),
    // S/ 100 ticket typed with extra digits.
    visit("c", "2026-01-07", 20_000),
  ]
  const r = run({ clients, visits })

  it("walks the funnel from card to return", () => {
    expect(r.funnel.map((f) => [f.step, f.clients])).toEqual([
      ["registered", 4],
      ["first", 3],
      ["second", 1],
      ["third", 1],
      ["fifth", 0],
      ["card", 0],
    ])
    expect(r.base.neverBought).toBe(1)
  })

  it("leaves a typing mistake out of the money, and says so", () => {
    expect(r.quality.outliers).toBe(1)
    expect(r.quality.outliersTotal).toBe(20_000)
    expect(r.headline.sales).toBe(350)
    // The stamp still counts as a purchase.
    expect(r.headline.purchases).toBe(5)
    expect(r.headline.buyers).toBe(3)
  })

  it("groups clients by how many days they bought, for the 'came back at least X times' filter", () => {
    expect(r.byVisitDays).toEqual([
      { visitDays: 1, clients: 2, purchases: 2, sales: 50, returnPurchases: 0, returnSales: 0 },
      { visitDays: 3, clients: 1, purchases: 3, sales: 300, returnPurchases: 2, returnSales: 200 },
    ])
    expect(r.headline.returnSales).toBe(200)
    expect(r.headline.returnPurchases).toBe(2)
  })

  it("splits each month into first visits and returns", () => {
    expect(
      r.months.map((m) => [m.month, m.firstVisits, m.returnVisits, m.sales, m.returnSales]),
    ).toEqual([
      ["2026-01", 3, 1, 250, 100],
      ["2026-02", 0, 1, 100, 100],
    ])
    // The bill runs every calendar month, January to June, not only the active ones.
    expect(r.period.months).toBe(6)
  })

  it("counts a purchase without amount as a purchase with no money", () => {
    const noAmount = run({
      clients,
      visits: [visit("a", "2026-01-05", null), visit("a", "2026-01-09", 0)],
    })
    expect(noAmount.quality.amountCoveragePct).toBe(0)
    expect(noAmount.headline.sales).toBe(0)
    expect(noAmount.byVisitDays[0]?.visitDays).toBe(2)
    expect(noAmount.headline.medianTicket).toBeNull()
  })

  it("ignores what has not happened yet", () => {
    const early = run({ today: "2026-01-06", clients, visits })
    expect(early.headline.purchases).toBe(2)
    expect(early.headline.returnPurchases).toBe(0)
  })

  it("does not take the welcome stamp for a purchase", () => {
    const welcome = (id: string): ImpactVisit => ({ ...visit(id, "2026-01-01", null), bonus: true })
    const w = run({
      clients,
      visits: [welcome("a"), welcome("b"), visit("a", "2026-01-15")],
    })
    expect(w.quality.bonusStamps).toBe(2)
    expect(w.headline.buyers).toBe(1)
    expect(w.base.neverBought).toBe(3)
    // a's first real purchase is a first purchase, not a return visit.
    expect(w.headline.returnSales).toBe(0)
    expect(w.byVisitDays).toMatchObject([{ visitDays: 1, clients: 1, purchases: 1 }])
  })

  it("suggests a window from the usual gap between purchases", () => {
    // a: 15 and 21 days between purchases → median 18 → 25 days.
    expect(r.medianGapDays).toBe(18)
    expect(r.suggestedWindowDays).toBe(25)
    expect(suggestWindow(24)).toBe(30)
    expect(suggestWindow(null)).toBe(30)
    expect(suggestWindow(2)).toBe(7)
    expect(clampWindow(1)).toBe(5)
    expect(clampWindow(500)).toBe(120)
    expect(clampWindow(Number.NaN)).toBe(30)
  })
})

describe("clients older than their row", () => {
  it("counts a migrated client from their first purchase", () => {
    // Row created on 1 Apr, but purchases since February (brought from another system).
    const clients: ImpactClient[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      registeredOn: "2026-04-01",
    }))
    const visits = clients.map((c) => visit(c.id, "2026-02-01"))
    const r = run({
      clients,
      visits: [...visits, visit("m0", "2026-03-10")],
      campaigns: [campaign(clients.map((c) => c.id))],
    })
    expect(r.campaigns[0]).toMatchObject({ recipients: 40, returned: 1 })
    expect(r.months[0]).toMatchObject({ month: "2026-02", newClients: 40 })
  })
})

describe("natural return", () => {
  it("counts who buys again after a silence", () => {
    const clients: ImpactClient[] = [
      { id: "a", registeredOn: "2026-01-01" },
      { id: "b", registeredOn: "2026-01-01" },
    ]
    const r = run({
      clients,
      // a comes back 40 days later; b never does.
      visits: [visit("a", "2026-01-01"), visit("a", "2026-02-10"), visit("b", "2026-01-01")],
    })
    const at = (n: number) => r.naturalReturn.find((x) => x.silenceDays === n)
    // 30 days of silence: a and b get there, plus a again after the second visit.
    expect(at(30)).toMatchObject({ times: 3, back: 1, backPct: 33.3 })
    // 45 days: a's first silence ended at day 40, so it never got there.
    expect(at(45)).toMatchObject({ times: 2, back: 0 })
  })

  it("follows the window that was typed", () => {
    const clients: ImpactClient[] = [{ id: "a", registeredOn: "2026-01-01" }]
    const visits = [visit("a", "2026-01-01"), visit("a", "2026-02-10")]
    const back = (windowDays: number) =>
      run({ clients, visits, windowDays }).naturalReturn.find((x) => x.silenceDays === 30)?.back
    // 30 days of silence on 31 Jan; the next purchase is 10 days after that.
    expect(back(5)).toBe(0)
    expect(back(10)).toBe(1)
  })
})

describe("campaigns against what would have happened anyway", () => {
  it("measures a campaign against reachable clients nobody wrote to", () => {
    const { clients, visits, ids } = hundred()
    const back = [
      // 25 of the 50 recipients come back, 10 of the 50 others.
      ...ids.slice(0, 25).map((id) => visit(id, "2026-03-10")),
      ...ids.slice(50, 60).map((id) => visit(id, "2026-03-12")),
    ]
    const r = run({
      clients,
      visits: [...visits, ...back],
      campaigns: [reachable(ids), campaign(ids.slice(0, 50))],
    })
    const [c] = r.campaigns
    expect(c).toMatchObject({
      recipients: 50,
      handedOver: 0,
      returned: 25,
      returnedPct: 50,
      expected: 10,
      expectedPct: 20,
      extraClients: 15,
      purchasesInWindow: 25,
      salesInWindow: 2500,
      extraSales: 1500,
      verdict: "above",
      reliable: true,
    })
    expect(c?.bySegment).toEqual([
      {
        segment: "regular",
        recipients: 50,
        returned: 25,
        expected: 10,
        expectedFrom: "same_day",
        extraClients: 15,
      },
    ])
    expect(r.campaignTotals).toEqual({
      kindsMeasured: 1,
      kindsAbove: 1,
      extraPurchases: 15,
      extraSales: 1500,
    })
  })

  it("does not compare with clients that campaigns never reach", () => {
    const { clients, visits, ids } = hundred()
    // Nobody but the recipients ever got a message: the rest may have no pass at all.
    const [c] = run({ clients, visits, campaigns: [campaign(ids.slice(0, 50))] }).campaigns
    expect(c?.bySegment[0]?.expectedFrom).toBe("history")
  })

  it("claims nothing when the difference is within chance", () => {
    const { clients, visits, ids } = hundred()
    const back = [
      ...ids.slice(0, 13).map((id) => visit(id, "2026-03-10")),
      ...ids.slice(50, 60).map((id) => visit(id, "2026-03-12")),
    ]
    const r = run({
      clients,
      visits: [...visits, ...back],
      campaigns: [reachable(ids), campaign(ids.slice(0, 50))],
    })
    expect(r.campaigns[0]?.verdict).toBe("within")
    expect(r.campaigns[0]?.extraSales).toBeNull()
    expect(r.campaignTotals.extraSales).toBe(0)
  })

  it("is not sure about a reference where nobody came back", () => {
    const { clients, visits, ids } = hundred()
    // One recipient of 50 returns and none of the 50 others: that is not an effect.
    const r = run({
      clients,
      visits: [...visits, visit("c000", "2026-03-10")],
      campaigns: [reachable(ids), campaign(ids.slice(0, 50))],
    })
    expect(r.campaigns[0]).toMatchObject({ returned: 1, expected: 0, verdict: "within" })
    expect(r.campaigns[0]?.margin).toBeGreaterThan(1)
  })

  it("says so when a campaign did worse than doing nothing", () => {
    const { clients, visits, ids } = hundred()
    const back = ids.slice(50, 80).map((id) => visit(id, "2026-03-12"))
    const [c] = run({
      clients,
      visits: [...visits, ...back],
      campaigns: [reachable(ids), campaign(ids.slice(0, 50))],
    }).campaigns
    expect(c?.verdict).toBe("below")
    expect(c?.extraClients).toBe(-30)
    expect(c?.extraSales).toBeNull()
  })

  it("falls back to the tenant's history when everybody got the campaign", () => {
    const { clients, visits, ids } = hundred()
    const back = ids.slice(0, 30).map((id) => visit(id, "2026-03-10"))
    const r = run({ clients, visits: [...visits, ...back], campaigns: [campaign(ids)] })
    const [c] = r.campaigns
    expect(c?.bySegment[0]?.expectedFrom).toBe("history")
    expect(c?.returned).toBe(30)
    expect(c?.expected).toBeGreaterThan(0)
    // With nobody comparable left out, it is shown but not judged, and adds nothing.
    expect(c).toMatchObject({ verdict: "no_reference", reliable: false, comparablePct: 0 })
    expect(r.byKind).toMatchObject([{ kind: "manual", measured: 0, verdict: "no_reference" }])
    expect(r.campaignTotals.extraSales).toBe(0)
  })

  it("does not judge a campaign until its last day is over", () => {
    const { clients, visits, ids } = hundred()
    const back = ids.slice(0, 25).map((id) => visit(id, "2026-03-10"))
    const at = (today: string) =>
      run({
        today,
        clients,
        visits: [...visits, ...back],
        campaigns: [reachable(ids), campaign(ids.slice(0, 50))],
      }).campaigns[0]
    // Sent on 1 Mar, 30 days: the window's last day is 31 Mar.
    expect(at("2026-03-31")).toMatchObject({
      verdict: "running",
      reliable: false,
      extraSales: null,
    })
    expect(at("2026-04-01")).toMatchObject({ verdict: "above", reliable: true })
  })

  it("counts a purchase on the send day when it came after the message", () => {
    const { clients, visits, ids } = hundred()
    const r = run({
      clients,
      visits: [
        ...visits,
        visit("c000", "2026-03-01", 100, 1, 8), // before the 10:00 send
        visit("c001", "2026-03-01", 100, 1, 18), // after it, same day
        visit("c002", addDays("2026-03-01", 30)), // last day of the window
        visit("c003", addDays("2026-03-01", 31)), // one day late
      ],
      campaigns: [campaign(ids.slice(0, 50))],
    })
    expect(r.campaigns[0]?.returned).toBe(2)
    expect(r.campaigns[0]?.salesInWindow).toBe(200)
  })

  it("ignores recipients who were not clients yet, and an empty campaign", () => {
    const { clients, visits } = hundred()
    const late: ImpactClient = { id: "late", registeredOn: "2026-04-01" }
    const r = run({
      clients: [...clients, late],
      visits,
      campaigns: [campaign(["late", "ghost"])],
    })
    expect(r.campaigns[0]).toMatchObject({ recipients: 0, verdict: "empty" })
    expect(r.byKind).toEqual([])
  })
})

describe("the send day is the photo", () => {
  // 40 clients registered on 1 Jan that never bought: "inactivo" by 1 Mar.
  const ids = Array.from({ length: 40 }, (_, i) => `i${i}`)
  const clients: ImpactClient[] = ids.map((id) => ({ id, registeredOn: "2026-01-01" }))
  const sent = campaign(ids)
  const visits = [visit("i0", "2026-03-06"), visit("i0", "2026-03-20"), visit("i0", "2026-04-20")]

  it("reads each client's segment as it was when the campaign went out", () => {
    const [c] = run({ clients, visits, campaigns: [sent] }).campaigns
    // Today i0 has three purchases; on the send day they had none.
    expect(c?.bySegment).toMatchObject([{ segment: "inactivo", recipients: 40, returned: 1 }])
    // Where they were when the window closed (two purchases by 31 Mar).
    expect(c?.moves).toEqual([{ from: "inactivo", to: "regular", clients: 1 }])
  })

  it("gives the same answer whenever it is computed", () => {
    const june = run({ today: "2026-06-30", clients, visits, campaigns: [sent] }).campaigns[0]
    const december = run({ today: "2026-12-31", clients, visits, campaigns: [sent] }).campaigns[0]
    expect(december?.bySegment.map((s) => [s.segment, s.recipients, s.returned])).toEqual(
      june?.bySegment.map((s) => [s.segment, s.recipients, s.returned]),
    )
    expect(december?.moves).toEqual(june?.moves)
  })

  it("lists every recipient with the photo and what they did", () => {
    const rows = campaignClients(input({ clients, visits, campaigns: [sent] }), "k1")
    expect(rows).toHaveLength(40)
    expect(rows?.find((r) => r.clientId === "i0")).toEqual({
      clientId: "i0",
      segmentAtSend: "inactivo",
      silenceDays: null,
      purchasesAtSend: 0,
      handedOver: false,
      returnedOn: "2026-03-06",
      purchases: 2,
      sales: 200,
      segmentAtClose: "regular",
    })
    expect(rows?.find((r) => r.clientId === "i1")).toMatchObject({
      returnedOn: null,
      purchases: 0,
      segmentAtClose: "inactivo",
    })
    expect(campaignClients(input({ clients, visits, campaigns: [sent] }), "nope")).toBeNull()
  })
})

describe("one purchase, one campaign", () => {
  const { clients, visits, ids } = hundred()
  const group = ids.slice(0, 40)
  const first = campaign(group, "2026-03-01", { id: "first", name: "Puntos por vencer" })
  // c000 buys after both messages; c020 only got the first one.
  const back = [
    visit("c000", "2026-03-08"),
    visit("c020", "2026-03-08"),
    visit("c000", "2026-03-20"),
  ]

  it("gives the purchase to the last message the client got before buying", () => {
    const second = campaign(group.slice(0, 5), "2026-03-05", { id: "second", kind: "birthday" })
    const r = run({ clients, visits: [...visits, ...back], campaigns: [first, second] })
    const byId = Object.fromEntries(r.campaigns.map((c) => [c.id, c]))
    // The 5 who got a second message stay in the first campaign, as "did not come back".
    expect(byId.first).toMatchObject({
      recipients: 40,
      handedOver: 5,
      returned: 1,
      salesInWindow: 100,
    })
    expect(byId.second).toMatchObject({
      recipients: 5,
      handedOver: 0,
      returned: 1,
      salesInWindow: 200,
    })
    // Every purchase is counted once across both.
    expect(sum(r.campaigns.map((c) => c.purchasesInWindow))).toBe(3)
  })

  it("stops counting a client's purchases at the next message they get", () => {
    // c020 came back for the first campaign; a later message takes the purchases after it.
    const later = campaign(["c020"], "2026-03-15", { id: "later" })
    const r = run({
      clients,
      visits: [...visits, ...back, visit("c020", "2026-03-18")],
      campaigns: [first, later],
    })
    const byId = Object.fromEntries(r.campaigns.map((c) => [c.id, c]))
    expect(byId.first).toMatchObject({ handedOver: 0, returned: 2, purchasesInWindow: 3 })
    expect(byId.later).toMatchObject({ returned: 1, purchasesInWindow: 1 })
  })

  it("orders a purchase and a message of the same day by the hour", () => {
    const sameDay = campaign(["c000"], "2026-03-08", { id: "same", sentAt: ms("2026-03-08", 18) })
    // Bought at noon, the message went out at 18:00: the first campaign keeps that purchase.
    const r = run({ clients, visits: [...visits, ...back], campaigns: [first, sameDay] })
    expect(r.campaigns.find((c) => c.id === "first")?.returned).toBe(2)
  })

  it("does not judge a campaign when too many recipients got another message", () => {
    const second = campaign(group.slice(0, 10), "2026-03-05", { id: "second" })
    const r = run({ clients, visits: [...visits, ...back], campaigns: [first, second] })
    const one = r.campaigns.find((c) => c.id === "first")
    expect(one).toMatchObject({
      handedOver: 10,
      verdict: "overlap",
      reliable: false,
      extraSales: null,
    })
  })

  it("never reads weekly sends to everybody as an effect", () => {
    // Purchases by pure routine, a message to all every week: nothing to claim.
    const weekly = Array.from({ length: 8 }, (_, i) =>
      campaign(ids, addDays("2026-03-01", i * 7), { id: `w${i}`, kind: "recurring" }),
    )
    const routine = ids.flatMap((id, i) =>
      [0, 1, 2, 3].map((k) => visit(id, addDays("2026-03-02", (i % 7) + k * 14))),
    )
    const r = run({ clients, visits: [...visits, ...routine], campaigns: weekly })
    expect(r.campaigns.filter((c) => c.verdict === "above")).toEqual([])
    expect(r.campaignTotals.extraSales).toBe(0)
  })

  it("does not compare with clients somebody else wrote to", () => {
    // Every non-recipient got another campaign inside the window: no clean comparables left.
    const noise = campaign(ids.slice(40), "2026-03-03", { id: "noise" })
    const r = run({ clients, visits: [...visits, ...back], campaigns: [first, noise] })
    expect(r.campaigns.find((c) => c.id === "first")?.bySegment[0]?.expectedFrom).toBe("history")
  })
})

describe("kinds and pressure", () => {
  const { clients, visits, ids } = hundred()

  it("pools small campaigns of a kind until they can be read", () => {
    // Four birthday sends of 10 clients: none can be read alone, together they can.
    const groups = [0, 1, 2, 3].map((g) => ids.slice(g * 10, g * 10 + 10))
    const sends = groups.map((g, i) => campaign(g, "2026-03-01", { id: `b${i}`, kind: "birthday" }))
    const back = [
      ...groups.flatMap((g) => g.slice(0, 6).map((id) => visit(id, "2026-03-09"))),
      ...ids.slice(40, 46).map((id) => visit(id, "2026-03-09")),
    ]
    const r = run({ clients, visits: [...visits, ...back], campaigns: [reachable(ids), ...sends] })
    expect(r.campaigns.filter((c) => c.kind === "birthday").every((c) => !c.reliable)).toBe(true)
    expect(r.byKind).toMatchObject([
      {
        kind: "birthday",
        campaigns: 4,
        measured: 4,
        recipients: 40,
        returned: 24,
        expected: 4,
        extraClients: 20,
        extraSales: 2000,
        verdict: "above",
        reliable: true,
      },
    ])
    expect(r.campaignTotals).toMatchObject({ kindsMeasured: 1, kindsAbove: 1, extraSales: 2000 })
  })

  it("nets wins and losses inside a kind", () => {
    // One send brings clients back; the other goes to clients who then come less
    // than the ones nobody wrote to. Together the kind did not beat chance.
    const a = ids.slice(0, 40)
    const b = ids.slice(40, 80)
    const rest = ids.slice(80)
    const r = run({
      clients,
      visits: [
        ...visits,
        ...a.slice(0, 16).map((id) => visit(id, "2026-03-09")),
        ...rest.slice(0, 4).map((id) => visit(id, "2026-03-09")),
        // In May, 30 of the clients with one old purchase come back on their own; none of b.
        ...a.slice(16).map((id) => visit(id, "2026-05-09")),
        ...rest.slice(4, 10).map((id) => visit(id, "2026-05-09")),
      ],
      campaigns: [
        reachable(ids),
        campaign(a, "2026-03-01", { id: "win", kind: "churn" }),
        campaign(b, "2026-05-01", { id: "loss", kind: "churn" }),
      ],
    })
    const churn = r.byKind.find((k) => k.kind === "churn")
    expect(r.campaigns.find((c) => c.id === "win")).toMatchObject({
      verdict: "above",
      extraSales: 1333,
    })
    expect(r.campaigns.find((c) => c.id === "loss")?.verdict).toBe("below")
    // Adding only the winner would claim S/ 1,333 that the kind as a whole did not earn.
    expect(churn).toMatchObject({ measured: 2, verdict: "below", extraSales: 0 })
    expect(r.campaignTotals.extraSales).toBe(0)
  })

  it("counts how many messages each client got this month", () => {
    const month = (day: string, id: string, recipients: string[]) =>
      campaign(recipients, day, { id })
    const r = run({
      today: "2026-06-30",
      clients,
      visits,
      campaigns: [
        month("2026-06-02", "p1", ["c000", "c001", "c002"]),
        month("2026-06-09", "p2", ["c000", "c001"]),
        month("2026-06-16", "p3", ["c000"]),
        month("2026-06-23", "p4", ["c000"]),
        month("2026-05-20", "old", ["c003"]),
      ],
    })
    expect(r.pressure).toEqual({ month: "2026-06", one: 1, twoOrThree: 1, fourPlus: 1 })
  })
})

describe("the conclusion in soles", () => {
  const { clients, visits, ids } = hundred()
  // 20 clients come back once: S/ 2,000 of return-visit sales in 3 months.
  const base = run({
    today: "2026-03-31",
    clients,
    visits: [...visits, ...ids.slice(0, 20).map((id) => visit(id, "2026-03-10"))],
  })
  const withCampaigns = (extraPurchases: number, extraSales: number) => ({
    ...base,
    campaignTotals: { kindsMeasured: 1, kindsAbove: 1, extraPurchases, extraSales },
  })

  it("turns the return-visit sales into generated sales, profit and return", () => {
    expect(concludeImpact(base, { factorPct: 20, marginPct: 30, monthlyFee: 100 })).toEqual({
      generated: 400,
      low: 200,
      high: 600,
      fromProgram: 400,
      fromCampaigns: 0,
      purchases: 4,
      profit: 120,
      // January (sign-ups), February and March on the bill.
      paid: 300,
      salesPerSol: 1.3,
      profitPerSol: 0.4,
    })
  })

  it("adds what campaigns measured without counting it twice", () => {
    const c = concludeImpact(withCampaigns(5, 500), {
      factorPct: 20,
      marginPct: 30,
      monthlyFee: 100,
    })
    // 20 % of the 1,500 that campaigns do not explain, plus the 500 they do.
    expect(c).toMatchObject({ fromProgram: 300, fromCampaigns: 500, generated: 800, purchases: 8 })
  })

  it("never claims more than what went through the card", () => {
    const c = concludeImpact(withCampaigns(900, 90_000), {
      factorPct: 100,
      marginPct: 30,
      monthlyFee: 100,
    })
    expect(c.generated).toBe(base.headline.sales)
    expect(c.high).toBe(base.headline.sales)
    expect(c.purchases).toBeLessThanOrEqual(base.headline.purchases)
  })

  it("has no return to show when the merchant pays nothing", () => {
    const c = concludeImpact(base, { factorPct: 20, marginPct: 30, monthlyFee: 0 })
    expect(c.salesPerSol).toBeNull()
    expect(c.profitPerSol).toBeNull()
  })

  it("keeps wild assumptions inside 0–100 %", () => {
    const c = concludeImpact(base, { factorPct: 250, marginPct: -5, monthlyFee: 100 })
    expect(c.generated).toBe(2000)
    expect(c.high).toBe(2000)
    expect(c.profit).toBe(0)
  })
})
