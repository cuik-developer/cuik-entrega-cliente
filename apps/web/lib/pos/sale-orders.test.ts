import { describe, expect, it } from "vitest"

import type { MasterEntry } from "./classify"
import { candidatesFor, type FreeSale, suggestedCandidate, suggestionFor } from "./links-review"
import { matchOrdersToVisits } from "./match"
import { OdooError } from "./odoo-client"
import { sourceLabel } from "./sources"
import {
  buildSaleOrderRows,
  type ClientRef,
  dayRanges,
  lineRow,
  meansNoSales,
  type OdooSaleLine,
  type OdooSaleOrder,
  saleOrderOutcome,
  saleOrderStore,
  syncComplete,
} from "./sync"

/**
 * Sales orders of Odoo Ventas (e-commerce, phone, orders keyed in at a
 * store). The case behind it: on 12 Nov 2026 Gabriela Espinoza (DNI
 * 41820824) got her stamp at Santa Cruz at 11:16 for S/ 213.75; the purchase
 * is the sales order S09270 under the salesperson "Mascota Veloz Santa Cruz",
 * which the POS-only sync never saw.
 */

const TZ = "America/Lima"
const TENANT = "00000000-0000-4000-8000-000000000001"
const IMPORT = "00000000-0000-4000-8000-0000000000aa"
const CLIENT = "00000000-0000-4000-8000-0000000000c1"

const S09270: OdooSaleOrder = {
  id: 9270,
  name: "S09270",
  // 16:10 UTC = 11:10 in Lima, six minutes before the stamp.
  date_order: "2026-11-12 16:10:00",
  amount_total: 213.75,
  partner_id: [501, "Gabriela Espinoza"],
  user_id: [12, "Mascota Veloz Santa Cruz"],
  team_id: [3, "Ventas"],
  state: "sale",
  write_date: "2026-11-12 16:11:02",
  order_line: [1, 2, 3, 4],
}

const LINES: OdooSaleLine[] = [
  {
    id: 1,
    order_id: [9270, "S09270"],
    product_id: [77, "[ALI-0091] Pro Plan Adulto Raza Mediana 15 kg"],
    product_uom_qty: 1,
    price_unit: 199.9,
    discount: 0,
    price_total: 199.9,
    display_type: false,
  },
  {
    id: 2,
    order_id: [9270, "S09270"],
    product_id: false,
    product_uom_qty: 0,
    price_unit: 0,
    discount: 0,
    price_total: 0,
    display_type: "line_section",
  },
  {
    id: 3,
    order_id: [9270, "S09270"],
    product_id: [88, "[SNK-0007] Dentalife Medium"],
    product_uom_qty: 2,
    price_unit: 7.5,
    discount: 10,
    price_total: 13.5,
    display_type: false,
  },
  {
    id: 4,
    order_id: [9270, "S09270"],
    product_id: false,
    product_uom_qty: 0,
    price_unit: 0,
    discount: 0,
    price_total: 0,
    display_type: "line_note",
  },
]

const PRODUCTS = new Map([
  [
    77,
    {
      id: 77,
      default_code: "ALI-0091",
      name: "Pro Plan Adulto Raza Mediana 15 kg",
      categ_id: [5, "Alimento / Perro / Seco"] as [number, string],
    },
  ],
  [
    88,
    {
      id: 88,
      default_code: "SNK-0007",
      name: "Dentalife Medium (Purina)",
      categ_id: [6, "Snacks / Perro"] as [number, string],
    },
  ],
])

const MASTER = new Map<string, MasterEntry>([
  [
    "ALI-0091",
    {
      category: "Alimento seco",
      class: "Perro adulto",
      subclass: "Bolsa grande",
      brand: "Pro Plan",
    },
  ],
])

const PARTNERS = new Map([
  [
    501,
    {
      id: 501,
      name: "Gabriela Espinoza",
      vat: "41820824",
      phone: "+51 987 654 321",
      l10n_latam_identification_type_id: [1, "DNI"] as [number, string],
    },
  ],
])

function build(
  orders: OdooSaleOrder[] = [S09270],
  clients: Map<string, ClientRef> = new Map([
    ["41820824", { id: CLIENT, registeredOn: "2026-10-01" }],
  ]),
) {
  return buildSaleOrderRows({
    tenantId: TENANT,
    tenantName: "Mascota Veloz",
    timezone: TZ,
    orders,
    partners: PARTNERS,
    linesByOrder: new Map([[9270, LINES]]),
    productsById: PRODUCTS,
    importOf: () => IMPORT,
    clientByDni: clients,
    hasIdType: true,
    master: MASTER,
  })
}

describe("sales orders → analytics.sales", () => {
  it("maps S09270 as a sale_order row of Santa Cruz with the DNI, the client and the local day", () => {
    const { prepared, badAmount } = build()
    expect(badAmount).toBe(0)
    expect(prepared).toHaveLength(1)
    const { ref, row } = prepared[0]
    expect(ref).toBe("S09270")
    expect(row).toMatchObject({
      tenantId: TENANT,
      importId: IMPORT,
      orderRef: "S09270",
      source: "sale_order",
      posOrderId: null,
      dni: "41820824",
      customerName: "Gabriela Espinoza",
      store: "Santa Cruz",
      cashier: "Mascota Veloz Santa Cruz",
      soldOn: "2026-11-12",
      amount: "213.75",
      clientId: CLIENT,
    })
    expect((row.soldAt as Date).toISOString()).toBe("2026-11-12T16:10:00.000Z")
  })

  it("keeps product lines only, classified exactly like a POS line of the same product", () => {
    const { lines } = build().prepared[0]
    expect(lines.map((l) => l.posLineId)).toEqual([1, 3])
    expect(lines[0]).toMatchObject({
      sku: "ALI-0091",
      qty: "1",
      unitPrice: "199.90",
      total: "199.90",
    })
    expect(lines[1]).toMatchObject({
      sku: "SNK-0007",
      qty: "2",
      discountPct: "10.00",
      total: "13.50",
    })
    // The same product sold at the till gets the same SKU, category and brand.
    const asPos = lineRow(
      TENANT,
      {
        id: 3,
        order_id: [1, "SANTA CRUZ - MIRAFLORES/35672"],
        product_id: [88, "x"],
        qty: 2,
        price_unit: 7.5,
        discount: 10,
        price_subtotal_incl: 13.5,
      },
      PRODUCTS.get(88),
      MASTER,
    )
    expect(lines[1]).toEqual(asPos)
    const master = lineRow(
      TENANT,
      {
        id: 1,
        order_id: [1, "x"],
        product_id: [77, "x"],
        qty: 1,
        price_unit: 199.9,
        discount: 0,
        price_subtotal_incl: 199.9,
      },
      PRODUCTS.get(77),
      MASTER,
    )
    expect(lines[0]).toEqual(master)
    expect(lines[0].brand).toBe("Pro Plan")
    expect(lines[0].categoryKey).not.toBeNull()
  })

  it("leaves the client out when the purchase predates the registration", () => {
    const { prepared } = build(
      [S09270],
      new Map([["41820824", { id: CLIENT, registeredOn: "2026-11-13" }]]),
    )
    expect(prepared[0].row.clientId).toBeNull()
    expect(prepared[0].row.dni).toBe("41820824")
  })

  it("skips impossible amounts and keeps one row per reference", () => {
    const huge = { ...S09270, id: 1, name: "S00001", amount_total: 9_999_999 }
    const twice = { ...S09270, amount_total: 100 }
    const { prepared, badAmount } = build([S09270, huge, twice])
    expect(badAmount).toBe(1)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].row.amount).toBe("100.00")
  })

  it("takes no DNI from a RUC or a placeholder customer", () => {
    const ruc = new Map([
      [
        501,
        {
          id: 501,
          name: "Veterinaria Sur SAC",
          vat: "20123456789",
          l10n_latam_identification_type_id: [4, "RUC"] as [number, string],
        },
      ],
    ])
    const rows = buildSaleOrderRows({
      tenantId: TENANT,
      tenantName: "Mascota Veloz",
      timezone: TZ,
      orders: [S09270],
      partners: ruc,
      linesByOrder: new Map(),
      productsById: PRODUCTS,
      importOf: () => IMPORT,
      clientByDni: new Map(),
      hasIdType: true,
      master: MASTER,
    })
    expect(rows.prepared[0].row.dni).toBeNull()
    expect(rows.prepared[0].lines).toEqual([])
  })
})

describe("saleOrderStore", () => {
  it("drops the merchant's name in front of the salesperson", () => {
    expect(saleOrderStore("Mascota Veloz Santa Cruz", "Ventas", "Mascota Veloz")).toBe("Santa Cruz")
    expect(saleOrderStore("MASCOTA VELOZ - Jacarandá", null, "Mascota Veloz")).toBe("Jacarandá")
    expect(saleOrderStore("Máscota  Veloz · Chacarilla", null, "Mascota Veloz")).toBe("Chacarilla")
    expect(saleOrderStore("Mascota Veloz Santa Cruz", null, "Mascota Veloz S.A.C.")).toBe(
      "Santa Cruz",
    )
  })

  it("keeps a name that does not start with the merchant's, or that is only the merchant's", () => {
    expect(saleOrderStore("Rosa Quispe", "Ventas", "Mascota Veloz")).toBe("Rosa Quispe")
    expect(saleOrderStore("Mascota Veloz", null, "Mascota Veloz")).toBe("Mascota Veloz")
    expect(saleOrderStore("Mascota Velociraptor", null, "Mascota Veloz")).toBe(
      "Mascota Velociraptor",
    )
  })

  it("falls back to the sales team, then to nothing", () => {
    expect(saleOrderStore(null, "Website", "Mascota Veloz")).toBe("Website")
    expect(saleOrderStore("  ", "Mascota Veloz Surco", "Mascota Veloz")).toBe("Surco")
    expect(saleOrderStore(null, null, "Mascota Veloz")).toBeNull()
    expect(saleOrderStore("Santa Cruz", null, null)).toBe("Santa Cruz")
  })
})

describe("saleOrderOutcome", () => {
  it("keeps confirmed orders whole when the till paid none of it", () => {
    expect(saleOrderOutcome({ state: "sale", amount_total: 213.75 }, 0)).toEqual({
      keep: true,
      amount: 213.75,
    })
    expect(saleOrderOutcome({ state: "done", amount_total: 50 }, 0)).toEqual({
      keep: true,
      amount: 50,
    })
  })

  it("drops cancelled orders and quotations", () => {
    for (const state of ["cancel", "draft", "sent"]) {
      expect(saleOrderOutcome({ state, amount_total: 99 }, 0)).toEqual({ keep: false })
    }
  })

  it("drops an order the till paid in full: the POS order is that purchase", () => {
    expect(saleOrderOutcome({ state: "sale", amount_total: 500 }, 500)).toEqual({ keep: false })
    expect(saleOrderOutcome({ state: "sale", amount_total: 500 }, 499.8)).toEqual({ keep: false })
  })

  it("keeps only the part paid elsewhere when the till paid some of it", () => {
    // S/ 100 deposit online, S/ 400 at pick-up: the order keeps S/ 100.
    expect(saleOrderOutcome({ state: "sale", amount_total: 500 }, 400)).toEqual({
      keep: true,
      amount: 100,
    })
  })
})

describe("meansNoSales", () => {
  it("is a missing model or a denied read, never a passing outage", () => {
    expect(meansNoSales(new OdooError("Object sale.order doesn't exist", "server"))).toBe(true)
    expect(meansNoSales(new OdooError("'sale.order'", "server"))).toBe(true)
    expect(meansNoSales(new OdooError("You are not allowed to access 'Sales Order'", "auth"))).toBe(
      true,
    )
    expect(meansNoSales(new OdooError("Odoo respondió HTTP 502", "server"))).toBe(false)
    expect(meansNoSales(new OdooError("timeout", "network"))).toBe(false)
    expect(meansNoSales(new OdooError("Odoo no respondió JSON", "response"))).toBe(false)
    expect(meansNoSales(new Error("boom"))).toBe(false)
  })
})

describe("dayRanges", () => {
  it("matches scattered days one run at a time, close ones together", () => {
    expect(dayRanges([])).toEqual([])
    expect(dayRanges(["2026-11-12", "2026-11-10", "2026-11-12"])).toEqual([
      ["2026-11-10", "2026-11-12"],
    ])
    expect(dayRanges(["2026-03-02", "2026-11-12", "2026-11-13"])).toEqual([
      ["2026-03-02", "2026-03-02"],
      ["2026-11-12", "2026-11-13"],
    ])
  })

  it("falls back to one range past the limit of runs", () => {
    const days = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]
    expect(dayRanges(days, 3, 3)).toEqual([["2026-01-01", "2026-04-01"]])
  })
})

describe("syncComplete", () => {
  const pos = { writeDate: "2026-11-13 10:00:00", id: 5, offset: 1, exhausted: true }
  it("needs both pulls at the end", () => {
    expect(syncComplete(null)).toBe(false)
    expect(syncComplete(pos)).toBe(false)
    expect(
      syncComplete({ ...pos, saleOrders: { writeDate: "x", id: 1, offset: 0, exhausted: false } }),
    ).toBe(false)
    expect(
      syncComplete({ ...pos, saleOrders: { writeDate: "x", id: 1, offset: 0, exhausted: true } }),
    ).toBe(true)
    expect(
      syncComplete({
        ...pos,
        exhausted: false,
        saleOrders: { writeDate: "x", id: 1, offset: 0, exhausted: true },
      }),
    ).toBe(false)
    expect(
      syncComplete({
        ...pos,
        saleOrders: { writeDate: "x", id: 0, offset: 0, exhausted: true, unavailable: true },
      }),
    ).toBe(true)
  })
})

describe("S09270 against Gabriela's stamp", () => {
  const stampAt = new Date("2026-11-12T16:16:00Z") // 11:16 Lima
  const row = build().prepared[0].row

  it("is linked by DNI the same day by the matcher", () => {
    const r = matchOrdersToVisits(
      [
        {
          id: "sale-1",
          dni: row.dni ?? null,
          soldAt: row.soldAt as Date,
          store: row.store ?? null,
        },
      ],
      [{ id: "visit-1", dni: "41820824", createdAt: stampAt, location: "Santa Cruz" }],
      TZ,
    )
    expect(r.pairs.get("sale-1")).toBe("visit-1")
  })

  const free = (over: Partial<FreeSale> = {}): FreeSale => ({
    id: "sale-1",
    source: row.source as string,
    orderRef: row.orderRef ?? null,
    soldAt: row.soldAt as Date,
    store: row.store ?? null,
    amount: row.amount as string,
    dni: row.dni ?? null,
    customerName: row.customerName ?? null,
    clientId: row.clientId ?? null,
    ...over,
  })
  const visit = { createdAt: stampAt, dni: "41820824", amount: 213.75, location: "Santa Cruz" }

  it("is the stamp's candidate in Validación de enlaces, suggested to link", () => {
    const candidates = candidatesFor(visit, [free()])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      saleId: "sale-1",
      source: "sale_order",
      orderRef: "S09270",
      minutes: -6,
      store: "Santa Cruz",
      amount: 213.75,
      sameAmount: true,
      sameStore: true,
      sameDni: true,
    })
    expect(sourceLabel(candidates[0].source)).toBe("Orden de venta")
    expect(suggestionFor(candidates)).toBe("link")
  })

  it("stays a candidate hours away when the document is the client's, before strangers", () => {
    const morning = new Date("2026-11-12T13:05:00Z") // 08:05 Lima, 3 h before the stamp
    const candidates = candidatesFor(visit, [
      free({
        id: "near-guest",
        source: "pos",
        orderRef: "SANTA CRUZ/1",
        dni: null,
        soldAt: new Date("2026-11-12T16:20:00Z"),
        amount: "40",
      }),
      free({ soldAt: morning }),
      free({
        id: "far-guest",
        source: "pos",
        orderRef: "SANTA CRUZ/2",
        dni: null,
        soldAt: morning,
      }),
    ])
    expect(candidates.map((c) => c.saleId)).toEqual(["sale-1", "near-guest"])
    expect(candidates[0].minutes).toBe(-191)
    // The client's own document and the stamp's amount: a link, even hours away.
    expect(suggestionFor([candidates[0]])).toBe("link")
    // Another amount: worth a look, not a one-click link.
    expect(suggestionFor([{ ...candidates[0], sameAmount: false }])).toBe("review")
  })

  it("is no candidate for another client's stamp hours away", () => {
    const morning = new Date("2026-11-12T13:05:00Z")
    expect(candidatesFor({ ...visit, dni: "10101010" }, [free({ soldAt: morning })])).toEqual([])
  })
})

describe("POS first, then the sales order, then the merchant (user rule, 13 Nov 2026)", () => {
  const stampAt = new Date("2026-11-12T16:16:00Z")
  const at = (iso: string) => new Date(iso)

  it("the matcher gives the stamp to the till sale over a closer sales order of the same DNI", () => {
    const r = matchOrdersToVisits(
      [
        {
          id: "so",
          dni: "41820824",
          soldAt: at("2026-11-12T16:15:00Z"),
          store: "Santa Cruz",
          source: "sale_order",
        },
        {
          id: "pos",
          dni: "41820824",
          soldAt: at("2026-11-12T14:00:00Z"),
          store: "LIMA - JACARANDA",
          source: "pos",
        },
      ],
      [{ id: "visit", dni: "41820824", createdAt: stampAt, location: "Santa Cruz" }],
      TZ,
    )
    expect(r.pairs.get("pos")).toBe("visit")
    expect(r.pairs.has("so")).toBe(false)
  })

  it("the sales order takes a second stamp the till sale left free", () => {
    const r = matchOrdersToVisits(
      [
        {
          id: "so",
          dni: "41820824",
          soldAt: at("2026-11-12T16:15:00Z"),
          store: "Santa Cruz",
          source: "sale_order",
        },
        {
          id: "pos",
          dni: "41820824",
          soldAt: at("2026-11-12T14:00:00Z"),
          store: "Santa Cruz",
          source: "pos",
        },
      ],
      [
        { id: "v1", dni: "41820824", createdAt: stampAt, location: "Santa Cruz" },
        {
          id: "v2",
          dni: "41820824",
          createdAt: at("2026-11-12T14:02:00Z"),
          location: "Santa Cruz",
        },
      ],
      TZ,
    )
    expect(r.pairs.get("pos")).toBe("v2")
    expect(r.pairs.get("so")).toBe("v1")
  })

  const cand = (over: Record<string, unknown>) => ({
    minutes: 0,
    sameAmount: true,
    sameDni: false,
    source: "pos" as "pos" | "sale_order",
    ...over,
  })

  it("Validación suggests the fitting till sale even when a sales order fits too", () => {
    const pos = cand({ id: "pos", minutes: 4 })
    const so = cand({ id: "so", source: "sale_order", minutes: -1, sameDni: true })
    expect(suggestedCandidate([so, pos])).toBe(pos)
  })

  it("falls back to the sales order only when no till sale fits", () => {
    const pos = cand({ id: "pos", minutes: 4, sameAmount: false })
    const so = cand({ id: "so", source: "sale_order", minutes: -6 })
    expect(suggestedCandidate([pos, so])).toBe(so)
    expect(suggestionFor([pos, so])).toBe("link")
  })

  it("two fitting till sales go to a person, never to the sales order", () => {
    const a = cand({ id: "a", minutes: 3 })
    const b = cand({ id: "b", minutes: -5 })
    const so = cand({ id: "so", source: "sale_order", minutes: 1 })
    expect(suggestedCandidate([a, b, so])).toBeNull()
    expect(suggestionFor([a, b, so])).toBe("review")
  })

  it("with nothing that fits, the stamp is left for the merchant", () => {
    const far = cand({ id: "far", minutes: 110, sameAmount: false })
    expect(suggestedCandidate([far])).toBeNull()
    expect(suggestionFor([far])).toBe("none")
  })

  it("lists the till's sales before the sales orders, the suggested one first", () => {
    const visit = { createdAt: stampAt, dni: "41820824", amount: 213.75, location: "Santa Cruz" }
    const base = {
      orderRef: null,
      store: "Santa Cruz",
      customerName: null,
      clientId: null,
    }
    const list = candidatesFor(visit, [
      {
        ...base,
        id: "so",
        source: "sale_order",
        soldAt: at("2026-11-12T16:15:00Z"),
        amount: "99",
        dni: null,
      },
      {
        ...base,
        id: "pos-far",
        source: "pos",
        soldAt: at("2026-11-12T17:30:00Z"),
        amount: "15",
        dni: null,
      },
      {
        ...base,
        id: "pos-fit",
        source: "pos",
        soldAt: at("2026-11-12T16:40:00Z"),
        amount: "213.75",
        dni: null,
      },
    ])
    expect(list.map((c) => c.saleId)).toEqual(["pos-fit", "pos-far", "so"])
  })
})
