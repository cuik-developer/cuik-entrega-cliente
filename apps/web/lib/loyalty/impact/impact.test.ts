import { describe, expect, it } from "vitest"

import {
  detectMapping,
  missingRequiredFields,
  normalizeAmount,
  normalizeDay,
  normalizeDni,
  parseMapping,
} from "./columns"
import { addDays, computeImpact, dayDiff, median } from "./metrics"
import { buildOrders, parseCsv } from "./parse"
import type { ColumnMapping, CuikClient, CuikVisit, SaleOrder } from "./types"
import { DEFAULT_IMPORT_OPTIONS } from "./types"

describe("column detection", () => {
  it("recognises the Odoo POS lines export", () => {
    const headers = [
      "Ref. de la orden",
      "Cliente",
      "Cliente/Celular",
      "Cliente/Teléfono",
      "Cliente/Correo electrónico",
      "Punto de venta",
      "Cliente/Tipo de identificación",
      "Cliente/Número de identificación fiscal",
      "Fecha Venta",
      "Precio Pagado",
    ]
    const m = detectMapping(headers)
    expect(m.orderRef).toBe(0)
    expect(m.name).toBe(1)
    expect(m.phone).toBe(2)
    expect(m.store).toBe(5)
    expect(m.idType).toBe(6)
    expect(m.dni).toBe(7)
    expect(m.date).toBe(8)
    expect(m.amount).toBe(9)
    expect(missingRequiredFields(m)).toEqual([])
  })

  it("recognises a plain DNI · fecha · monto sheet", () => {
    const m = detectMapping(["DNI", "Fecha", "Monto", "Tienda", "Cajero"])
    expect(m).toMatchObject({ dni: 0, date: 1, amount: 2, store: 3, cashier: 4, orderRef: null })
  })

  it("reports what is missing", () => {
    expect(missingRequiredFields(detectMapping(["Nombre", "Teléfono"]))).toEqual([
      "dni",
      "date",
      "amount",
    ])
  })

  it("accepts only a sane mapping from the client", () => {
    expect(parseMapping({ dni: 0, date: "1", amount: 2 }, 3)).toMatchObject({
      dni: 0,
      date: 1,
      amount: 2,
    })
    expect(parseMapping({ dni: 0, date: 0, amount: 2 }, 3)).toBeNull()
    expect(parseMapping({ dni: 5 }, 3)).toBeNull()
    expect(parseMapping({ constructor: 1 }, 3)).not.toBeNull()
  })
})

describe("cell normalization", () => {
  it("keeps only 8-digit DNIs and drops placeholders", () => {
    expect(normalizeDni(" 12345678 ")).toBe("12345678")
    expect(normalizeDni(12345678)).toBe("12345678")
    expect(normalizeDni("20123456789")).toBeNull() // RUC
    expect(normalizeDni("00000000")).toBeNull()
    expect(normalizeDni("")).toBeNull()
  })

  it("reads dates in every shape the exports use", () => {
    expect(normalizeDay(new Date(Date.UTC(2026, 9, 31, 23, 4)))).toBe("2026-10-31")
    expect(normalizeDay("31/10/2026 18:04:11")).toBe("2026-10-31")
    expect(normalizeDay("2026-10-31T23:04:00")).toBe("2026-10-31")
    expect(normalizeDay("5-1-2026")).toBe("2026-01-05")
    expect(normalizeDay(46326)).toBe("2026-10-31") // Excel serial
    expect(normalizeDay("ayer")).toBeNull()
    expect(normalizeDay("31/13/2026")).toBeNull()
  })

  it("reads amounts with either decimal separator", () => {
    expect(normalizeAmount("S/ 1,234.50")).toBe(1234.5)
    expect(normalizeAmount("1.234,50")).toBe(1234.5)
    expect(normalizeAmount("88")).toBe(88)
    expect(normalizeAmount(88.5)).toBe(88.5)
    expect(normalizeAmount("")).toBe(0)
  })
})

describe("parsing", () => {
  it("reads a CSV with quotes and semicolons", () => {
    const rows = parseCsv(
      'DNI;Fecha;Monto;Nombre\n12345678;31/10/2026;"1.234,50";"Pérez, Juan"\n\n',
    )
    expect(rows).toEqual([
      ["DNI", "Fecha", "Monto", "Nombre"],
      ["12345678", "31/10/2026", "1.234,50", "Pérez, Juan"],
    ])
  })

  it("adds up the lines of an order and drops rows without a date", () => {
    const mapping: ColumnMapping = {
      orderRef: 0,
      dni: 1,
      idType: 2,
      name: 3,
      phone: null,
      store: 4,
      cashier: null,
      date: 5,
      amount: 6,
    }
    const rows = [
      ["A1", "12345678", "DNI", "Ana", "Surco", "31/10/2026", "50"],
      ["A1", "12345678", "DNI", "Ana", "Surco", "31/10/2026", "38.5"],
      ["A2", "20123456789", "RUC", "Empresa", "Pezet", "31/10/2026", "100"],
      ["A3", "11111111", "DNI", "Invitado", "Pezet", "31/10/2026", "20"],
      ["A4", "87654321", "DNI", "Luis", "Pezet", "", "20"],
    ]
    const r = buildOrders(rows, mapping)
    expect(r.rowsTotal).toBe(5)
    expect(r.rowsWithoutDate).toBe(1)
    expect(r.orders).toHaveLength(3)
    const a1 = r.orders.find((o) => o.orderRef === "A1")
    expect(a1).toMatchObject({ dni: "12345678", amount: 88.5, store: "Surco", day: "2026-10-31" })
    expect(r.orders.find((o) => o.orderRef === "A2")?.dni).toBeNull()
    expect(r.orders.find((o) => o.orderRef === "A3")?.dni).toBeNull()
  })

  it("drops a purchase with an impossible amount and its refund", () => {
    const mapping: ColumnMapping = {
      orderRef: 0,
      dni: 1,
      idType: null,
      name: null,
      phone: null,
      store: null,
      cashier: null,
      date: 2,
      amount: 3,
    }
    const rows = [
      ["S/75186", "46634066", "04/07/2026", "25345614871"],
      ["REEMBOLSO DE S/75186", "46634066", "04/07/2026", "-25345614871"],
      ["S/75190", "46634066", "04/07/2026", "543.50"],
    ]
    const r = buildOrders(rows, mapping)
    expect(r.ordersWithBadAmount).toBe(2)
    expect(r.orders).toHaveLength(1)
    expect(r.orders[0]).toMatchObject({ orderRef: "S/75190", amount: 543.5 })
  })
})

describe("date helpers", () => {
  it("works in whole days", () => {
    expect(dayDiff("2026-01-01", "2026-01-31")).toBe(30)
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(median([5, 1, 3])).toBe(3)
    expect(median([])).toBeNull()
  })
})

// A tiny merchant: two stores, four buyers, one registered in Cuik.
function order(p: Partial<SaleOrder> & { dni: string | null; day: string }): SaleOrder {
  return {
    orderRef: null,
    name: null,
    phone: null,
    store: "Surco",
    cashier: null,
    amount: 100,
    ...p,
  }
}

describe("computeImpact", () => {
  const clients: CuikClient[] = [{ dni: "11111111", name: "Ana", registeredOn: "2026-03-01" }]
  const visits: CuikVisit[] = [
    { dni: "11111111", day: "2026-03-10", store: "Surco", cashier: "Caja 1", source: "qr" },
    { dni: "11111111", day: "2026-05-01", store: "Surco", cashier: "Caja 1", source: "manual" },
    // A visit with no purchase that day in the file.
    { dni: "11111111", day: "2026-05-20", store: "Surco", cashier: "Caja 2", source: "manual" },
  ]
  const orders: SaleOrder[] = [
    // Ana: monthly before registering, then every 3 weeks after.
    ...["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"].map((day) =>
      order({ dni: "11111111", day }),
    ),
    ...["2026-03-10", "2026-04-01", "2026-04-22", "2026-05-01", "2026-05-25", "2026-06-15"].map(
      (day) => order({ dni: "11111111", day }),
    ),
    // Small purchase under the minimum, with no visit.
    order({ dni: "11111111", day: "2026-06-30", amount: 20 }),
    // Beto: never registered, slows down after the launch.
    ...["2025-10-05", "2025-11-05", "2025-12-05", "2026-01-05"].map((day) =>
      order({ dni: "22222222", day, name: "Beto", phone: "999111222", store: "Pezet" }),
    ),
    ...["2026-03-05", "2026-05-05", "2026-06-20"].map((day) =>
      order({ dni: "22222222", day, name: "Beto", phone: "999111222", store: "Pezet" }),
    ),
    // Carla: frequent, no card, stopped coming in April.
    ...["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10"].map((day) =>
      order({ dni: "33333333", day, name: "Carla" }),
    ),
    // Walk-ins without a document.
    order({ dni: null, day: "2026-06-30" }),
    order({ dni: null, day: "2026-06-30", store: "Pezet" }),
  ]
  const options = { ...DEFAULT_IMPORT_OPTIONS, minimumPurchase: 80, phase: null }

  const s = computeImpact({ orders, clients, visits, options })

  it("covers the file", () => {
    expect(s.period).toEqual({ from: "2025-10-01", to: "2026-06-30" })
    expect(s.coverage.orders).toBe(orders.length)
    expect(s.coverage.ordersWithDni).toBe(orders.length - 2)
    expect(s.coverage.uniqueDnis).toBe(3)
    expect(s.options.launch).toBe("2026-03-01")
  })

  it("measures registration at the till on eligible purchases only", () => {
    // Ana's purchases since registration: 6 eligible (≥ 80) + 1 small.
    expect(s.registration.eligibleDays).toBe(6)
    expect(s.registration.registeredDays).toBe(2)
    expect(s.registration.pct).toBe(33.3)
    expect(s.registration.smallDays).toBe(1)
    expect(s.registration.orphanVisits).toBe(1)
    expect(s.registration.byStore[0]).toMatchObject({ store: "Surco", eligible: 6, registered: 2 })
    expect(s.registration.byCashier.map((c) => c.cashier)).toEqual(["Caja 1", "Caja 2"])
    expect(s.registration.byCashier[1].orphan).toBe(1)
    expect(s.registration.buckets["1-49%"]).toBe(1)
    expect(s.registration.perClient[0]).toMatchObject({
      dni: "11111111",
      eligible: 6,
      registered: 2,
    })
  })

  it("compares frequency before and after against the control group", () => {
    expect(s.frequency.registered).toEqual({ n: 1, gapBefore: 31, gapAfter: 21 })
    // Beto and Carla both have 2 purchases before and after the launch.
    expect(s.frequency.control).toEqual({ n: 2, gapBefore: 31, gapAfter: 61 })
    expect(s.frequency.extraPurchasesPerYear).toBeGreaterThan(0)
    expect(s.frequency.moneyPerYear).toBeGreaterThan(0)
  })

  it("lists frequent buyers without a card and broken frequency", () => {
    expect(s.unregisteredFrequent.count).toBe(2)
    expect(s.unregisteredFrequent.list.map((u) => u.dni)).toEqual(["22222222", "33333333"])
    expect(s.brokenFrequency.list.map((b) => b.dni)).toEqual(["33333333"])
    expect(s.brokenFrequency.notRegistered).toBe(1)
  })

  it("computes retention cohorts with a full window only", () => {
    // 90-day window: cohorts up to March 2026 fit before June 30.
    expect(s.retention.cohorts.map((c) => c.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ])
    const mar = s.retention.cohorts.find((c) => c.month === "2026-03")
    expect(mar).toMatchObject({ cohort: 3, cardCohort: 1, cardRetained: 100, noCardCohort: 2 })
    expect(s.retention.beforeLaunch.cohort).toBeGreaterThan(0)
    expect(s.retention.sameClient.registered.clients).toBe(1)
    expect(s.retention.sameClient.control.clients).toBe(2)
  })

  it("excludes staff accounts by hand and detects near-daily buyers", () => {
    const staffDays = Array.from({ length: 120 }, (_, i) => addDays("2026-01-01", i))
    const withStaff = [
      ...orders,
      ...staffDays.map((day) => order({ dni: "99999999", day, name: "Caja" })),
    ]
    const r = computeImpact({ orders: withStaff, clients, visits, options })
    expect(r.staff.detected).toEqual([{ dni: "99999999", name: "Caja", purchases: 120 }])
    expect(r.coverage.uniqueDnis).toBe(3)
    const manual = computeImpact({
      orders: withStaff,
      clients,
      visits,
      options: { ...options, excludedDnis: ["99999999"] },
    })
    expect(manual.staff.detected).toEqual([])
    expect(manual.staff.manual).toEqual(["99999999"])
  })

  it("counts every purchase when there is no minimum (cashback)", () => {
    const r = computeImpact({
      orders,
      clients,
      visits,
      options: { ...options, minimumPurchase: null },
    })
    expect(r.registration.eligibleDays).toBe(7)
    expect(r.registration.smallDays).toBe(0)
  })
})
