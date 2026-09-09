import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
}))

vi.mock("@cuik/db", () => {
  const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    _tag: "sql",
  })
  sqlTag.join = vi.fn()

  return {
    db: {
      select: mockSelect,
    },
    sql: sqlTag,
    clients: {
      id: "id",
      tenantId: "tenantId",
      status: "status",
      tier: "tier",
      totalVisits: "totalVisits",
      createdAt: "createdAt",
    },
    clientTagAssignments: {
      clientId: "clientId",
      tagId: "tagId",
    },
    visits: {},
    eq: vi.fn((a, b) => ({ type: "eq", left: a, right: b })),
    ne: vi.fn((a, b) => ({ type: "ne", left: a, right: b })),
    and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
    inArray: vi.fn((col, vals) => ({ type: "inArray", col, vals })),
  }
})

import { resolveSegment } from "./resolve-segment"

describe("resolveSegment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
  })

  it("returns client IDs for 'todos' preset", async () => {
    mockWhere.mockResolvedValue([{ id: "client-1" }, { id: "client-2" }, { id: "client-3" }])

    const result = await resolveSegment("tenant-1", { preset: "todos" })

    expect(result.clientIds).toEqual(["client-1", "client-2", "client-3"])
    expect(result.count).toBe(3)
  })

  it("returns client IDs for 'activos' preset", async () => {
    mockWhere.mockResolvedValue([{ id: "active-1" }])

    const result = await resolveSegment("tenant-1", { preset: "activos" })

    expect(result.clientIds).toEqual(["active-1"])
    expect(result.count).toBe(1)
  })

  it("returns client IDs for 'inactivos' preset", async () => {
    mockWhere.mockResolvedValue([{ id: "inactive-1" }])

    const result = await resolveSegment("tenant-1", { preset: "inactivos" })

    expect(result.clientIds).toEqual(["inactive-1"])
    expect(result.count).toBe(1)
  })

  it("returns client IDs for 'vip' preset", async () => {
    mockWhere.mockResolvedValue([{ id: "vip-1" }])

    const result = await resolveSegment("tenant-1", { preset: "vip" })

    expect(result.clientIds).toEqual(["vip-1"])
    expect(result.count).toBe(1)
  })

  it("returns client IDs for 'nuevos' preset", async () => {
    mockWhere.mockResolvedValue([{ id: "new-1" }, { id: "new-2" }])

    const result = await resolveSegment("tenant-1", { preset: "nuevos" })

    expect(result.clientIds).toEqual(["new-1", "new-2"])
    expect(result.count).toBe(2)
  })

  it("returns empty array when no clients match", async () => {
    mockWhere.mockResolvedValue([])

    const result = await resolveSegment("tenant-1", { preset: "vip" })

    expect(result.clientIds).toEqual([])
    expect(result.count).toBe(0)
  })

  it("handles custom conditions with minVisits", async () => {
    mockWhere.mockResolvedValue([{ id: "c1" }])

    const result = await resolveSegment("tenant-1", {
      conditions: [{ field: "totalVisits", operator: "gte", value: 10 }],
    })

    expect(result.clientIds).toEqual(["c1"])
  })

  it("handles custom conditions with tagIds", async () => {
    mockWhere.mockResolvedValue([{ id: "tagged-1" }])

    const result = await resolveSegment("tenant-1", {
      tagIds: ["tag-uuid-1", "tag-uuid-2"],
    })

    expect(result.clientIds).toEqual(["tagged-1"])
  })

  it("always queries the database with select", async () => {
    mockWhere.mockResolvedValue([])

    await resolveSegment("tenant-1", { preset: "todos" })

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockWhere).toHaveBeenCalledTimes(1)
  })

  describe("clientIds (Excel import)", () => {
    type SqlChunk = { _tag: "sql"; strings: TemplateStringsArray; values: unknown[] }
    function anyCondition(): SqlChunk | undefined {
      const where = mockWhere.mock.calls[0][0] as { conditions: unknown[] }
      return where.conditions.find(
        (c): c is SqlChunk =>
          typeof c === "object" &&
          c !== null &&
          (c as SqlChunk)._tag === "sql" &&
          (c as SqlChunk).strings.join("").includes("= ANY("),
      )
    }

    it("binds the id list as ONE postgres array literal, not a tuple of params", async () => {
      // Regression: passing the JS array straight into sql`` made Drizzle emit
      // `= ANY(($1, $2)::uuid[])`, which Postgres rejects.
      mockWhere.mockResolvedValue([{ id: "a" }, { id: "b" }])

      const result = await resolveSegment("tenant-1", { clientIds: ["a", "b"] })

      const cond = anyCondition()
      expect(cond).toBeDefined()
      expect(cond?.strings.join("")).toContain("::uuid[]")
      // values[0] is the mocked clients.id column; values[1] must be the literal.
      expect(cond?.values).toEqual(["id", "{a,b}"])
      expect(result.clientIds).toEqual(["a", "b"])
    })

    it("adds no condition for an empty list (zod min(1) must guard this upstream)", async () => {
      mockWhere.mockResolvedValue([])

      await resolveSegment("tenant-1", { clientIds: [] })

      expect(anyCondition()).toBeUndefined()
    })
  })
})
