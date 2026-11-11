import { describe, expect, it } from "vitest"

import { computeImpact } from "@/lib/loyalty/impact/metrics"
import type { SaleOrder } from "@/lib/loyalty/impact/types"
import { lastDayOfMonth } from "./corte"
import { addDays, localMidnightUtc, uuidArrayLiteral } from "./sync"

describe("corte helpers", () => {
  it("knows the last day of a month, leap years included", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28")
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29")
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31")
  })

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("writes uuid arrays as one Postgres literal (drizzle would expand a JS array into a row)", () => {
    expect(uuidArrayLiteral(["a", "b"])).toBe("{a,b}")
    expect(uuidArrayLiteral(["a"])).toBe("{a}")
  })

  it("turns a Lima local midnight into the Odoo UTC string", () => {
    expect(localMidnightUtc("2025-01-01", "America/Lima")).toBe("2025-01-01 05:00:00")
    expect(localMidnightUtc("2025-01-01", "UTC")).toBe("2025-01-01 00:00:00")
  })
})

describe("refunds in the corte", () => {
  const order = (over: Partial<SaleOrder>): SaleOrder => ({
    orderRef: null,
    dni: "12345678",
    name: "Ana",
    phone: null,
    store: "Pezet",
    cashier: null,
    day: "2026-03-10",
    amount: 100,
    ...over,
  })

  it("nets the revenue but counts no purchase day for a refund", () => {
    const summary = computeImpact({
      orders: [
        order({ orderRef: "A", day: "2026-03-10" }),
        order({ orderRef: "B", day: "2026-04-10" }),
        order({ orderRef: "R", day: "2026-04-12", amount: -40 }),
      ],
      clients: [],
      visits: [],
      options: { retentionDays: 90, excludedDnis: [], minimumPurchase: null, phase: null },
    })
    expect(summary.coverage.orders).toBe(2)
    expect(summary.coverage.revenue).toBe(160)
    expect(summary.coverage.byMonth.find((m) => m.month === "2026-04")?.revenue).toBe(60)
    expect(summary.coverage.byStore[0].revenue).toBe(160)
    // The refund day is not a purchase day: the period ends at the last real purchase.
    expect(summary.period.to).toBe("2026-04-10")
  })
})

describe("network errors in the operator's words", () => {
  it("names an expired certificate, a wrong domain and a closed port", async () => {
    const { networkMessage } = await import("./odoo-client")
    const wrap = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } })
    expect(networkMessage(wrap("CERT_HAS_EXPIRED"))).toMatch(/vencido/)
    expect(networkMessage(wrap("DEPTH_ZERO_SELF_SIGNED_CERT"))).toMatch(/no es válido/)
    expect(networkMessage(wrap("ENOTFOUND"))).toMatch(/dominio/)
    expect(networkMessage(wrap("ECONNREFUSED"))).toMatch(/rechazó/)
    expect(networkMessage(new Error("x"))).toBe("No se pudo conectar")
    const abort = new Error("aborted")
    abort.name = "AbortError"
    expect(networkMessage(abort)).toMatch(/Tiempo/)
  })
})

describe("which client a purchase belongs to", () => {
  it("assigns a purchase only when the client was already registered that day", async () => {
    const { clientOwning } = await import("./sync")
    const clients = new Map([["12345678", { id: "ana", registeredOn: "2026-11-10" }]])
    // Monday purchase, registered Tuesday: stays a DNI-only row ("compra sin sello").
    expect(clientOwning("12345678", "2026-11-09", clients)).toBeNull()
    // Same day and later days belong to the client.
    expect(clientOwning("12345678", "2026-11-10", clients)).toBe("ana")
    expect(clientOwning("12345678", "2026-11-11", clients)).toBe("ana")
    expect(clientOwning(null, "2026-11-11", clients)).toBeNull()
    expect(clientOwning("99999999", "2026-11-11", clients)).toBeNull()
  })
})
