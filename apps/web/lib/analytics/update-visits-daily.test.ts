import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockInsert, mockValues, mockOnConflictDoUpdate } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
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
      insert: mockInsert,
    },
    sql: sqlTag,
    visitsDaily: {
      tenantId: "tenantId",
      date: "date",
      locationId: "locationId",
      totalVisits: "totalVisits",
      uniqueClients: "uniqueClients",
      newClients: "newClients",
      rewardsRedeemed: "rewardsRedeemed",
    },
  }
})

import { updateRewardsRedeemed, updateVisitsDaily } from "./update-visits-daily"

describe("updateVisitsDaily", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
    mockOnConflictDoUpdate.mockResolvedValue(undefined)
  })

  it("calls db.insert with correct initial values when isNewClient is true", async () => {
    const date = new Date("2025-03-15T12:00:00Z")

    await updateVisitsDaily("tenant-1", "loc-1", date, { isNewClient: true, tenantTimezone: "UTC" })

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        locationId: "loc-1",
        date: "2025-03-15",
        totalVisits: 1,
        uniqueClients: 1,
        newClients: 1,
        rewardsRedeemed: 0,
      }),
    )
  })

  it("sets newClients to 0 when isNewClient is false", async () => {
    const date = new Date("2025-03-15T12:00:00Z")

    await updateVisitsDaily("tenant-1", "loc-1", date, { isNewClient: false, tenantTimezone: "UTC" })

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        newClients: 0,
      }),
    )
  })

  it("calls onConflictDoUpdate to handle upsert", async () => {
    const date = new Date("2025-03-15T12:00:00Z")

    await updateVisitsDaily("tenant-1", "loc-1", date, { isNewClient: true, tenantTimezone: "UTC" })

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({
          totalVisits: expect.anything(),
          uniqueClients: expect.anything(),
          newClients: expect.anything(),
        }),
      }),
    )
  })

  it("extracts date string correctly from Date object", async () => {
    const date = new Date("2025-12-31T23:59:59Z")

    await updateVisitsDaily("t", "l", date, { isNewClient: false, tenantTimezone: "UTC" })

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2025-12-31",
      }),
    )
  })
})

describe("updateRewardsRedeemed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
    mockOnConflictDoUpdate.mockResolvedValue(undefined)
  })

  it("inserts with rewardsRedeemed=1 and zeroes for visit counters", async () => {
    const date = new Date("2025-06-01T08:00:00Z")

    await updateRewardsRedeemed("tenant-2", "loc-2", date, "UTC")

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-2",
        locationId: "loc-2",
        date: "2025-06-01",
        totalVisits: 0,
        uniqueClients: 0,
        newClients: 0,
        rewardsRedeemed: 1,
      }),
    )
  })

  it("calls onConflictDoUpdate incrementing only rewardsRedeemed", async () => {
    const date = new Date("2025-06-01T08:00:00Z")

    await updateRewardsRedeemed("tenant-2", "loc-2", date, "UTC")

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
    const conflictArg = mockOnConflictDoUpdate.mock.calls[0][0]
    expect(conflictArg.set).toHaveProperty("rewardsRedeemed")
    expect(Object.keys(conflictArg.set)).toEqual(["rewardsRedeemed"])
  })
})
