import { beforeEach, describe, expect, it, vi } from "vitest"

/** Simulador: only Equipo Cuik with "simulator" (or the owner), only on demo comercios. */

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  demoTenant: vi.fn(),
  demoClientState: vi.fn(),
  registerVisit: vi.fn(),
  executeCampaign: vi.fn(),
  trigger: vi.fn(),
  record: vi.fn(),
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  updates: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/admin-access", () => ({ requireSuperAdminOrAction: m.guard }))
vi.mock("@/lib/admin/simulator", () => ({
  NOT_A_DEMO_ERROR: "no es demo",
  demoTenant: m.demoTenant,
  demoClientState: m.demoClientState,
  searchDemoClients: vi.fn(async () => []),
}))
vi.mock("@/lib/loyalty", () => ({ registerVisit: m.registerVisit }))
vi.mock("@/lib/campaigns", () => ({ executeCampaign: m.executeCampaign }))
vi.mock("@/lib/wallet/trigger-wallet-update", () => ({ triggerWalletUpdate: m.trigger }))
vi.mock("@/lib/admin/product-changes", () => ({ recordProductChange: m.record }))
vi.mock("@/lib/loyalty/card-complete", () => ({ cardCompleteNotice: () => null }))
vi.mock("@cuik/db", () => {
  const chain = { from: () => chain, where: () => chain, limit: async () => [{ name: "Demo" }] }
  return {
    db: {
      select: () => chain,
      update: () => ({
        set: (values: Record<string, unknown>) => {
          m.updates.push(values)
          return { where: async () => undefined }
        },
      }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          m.inserts.push({ table, values })
          return Object.assign(Promise.resolve(undefined), {
            returning: async () => [{ id: "camp-1" }],
          })
        },
      }),
    },
    eq: vi.fn(),
    tenants: { name: {}, automations: {}, id: {} },
    campaigns: { id: {}, name: "campaigns" },
    campaignSegments: { name: "campaign_segments" },
  }
})

import { simulateCampaign, simulateVisit } from "./actions"

const T = "11111111-1111-4111-8111-111111111111"
const C = "22222222-2222-4222-8222-222222222222"
const SESSION = { user: { id: "diego", name: "Diego" } }
const DEMO = { id: T, name: "Demo Cuik", slug: "demo", program: "stamps", maxVisits: 10 }
const CLIENT = { id: C, name: "Ana", qrCode: "QR1", status: "active" }

describe("simulator actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.inserts.length = 0
    m.updates.length = 0
    m.guard.mockResolvedValue({ session: SESSION, access: { kind: "staff" }, error: null })
    m.demoTenant.mockResolvedValue(DEMO)
    m.demoClientState.mockResolvedValue(CLIENT)
    m.trigger.mockResolvedValue(undefined)
  })

  it("asks for the simulator permission", async () => {
    m.guard.mockResolvedValue({ session: null, access: { kind: "staff" }, error: "sin permiso" })
    expect(await simulateVisit({ tenantId: T, clientId: C })).toEqual({
      success: false,
      error: "sin permiso",
    })
    expect(m.guard).toHaveBeenCalledWith("simulator")
    expect(m.registerVisit).not.toHaveBeenCalled()
  })

  it("never touches a comercio that is not a demo", async () => {
    m.demoTenant.mockResolvedValue(null)
    expect((await simulateVisit({ tenantId: T, clientId: C })).success).toBe(false)
    expect((await simulateCampaign({ tenantId: T, clientId: null, message: "Hola" })).success).toBe(
      false,
    )
    expect(m.registerVisit).not.toHaveBeenCalled()
    expect(m.executeCampaign).not.toHaveBeenCalled()
    expect(m.inserts).toHaveLength(0)
  })

  it("registers the visit like the cashier, refreshes the pass and logs it", async () => {
    m.registerVisit.mockResolvedValue({
      code: "OK",
      client: { id: C, name: "Ana", lastName: null, totalVisits: 8 },
      stamps: { current: 8, max: 10 },
      cycleComplete: false,
      pendingRewards: 0,
      milestone: null,
    })
    const res = await simulateVisit({ tenantId: T, clientId: C })
    expect(res.success).toBe(true)
    expect(m.registerVisit).toHaveBeenCalledWith(
      expect.objectContaining({ qrCode: "QR1", tenantId: T, cashierId: "diego", source: "manual" }),
    )
    expect(m.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ stampsInCycle: 8, maxVisits: 10 }),
    )
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ area: "simulator", action: "visit_registered" }),
    )
  })

  it("a rejected visit pushes and logs nothing", async () => {
    m.registerVisit.mockResolvedValue({ code: "CLIENT_NOT_FOUND" })
    expect((await simulateVisit({ tenantId: T, clientId: C })).success).toBe(false)
    expect(m.trigger).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
  })

  it("points programs need the purchase amount", async () => {
    m.demoTenant.mockResolvedValue({ ...DEMO, program: "points" })
    expect((await simulateVisit({ tenantId: T, clientId: C })).success).toBe(false)
    expect(m.registerVisit).not.toHaveBeenCalled()
  })

  it("caps the purchase amount like the cashier", async () => {
    m.demoTenant.mockResolvedValue({ ...DEMO, program: "points" })
    const res = await simulateVisit({ tenantId: T, clientId: C, amount: 50000 })
    expect(res.success).toBe(false)
    expect(m.registerVisit).not.toHaveBeenCalled()
  })

  it("a test campaign that reached nobody is cancelled, not left as a draft", async () => {
    m.executeCampaign.mockResolvedValue({
      status: "failed",
      targetCount: 1,
      sentCount: 0,
      skippedCount: 0,
      errors: ["APNs caído"],
    })
    const res = await simulateCampaign({ tenantId: T, clientId: C, message: "Hola" })
    expect(res.success).toBe(false)
    expect(m.updates).toEqual([{ status: "cancelled" }])
  })

  it("sends a one-client campaign through the campaign engine", async () => {
    m.executeCampaign.mockResolvedValue({
      status: "sent",
      targetCount: 1,
      sentCount: 1,
      skippedCount: 0,
      errors: [],
    })
    const res = await simulateCampaign({ tenantId: T, clientId: C, message: "Hola" })
    expect(res).toEqual({ success: true, data: { message: "Campaña enviada a 1 cliente." } })
    expect(m.inserts[0].values).toMatchObject({ tenantId: T, type: "push", status: "draft" })
    expect(m.inserts[1].values).toMatchObject({ filter: { clientIds: [C] } })
    expect(m.executeCampaign).toHaveBeenCalledWith("camp-1")
  })
})
