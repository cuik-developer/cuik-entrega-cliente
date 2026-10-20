import { beforeEach, describe, expect, it, vi } from "vitest"

/** Equipo Cuik "designs": save drafts (marked for review), never publish or delete. */

const { mockGetSession, selectQueue, updates, mockGetDesignById } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  selectQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  mockGetDesignById: vi.fn(),
}))

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock("@/lib/sa-view", () => ({ saViewTenantFromCookieHeader: () => null }))
vi.mock("@/lib/wallet/apns-client-cert", () => ({ apnsClientCertFor: vi.fn() }))
vi.mock("@/lib/wallet/tenant-apple-config", () => ({ getTenantAppleConfig: vi.fn() }))
vi.mock("@cuik/wallet/apple", () => ({ sendApnsPush: vi.fn() }))
vi.mock("@cuik/wallet/google", () => ({}))
vi.mock("@cuik/wallet/shared", () => ({
  resolvePassFields: vi.fn(),
  validateAppleApnsEnv: () => null,
  validateGoogleEnv: () => null,
}))
vi.mock("./queries", () => ({ getDesignById: mockGetDesignById, listDesignsByTenant: vi.fn() }))
vi.mock("@cuik/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    limit: async () => selectQueue.shift() ?? [],
  }
  const col = (name: string) => ({ name })
  return {
    db: {
      select: () => chain,
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values)
          return { where: async () => undefined }
        },
      }),
      insert: vi.fn(),
      delete: vi.fn(),
    },
    and: vi.fn(),
    desc: vi.fn(),
    eq: vi.fn(),
    inArray: vi.fn(),
    isNotNull: vi.fn(),
    ne: vi.fn(),
    sql: vi.fn(),
    member: {},
    organization: {},
    appleDevices: {},
    clients: {},
    passAssets: {},
    passInstances: {},
    promotions: {},
    rewards: {},
    tenants: {},
    passDesigns: { id: col("id"), isActive: col("is_active") },
    user: { id: col("id"), role: col("role"), staffPermissions: col("staff_permissions") },
  }
})

import { deleteDesign, publishDesign, updateDesign } from "./actions"

const DESIGN = "11111111-1111-4111-8111-111111111111"

function asStaff(permissions: string[]) {
  mockGetSession.mockResolvedValue({ user: { id: "diego", role: "staff" }, session: {} })
  // First select of every action: getStaffPermissions.
  selectQueue.push([{ role: "staff", permissions }])
}

describe("pass design actions for Equipo Cuik", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectQueue.length = 0
    updates.length = 0
  })

  it("staff with designs saves a draft and marks it ready for review", async () => {
    asStaff(["designs"])
    selectQueue.push([{ isActive: false }])
    const res = await updateDesign(DESIGN, { colors: { backgroundColor: "rgb(0,0,0)" } })
    expect(res).toEqual({ success: true, data: { id: DESIGN } })
    expect(updates).toHaveLength(1)
    expect(updates[0].reviewRequestedBy).toBe("diego")
    expect(updates[0].reviewRequestedAt).toBeInstanceOf(Date)
  })

  it("staff cannot save over a published (active) design", async () => {
    asStaff(["designs"])
    selectQueue.push([{ isActive: true }])
    const res = await updateDesign(DESIGN, { colors: {} })
    expect(res.success).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it("staff with designs cannot publish", async () => {
    asStaff(["designs"])
    const res = await publishDesign(DESIGN)
    expect(res.success).toBe(false)
    expect(mockGetDesignById).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it("staff with designs cannot delete", async () => {
    asStaff(["designs"])
    const res = await deleteDesign(DESIGN)
    expect(res.success).toBe(false)
  })

  it("staff without designs cannot save", async () => {
    asStaff(["metrics"])
    const res = await updateDesign(DESIGN, { colors: {} })
    expect(res.success).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it("the owner still reaches publish (and saves without a review mark)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "owner", role: "super_admin" }, session: {} })
    mockGetDesignById.mockResolvedValue(null)
    expect(await publishDesign(DESIGN)).toEqual({ success: false, error: "Diseño no encontrado" })
    expect(mockGetDesignById).toHaveBeenCalledWith(DESIGN)

    const saved = await updateDesign(DESIGN, { colors: {} })
    expect(saved.success).toBe(true)
    expect(updates[0]).not.toHaveProperty("reviewRequestedBy")
  })
})
