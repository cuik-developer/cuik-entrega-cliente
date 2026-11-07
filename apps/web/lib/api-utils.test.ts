import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({}))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock("@/lib/sa-view", () => ({ saViewTenantFromCookieHeader: () => null }))

import { parsePagination } from "./api-utils"

describe("parsePagination", () => {
  it("falls back to defaults on non-numeric values instead of producing NaN", () => {
    expect(parsePagination(new URLSearchParams("page=abc&limit="))).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    })
    expect(parsePagination(new URLSearchParams("page=3&limit=10"))).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    })
  })

  it("clamps page to ≥1 and limit to 1..100", () => {
    expect(parsePagination(new URLSearchParams("page=-5&limit=999")).limit).toBe(100)
    expect(parsePagination(new URLSearchParams("page=0&limit=0"))).toEqual({
      page: 1,
      limit: 1,
      offset: 0,
    })
  })
})
