import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
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
      execute: mockExecute,
    },
    sql: sqlTag,
  }
})

import { computeAnalyticsSummary } from "./compute-summary"

describe("computeAnalyticsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns correct AnalyticsSummary shape with data", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalVisits: 150, uniqueClients: 50 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [{ newClients: 20 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalCreated: 30, totalRedeemed: 10 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [
        { id: "c1", name: "Alice", visitCount: 20 },
        { id: "c2", name: "Bob", visitCount: 15 },
      ],
    })

    const result = await computeAnalyticsSummary("tenant-1", {
      from: "2025-01-01",
      to: "2025-01-31",
    })

    expect(result).toEqual({
      totalVisits: 150,
      uniqueClients: 50,
      newClients: 20,
      rewardsRedeemed: 10,
      redemptionRate: 33.33,
      avgVisitsPerClient: 3,
      topClients: [
        { id: "c1", name: "Alice", visitCount: 20 },
        { id: "c2", name: "Bob", visitCount: 15 },
      ],
    })
  })

  it("returns zeros when there is no data", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] }) // visits agg
    mockExecute.mockResolvedValueOnce({ rows: [] }) // new clients
    mockExecute.mockResolvedValueOnce({ rows: [] }) // rewards
    mockExecute.mockResolvedValueOnce({ rows: [] }) // top clients

    const result = await computeAnalyticsSummary("tenant-empty", {
      from: "2025-01-01",
      to: "2025-01-31",
    })

    expect(result).toEqual({
      totalVisits: 0,
      uniqueClients: 0,
      newClients: 0,
      rewardsRedeemed: 0,
      redemptionRate: 0,
      avgVisitsPerClient: 0,
      topClients: [],
    })
  })

  it("returns topClients ordered by visitCount descending", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalVisits: 100, uniqueClients: 30 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [{ newClients: 5 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalCreated: 10, totalRedeemed: 3 }],
    })
    mockExecute.mockResolvedValueOnce({
      rows: [
        { id: "c3", name: "Top", visitCount: 50 },
        { id: "c4", name: "Second", visitCount: 30 },
        { id: "c5", name: "Third", visitCount: 20 },
      ],
    })

    const result = await computeAnalyticsSummary("tenant-1")

    expect(result.topClients[0].visitCount).toBeGreaterThanOrEqual(result.topClients[1].visitCount)
    expect(result.topClients[1].visitCount).toBeGreaterThanOrEqual(result.topClients[2].visitCount)
  })

  it("computes redemptionRate as 0 when no rewards created", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalVisits: 10, uniqueClients: 5 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [{ newClients: 2 }] })
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalCreated: 0, totalRedeemed: 0 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const result = await computeAnalyticsSummary("tenant-1", {
      from: "2025-01-01",
      to: "2025-01-31",
    })

    expect(result.redemptionRate).toBe(0)
  })

  it("computes avgVisitsPerClient correctly", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalVisits: 200, uniqueClients: 40 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [{ newClients: 10 }] })
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalCreated: 20, totalRedeemed: 5 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const result = await computeAnalyticsSummary("tenant-1", {
      from: "2025-01-01",
      to: "2025-01-31",
    })

    expect(result.avgVisitsPerClient).toBe(5)
  })

  it("uses default date range when opts not provided", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalVisits: 0, uniqueClients: 0 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [{ newClients: 0 }] })
    mockExecute.mockResolvedValueOnce({
      rows: [{ totalCreated: 0, totalRedeemed: 0 }],
    })
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const result = await computeAnalyticsSummary("tenant-1")
    expect(result).toBeDefined()
    expect(result.totalVisits).toBe(0)
  })
})
