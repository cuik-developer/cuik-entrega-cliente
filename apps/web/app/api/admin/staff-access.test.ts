import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Equipo Cuik on the super-admin APIs: default deny, only the deliberately
 * opened routes accept staff, and only with the matching permission.
 */

const { mockGetSession, mockUserRow, mockListCampaigns, mockLoadFinance, mockMetrics } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockUserRow: vi.fn(),
    mockListCampaigns: vi.fn(),
    mockLoadFinance: vi.fn(),
    mockMetrics: vi.fn(),
  }),
)

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock("@/lib/sa-view", () => ({ saViewTenantFromCookieHeader: () => null }))
vi.mock("@cuik/db", () => {
  // Only getStaffPermissions reads the DB here: select(...).from(user).where(...).limit(1)
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      const row = mockUserRow()
      return row ? [row] : []
    },
  }
  return {
    db: { select: () => chain },
    and: vi.fn(),
    eq: vi.fn(),
    inArray: vi.fn(),
    member: {},
    organization: {},
    tenants: {},
    user: { role: "role", staffPermissions: "staff_permissions", id: "id" },
  }
})
vi.mock("@/lib/admin/campaign-admin", () => ({ listAdminCampaigns: mockListCampaigns }))
vi.mock("@/lib/admin/finance-data", () => ({ loadFinance: mockLoadFinance }))
vi.mock("@/lib/admin/platform-metrics", () => ({ computePlatformMetrics: mockMetrics }))

import { GET as getCampaigns } from "./campaigns/route"
import { GET as getFinance } from "./finance/route"
import { GET as getMetrics } from "./metrics/route"

function as(role: string, permissions: string[] | null, dbRole = role) {
  mockGetSession.mockResolvedValue({ user: { id: "u1", role }, session: { id: "s1" } })
  mockUserRow.mockReturnValue({ role: dbRole, permissions })
}

const req = (path: string) => new Request(`http://localhost${path}`)

describe("super-admin APIs with Equipo Cuik staff", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListCampaigns.mockResolvedValue({ rows: [], total: 0 })
    mockLoadFinance.mockResolvedValue({ ok: true })
    mockMetrics.mockResolvedValue({
      kpis: { mrr: { cur: 1200, prev: 900 } },
      insights: [
        { severity: "positive", text: "El ingreso mensual estimado subió S/ 300 respecto…" },
        { severity: "warning", text: "Las visitas cayeron 10%." },
      ],
      tenants: [{ id: "t1", planPrice: 99 }],
    })
  })

  it("rejects staff without the permission (403)", async () => {
    as("staff", ["designs"])
    const res = await getCampaigns(req("/api/admin/campaigns"))
    expect(res.status).toBe(403)
    expect(mockListCampaigns).not.toHaveBeenCalled()
  })

  it("rejects staff with no permissions at all (default deny)", async () => {
    as("staff", null)
    expect((await getCampaigns(req("/api/admin/campaigns"))).status).toBe(403)
  })

  it("accepts staff holding the permission", async () => {
    as("staff", ["campaigns"])
    const res = await getCampaigns(req("/api/admin/campaigns"))
    expect(res.status).toBe(200)
    expect(mockListCampaigns).toHaveBeenCalledOnce()
  })

  it("trusts the DB, not the session, for the role (revoked staff → 403)", async () => {
    as("staff", ["campaigns"], "user")
    expect((await getCampaigns(req("/api/admin/campaigns"))).status).toBe(403)
  })

  it("keeps finance owner-only even for staff with every permission", async () => {
    as("staff", ["designs", "branding", "campaigns", "tenants_view", "metrics"])
    const res = await getFinance(req("/api/admin/finance"))
    expect(res.status).toBe(403)
    expect(mockLoadFinance).not.toHaveBeenCalled()
  })

  it("still lets the owner in", async () => {
    as("super_admin", null)
    expect((await getFinance(req("/api/admin/finance"))).status).toBe(200)
    expect((await getCampaigns(req("/api/admin/campaigns"))).status).toBe(200)
  })

  it("keeps merchant admins and cashiers out", async () => {
    as("admin", ["campaigns"])
    expect((await getCampaigns(req("/api/admin/campaigns"))).status).toBe(403)
    as("user", ["campaigns"])
    expect((await getCampaigns(req("/api/admin/campaigns"))).status).toBe(403)
  })

  it("gives staff metrics without revenue and without the Excel export", async () => {
    as("staff", ["metrics"])
    const xlsx = await getMetrics(
      req("/api/admin/metrics?from=2026-10-01&to=2026-10-19&format=xlsx"),
    )
    expect(xlsx.status).toBe(403)

    const res = await getMetrics(req("/api/admin/metrics?from=2026-10-01&to=2026-10-19"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.kpis.mrr).toEqual({ cur: 0, prev: 0 })
    expect(json.data.tenants[0].planPrice).toBe(0)
    expect(json.data.insights).toHaveLength(1)
    expect(json.data.revenueHidden).toBe(true)
  })
})
