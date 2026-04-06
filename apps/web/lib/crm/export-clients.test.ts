import { beforeEach, describe, expect, it, vi } from "vitest"

// We need a flexible mock that chains properly for different query types
const { mockDb } = vi.hoisted(() => {
  // Track calls to route them properly
  let selectCallCount = 0
  const clientBatches: unknown[][] = []
  const tagResults: unknown[][] = []

  const mockDb = {
    selectCallCount: 0,
    clientBatches,
    tagResults,
    reset() {
      selectCallCount = 0
      clientBatches.length = 0
      tagResults.length = 0
    },
    setClientBatches(...batches: unknown[][]) {
      clientBatches.length = 0
      clientBatches.push(...batches)
    },
    setTagResults(...results: unknown[][]) {
      tagResults.length = 0
      tagResults.push(...results)
    },
    select: vi.fn(),
  }

  // Build a chainable mock that resolves at the end
  mockDb.select.mockImplementation(() => {
    const callIndex = selectCallCount++

    // Determine if this is a client fetch or a tag fetch
    // Client fetch chain: select -> from -> where -> orderBy -> limit -> resolve
    // Tag fetch chain: select -> from -> innerJoin -> where -> resolve
    const chain: Record<string, unknown> = {}

    chain.from = vi.fn().mockImplementation(() => {
      const fromChain: Record<string, unknown> = {}

      // Client query chain
      fromChain.where = vi.fn().mockImplementation(() => {
        const whereChain: Record<string, unknown> = {}
        whereChain.orderBy = vi.fn().mockImplementation(() => {
          const orderByChain: Record<string, unknown> = {}
          const _batchIndex = Math.floor(callIndex / 2) // Every other select is for clients
          orderByChain.limit = vi.fn().mockImplementation(() => {
            return clientBatches.shift() ?? []
          })
          return orderByChain
        })
        return whereChain
      })

      // Tag query chain
      fromChain.innerJoin = vi.fn().mockImplementation(() => {
        const joinChain: Record<string, unknown> = {}
        joinChain.where = vi.fn().mockImplementation(() => {
          return tagResults.shift() ?? []
        })
        return joinChain
      })

      return fromChain
    })

    return chain
  })

  return { mockDb }
})

vi.mock("@cuik/db", () => {
  const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const node: Record<string, unknown> = {
      strings,
      values,
      _tag: "sql",
      as: (_alias: string) => node,
    }
    return node
  }
  sqlTag.join = vi.fn()

  return {
    db: {
      select: mockDb.select,
    },
    sql: sqlTag,
    clients: {
      id: "id",
      tenantId: "tenantId",
      name: "name",
      lastName: "lastName",
      email: "email",
      phone: "phone",
      status: "status",
      tier: "tier",
      totalVisits: "totalVisits",
      currentCycle: "currentCycle",
      marketingOptIn: "marketingOptIn",
      createdAt: "createdAt",
    },
    clientTagAssignments: {
      clientId: "clientId",
      tagId: "tagId",
    },
    clientTags: {
      id: "id",
      name: "name",
    },
    eq: vi.fn((a, b) => ({ type: "eq", left: a, right: b })),
    and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  }
})

vi.mock("exceljs", () => {
  // Minimal ExcelJS mock that captures added rows
  class MockWorksheet {
    columns: unknown[] = []
    private rows: unknown[][] = []
    private _headerRow = { font: {}, alignment: {} }

    getRow(_index: number) {
      return this._headerRow
    }

    addRow(data: Record<string, unknown>) {
      const row = this.columns.map((col: unknown) => {
        const c = col as { key?: string }
        return c.key ? data[c.key] : undefined
      })
      this.rows.push(row)
      return row
    }

    getRows() {
      return this.rows
    }
  }

  class MockWorkbook {
    worksheets: MockWorksheet[] = []
    xlsx = {
      writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }

    addWorksheet(_name: string) {
      const ws = new MockWorksheet()
      this.worksheets.push(ws)
      return ws
    }
  }

  return { default: { Workbook: MockWorkbook } }
})

import { exportClientsXlsx } from "./export-clients"

describe("exportClientsXlsx", () => {
  const sampleClient = {
    id: "c1",
    name: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "+5491112345678",
    status: "active",
    tier: "Gold",
    totalVisits: 15,
    currentCycle: 3,
    marketingOptIn: true,
    lastVisitAt: new Date("2025-06-01"),
    avgDaysBetweenVisits: 7,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  }

  beforeEach(() => {
    mockDb.reset()
    mockDb.select.mockClear()
  })

  it("returns a Buffer", async () => {
    mockDb.setClientBatches([])

    const result = await exportClientsXlsx("tenant-1")

    expect(result).toBeInstanceOf(Buffer)
  })

  it("handles empty result set", async () => {
    mockDb.setClientBatches([])

    const result = await exportClientsXlsx("tenant-1")

    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })

  it("processes client batches", async () => {
    mockDb.setClientBatches([sampleClient], [])
    mockDb.setTagResults([])

    const result = await exportClientsXlsx("tenant-1")

    expect(result).toBeInstanceOf(Buffer)
    // At least 2 select calls: one for client batch, one for tags
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it("handles null lastName and email gracefully", async () => {
    const clientWithNulls = {
      ...sampleClient,
      lastName: null,
      email: null,
      phone: null,
      tier: null,
    }
    mockDb.setClientBatches([clientWithNulls], [])
    mockDb.setTagResults([])

    // Should not throw
    const result = await exportClientsXlsx("tenant-1")
    expect(result).toBeInstanceOf(Buffer)
  })
})
