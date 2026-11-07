import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Equipo Cuik "designs": save drafts (marked for review), never publish or delete.
 * "designs_publish": publish, edit live designs, delete drafts only.
 */

const {
  mockGetSession,
  selectQueue,
  updates,
  returningQueue,
  deletes,
  mockGetDesignById,
  mockRecord,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  selectQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  /** What each update(...).returning() yields, in order (default: one row). */
  returningQueue: [] as unknown[][],
  deletes: [] as unknown[],
  mockGetDesignById: vi.fn(),
  mockRecord: vi.fn(),
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
vi.mock("@/lib/admin/product-changes", () => ({ recordProductChange: mockRecord }))
vi.mock("@cuik/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    limit: async () => selectQueue.shift() ?? [],
    for: async () => selectQueue.shift() ?? [],
  }
  const update = () => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values)
      return {
        where: () =>
          Object.assign(Promise.resolve(undefined), {
            returning: async () =>
              returningQueue.shift() ?? [{ tenantId: "t1", name: "Diseño", isActive: false }],
          }),
      }
    },
  })
  const tx = {
    select: () => chain,
    update,
    delete: (table: unknown) => ({
      where: async () => {
        deletes.push(table)
      },
    }),
  }
  const col = (name: string) => ({ name })
  return {
    db: {
      select: () => chain,
      update,
      insert: vi.fn(),
      delete: vi.fn(),
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
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
    passAssets: { name: "pass_assets" },
    passInstances: {},
    promotions: {},
    rewards: {},
    tenants: { id: col("tenant_id") },
    passDesigns: { id: col("id"), isActive: col("is_active"), name: col("name") },
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
    returningQueue.length = 0
    deletes.length = 0
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

describe('pass design actions with "Publicar diseños"', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectQueue.length = 0
    updates.length = 0
    returningQueue.length = 0
    deletes.length = 0
  })

  it("reaches publish", async () => {
    asStaff(["designs", "designs_publish"])
    mockGetDesignById.mockResolvedValue(null)
    expect(await publishDesign(DESIGN)).toEqual({ success: false, error: "Diseño no encontrado" })
    expect(mockGetDesignById).toHaveBeenCalledWith(DESIGN)
  })

  it("saves a published design directly, without a review mark", async () => {
    asStaff(["designs", "designs_publish"])
    const res = await updateDesign(DESIGN, { colors: {} })
    expect(res).toEqual({ success: true, data: { id: DESIGN } })
    expect(updates[0]).not.toHaveProperty("reviewRequestedBy")
  })

  it("deletes a draft that issued no passes", async () => {
    asStaff(["designs", "designs_publish"])
    selectQueue.push([{ isActive: false, name: "Borrador", tenantId: "t1" }], [])
    expect(await deleteDesign(DESIGN)).toEqual({ success: true, data: { id: DESIGN } })
    expect(deletes).toEqual([
      { name: "pass_assets" },
      expect.objectContaining({ isActive: expect.anything() }),
    ])
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deleted", targetName: "Borrador", tenantId: "t1" }),
    )
  })

  it("cannot delete the published design", async () => {
    asStaff(["designs", "designs_publish"])
    selectQueue.push([{ isActive: true }])
    const res = await deleteDesign(DESIGN)
    expect(res.success).toBe(false)
    expect(deletes).toHaveLength(0)
  })

  it("staff save of a design published meanwhile is refused, not reported as saved", async () => {
    asStaff(["designs"])
    selectQueue.push([{ isActive: false }], [])
    returningQueue.push([])
    const res = await updateDesign(DESIGN, { colors: {} })
    expect(res.success).toBe(false)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it("publishes, records who published and logs it", async () => {
    asStaff(["designs", "designs_publish"])
    mockGetDesignById.mockResolvedValue({
      design: {
        id: DESIGN,
        tenantId: "t1",
        type: "apple_store",
        version: 3,
        name: "Tarjeta",
        canvasData: { any: true },
        promotionId: null,
        fields: null,
      },
    })
    selectQueue.push([], [{ id: "t1" }]) // no active promotion; tenant lock
    returningQueue.push([{ id: DESIGN }])
    const res = await publishDesign(DESIGN)
    expect(res).toEqual({ success: true, data: { id: DESIGN, version: 4 } })
    const activate = updates.find((u) => u.isActive === true)
    expect(activate?.publishedBy).toBe("diego")
    expect(activate?.publishedAt).toBeInstanceOf(Date)
    expect(activate?.reviewRequestedAt).toBeNull()
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "published", detail: { version: 4, type: "apple_store" } }),
    )
  })

  it("a publish whose design was deleted meanwhile fails instead of reporting success", async () => {
    asStaff(["designs", "designs_publish"])
    mockGetDesignById.mockResolvedValue({
      design: {
        id: DESIGN,
        tenantId: "t1",
        type: "apple_store",
        version: 3,
        name: "Tarjeta",
        canvasData: { any: true },
        promotionId: null,
        fields: null,
      },
    })
    selectQueue.push([], [{ id: "t1" }])
    returningQueue.push([])
    expect(await publishDesign(DESIGN)).toEqual({ success: false, error: "Diseño no encontrado" })
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it("the owner deletes the active design when it issued no passes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "owner", role: "super_admin" }, session: {} })
    selectQueue.push([{ isActive: true, name: "Activo", tenantId: "t1" }], [])
    expect(await deleteDesign(DESIGN)).toEqual({ success: true, data: { id: DESIGN } })
    expect(deletes).toHaveLength(2)
  })

  it("not even the owner deletes a design that issued passes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "owner", role: "super_admin" }, session: {} })
    selectQueue.push([{ isActive: true, name: "Activo", tenantId: "t1" }], [{ id: "instance-1" }])
    const res = await deleteDesign(DESIGN)
    expect(res.success).toBe(false)
    expect(deletes).toHaveLength(0)
  })

  it("cannot delete a draft that already issued passes", async () => {
    asStaff(["designs", "designs_publish"])
    selectQueue.push([{ isActive: false }], [{ id: "instance-1" }])
    const res = await deleteDesign(DESIGN)
    expect(res.success).toBe(false)
    expect(deletes).toHaveLength(0)
  })
})
