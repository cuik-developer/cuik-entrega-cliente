import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockSelect, mockFrom, mockWhere, mockExecute, mockInsert, mockValues, mockOnConflict } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockExecute: vi.fn(),
    mockInsert: vi.fn(),
    mockValues: vi.fn(),
    mockOnConflict: vi.fn(),
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
      execute: mockExecute,
      insert: mockInsert,
    },
    sql: sqlTag,
    tenants: { id: "id", status: "status" },
    visitsDaily: {
      tenantId: "tenantId",
      date: "date",
      locationId: "locationId",
    },
    campaigns: { id: "id", status: "status", scheduledAt: "scheduledAt" },
  }
})

vi.mock("@/lib/api-utils", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ success: true, data })),
  errorResponse: vi.fn((error: string, status: number) =>
    Response.json({ success: false, error }, { status }),
  ),
}))

vi.mock("@/lib/analytics", () => ({
  calculateRetentionCohorts: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/campaigns", () => ({
  executeCampaign: vi.fn().mockResolvedValue({
    campaignId: "c1",
    status: "sent",
    targetCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    errors: [],
  }),
}))

function makeRequest(cronSecret?: string): Request {
  const headers = new Headers()
  if (cronSecret) {
    headers.set("x-cron-secret", cronSecret)
  }
  return new Request("http://localhost/api/cron/test", {
    method: "POST",
    headers,
  })
}

describe("Cron route: CRON_SECRET validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret-123"

    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockWhere.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict })
    mockOnConflict.mockResolvedValue(undefined)
    mockExecute.mockResolvedValue({ rows: [] })
  })

  it("analytics-daily returns 401 without x-cron-secret header", async () => {
    const { POST } = await import("@/app/api/cron/analytics-daily/route")
    const request = makeRequest()

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("analytics-daily returns 401 with wrong secret", async () => {
    const { POST } = await import("@/app/api/cron/analytics-daily/route")
    const request = makeRequest("wrong-secret")

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("analytics-daily succeeds with correct secret", async () => {
    const { POST } = await import("@/app/api/cron/analytics-daily/route")
    const request = makeRequest("test-secret-123")

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveProperty("processed")
  })

  it("analytics-retention returns 401 without secret", async () => {
    const { POST } = await import("@/app/api/cron/analytics-retention/route")
    const request = makeRequest()

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("analytics-retention succeeds with correct secret", async () => {
    const { POST } = await import("@/app/api/cron/analytics-retention/route")
    const request = makeRequest("test-secret-123")

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it("campaigns-scheduled returns 401 without secret", async () => {
    const { POST } = await import("@/app/api/cron/campaigns-scheduled/route")
    const request = makeRequest()

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("campaigns-scheduled returns 401 with empty string secret", async () => {
    const { POST } = await import("@/app/api/cron/campaigns-scheduled/route")
    // Empty string header — the campaigns-scheduled route checks for !cronSecret too
    const headers = new Headers()
    headers.set("x-cron-secret", "")
    const request = new Request("http://localhost/api/cron/test", {
      method: "POST",
      headers,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("campaigns-scheduled succeeds with correct secret", async () => {
    const { POST } = await import("@/app/api/cron/campaigns-scheduled/route")
    const request = makeRequest("test-secret-123")

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })
})

describe("Cron route: analytics-daily processes tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret-123"

    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict })
    mockOnConflict.mockResolvedValue(undefined)
  })

  it("processes each active tenant", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "t1" }, { id: "t2" }])
    mockExecute
      .mockResolvedValueOnce({
        rows: [{ locationId: "loc1", totalVisits: 5, uniqueClients: 3, newClients: 1 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ locationId: "loc1", totalVisits: 2, uniqueClients: 2, newClients: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const { POST } = await import("@/app/api/cron/analytics-daily/route")
    const request = makeRequest("test-secret-123")

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.processed).toBe(2)
  })
})

describe("Cron route: campaigns-scheduled processes due campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret-123"

    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
  })

  it("processes scheduled campaigns", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "campaign-1" }, { id: "campaign-2" }])

    const { POST } = await import("@/app/api/cron/campaigns-scheduled/route")
    const { executeCampaign } = await import("@/lib/campaigns")

    const request = makeRequest("test-secret-123")
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.processed).toBe(2)
    expect(executeCampaign).toHaveBeenCalledTimes(2)
  })

  it("returns empty when no campaigns are due", async () => {
    mockWhere.mockResolvedValueOnce([])

    const { POST } = await import("@/app/api/cron/campaigns-scheduled/route")
    const request = makeRequest("test-secret-123")

    const response = await POST(request)
    const body = await response.json()

    expect(body.data.processed).toBe(0)
    expect(body.data.errors).toEqual([])
  })
})
