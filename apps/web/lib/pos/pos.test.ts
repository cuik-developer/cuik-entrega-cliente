import { describe, expect, it } from "vitest"

import {
  dayInTz,
  inferGuestLinks,
  matchOrdersToVisits,
  sameAmount,
  sameStore,
  storeMap,
  storeTokens,
} from "./match"
import {
  m2oId,
  m2oName,
  OdooClient,
  OdooError,
  odooDateTime,
  parseOdooDateTime,
} from "./odoo-client"
import {
  buildMaster,
  detectMasterMapping,
  normalizeSku,
  parseMasterMapping,
} from "./product-master"

describe("odoo client", () => {
  function fakeFetch(handler: (body: Record<string, unknown>) => unknown): typeof fetch {
    return (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const out = handler(body)
      return new Response(JSON.stringify(out), { status: 200 })
    }) as unknown as typeof fetch
  }
  const creds = { baseUrl: "https://mv.odoo.com/", database: "mv", login: "u", apiKey: "k" }

  it("builds the endpoint without a double slash", () => {
    expect(new OdooClient(creds).endpoint).toBe("https://mv.odoo.com/jsonrpc")
  })

  it("authenticates once and sends execute_kw with the uid", async () => {
    const calls: Record<string, unknown>[] = []
    const client = new OdooClient(creds, {
      fetch: fakeFetch((body) => {
        calls.push(body)
        const p = body.params as { method: string }
        if (p.method === "authenticate") return { jsonrpc: "2.0", result: 7 }
        return { jsonrpc: "2.0", result: [{ id: 1 }] }
      }),
    })
    await client.searchRead("pos.order", [], ["id"], { limit: 5 })
    await client.searchRead("pos.order", [], ["id"])
    expect(calls).toHaveLength(3)
    const exec = calls[1].params as { args: unknown[] }
    expect(exec.args.slice(0, 5)).toEqual(["mv", 7, "k", "pos.order", "search_read"])
    expect(exec.args[6]).toEqual({ fields: ["id"], limit: 5 })
  })

  it("turns a false uid into an auth error", async () => {
    const client = new OdooClient(creds, { fetch: fakeFetch(() => ({ result: false })) })
    await expect(client.authenticate()).rejects.toMatchObject({ kind: "auth" })
  })

  it("surfaces Odoo errors with their first line", async () => {
    const client = new OdooClient(creds, {
      fetch: fakeFetch(() => ({
        error: {
          message: "Odoo Server Error",
          data: { name: "odoo.exceptions.AccessDenied", message: "Access Denied\nTraceback..." },
        },
      })),
    })
    const err = await client.version().catch((e) => e)
    expect(err).toBeInstanceOf(OdooError)
    expect(err.kind).toBe("auth")
    expect(err.message).toBe("Access Denied")
  })

  it("formats and parses Odoo UTC datetimes", () => {
    const d = new Date("2026-11-10T15:04:05Z")
    expect(odooDateTime(d)).toBe("2026-11-10 15:04:05")
    expect(parseOdooDateTime("2026-11-10 15:04:05").toISOString()).toBe("2026-11-10T15:04:05.000Z")
    expect(m2oId([3, "x"])).toBe(3)
    expect(m2oName(false)).toBeNull()
  })
})

describe("visit matching", () => {
  const tz = "America/Lima"
  const at = (s: string) => new Date(s)

  it("takes the local day in the tenant timezone", () => {
    // 02:30 UTC on the 11th is still the 10th in Lima.
    expect(dayInTz(at("2026-11-11T02:30:00Z"), tz)).toBe("2026-11-10")
  })

  it("recognises the same store across naming styles", () => {
    expect(storeTokens("SURCO - JACARANDA")).toEqual(new Set(["surco", "jacaranda"]))
    expect(sameStore("SURCO - JACARANDA", "Jacaranda")).toBe(true)
    expect(sameStore("PEZET - SAN ISIDRO", "Pezet")).toBe(true)
    expect(sameStore("SANTA CRUZ", "Santa Cruz")).toBe(true)
    expect(sameStore("CHACARILLA", "Pezet")).toBe(false)
    expect(sameStore(null, "Pezet")).toBe(false)
  })

  it("pairs by DNI and day, preferring the same store, then the closest time", () => {
    const orders = [
      {
        id: "o1",
        dni: "12345678",
        soldAt: at("2026-11-10T15:00:00Z"),
        store: "PEZET - SAN ISIDRO",
      },
      { id: "o2", dni: "12345678", soldAt: at("2026-11-10T20:00:00Z"), store: "SURCO - JACARANDA" },
      {
        id: "o3",
        dni: "99999999",
        soldAt: at("2026-11-10T16:00:00Z"),
        store: "PEZET - SAN ISIDRO",
      },
      { id: "o4", dni: null, soldAt: at("2026-11-10T16:00:00Z"), store: "PEZET - SAN ISIDRO" },
    ]
    const visits = [
      { id: "v1", dni: "12345678", createdAt: at("2026-11-10T15:10:00Z"), location: "Pezet" },
      { id: "v2", dni: "12345678", createdAt: at("2026-11-10T15:05:00Z"), location: "Jacaranda" },
      { id: "v3", dni: "12345678", createdAt: at("2026-11-11T15:05:00Z"), location: "Jacaranda" },
    ]
    const r = matchOrdersToVisits(orders, visits, tz)
    // o1 goes to the Pezet visit even though v2 is closer in time.
    expect(r.pairs.get("o1")).toBe("v1")
    expect(r.pairs.get("o2")).toBe("v2")
    expect(r.pairs.has("o3")).toBe(false)
    expect(r.unmatchedOrders).toEqual(["o3"])
  })

  it("uses each visit once", () => {
    const orders = [
      { id: "o1", dni: "12345678", soldAt: at("2026-11-10T15:00:00Z"), store: null },
      { id: "o2", dni: "12345678", soldAt: at("2026-11-10T15:30:00Z"), store: null },
    ]
    const visits = [
      { id: "v1", dni: "12345678", createdAt: at("2026-11-10T15:20:00Z"), location: null },
    ]
    const r = matchOrdersToVisits(orders, visits, tz)
    expect(r.pairs.size).toBe(1)
    expect(r.pairs.get("o2")).toBe("v1")
    expect(r.unmatchedOrders).toEqual(["o1"])
  })
})

describe("product master", () => {
  it("detects the usual Spanish headers", () => {
    const m = detectMasterMapping(["Código", "Descripción", "Categoría", "Clase", "Sub Clase"])
    expect(m).toEqual({ sku: 0, name: 1, category: 2, class: 3, subclass: 4 })
  })

  it("does not let 'subclase' steal the class or category column", () => {
    const m = detectMasterMapping(["SKU", "Producto", "Subclase", "Clase", "Categoria"])
    expect(m).toEqual({ sku: 0, name: 1, category: 4, class: 3, subclass: 2 })
  })

  it("normalises SKUs the way the POS writes them", () => {
    expect(normalizeSku(" ab-12 3 ")).toBe("AB-123")
    expect(normalizeSku(12345)).toBe("12345")
    expect(normalizeSku("12345.0")).toBe("12345")
    expect(normalizeSku("")).toBeNull()
    expect(normalizeSku(null)).toBeNull()
  })

  it("builds one row per SKU, last wins, and counts what it skipped", () => {
    const sheet = {
      headers: ["sku", "nombre", "categoria", "clase", "subclase"],
      rows: [
        ["A1", "Croquetas", "Alimento", "Perro", "Seco"],
        ["", "sin sku", "x", "y", "z"],
        ["a1", "Croquetas 2", "Alimento", "Perro", "Húmedo"],
        ["B2", "Correa", "Accesorios", null, null],
      ],
    }
    const built = buildMaster(sheet, { sku: 0, name: 1, category: 2, class: 3, subclass: 4 })
    expect(built.rowsTotal).toBe(4)
    expect(built.rowsWithoutSku).toBe(1)
    expect(built.duplicates).toBe(1)
    expect(built.rows).toEqual([
      { sku: "A1", name: "Croquetas 2", category: "Alimento", class: "Perro", subclass: "Húmedo" },
      { sku: "B2", name: "Correa", category: "Accesorios", class: null, subclass: null },
    ])
  })

  it("rejects a mapping with an out-of-range or repeated column", () => {
    expect(parseMasterMapping({ sku: 0, name: 0 }, 3)).toBeNull()
    expect(parseMasterMapping({ sku: 5 }, 3)).toBeNull()
    expect(parseMasterMapping({ sku: "1", category: 2 }, 3)).toEqual({
      sku: 1,
      name: null,
      category: 2,
      class: null,
      subclass: null,
    })
  })
})

describe("inferred links for guest sales", () => {
  const tz = "America/Lima"
  const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00Z`)
  const order = (id: string, hhmm: string, amount: number, store = "PEZET - SAN ISIDRO") => ({
    id,
    soldAt: at(hhmm),
    store,
    amount,
  })
  const visit = (
    id: string,
    hhmm: string,
    amount: number | null,
    location: string | null = "Pezet",
    clientId = `c-${id}`,
  ) => ({ id, clientId, createdAt: at(hhmm), location, amount })
  const opts = { windowMinutes: 20, timezone: tz }

  it("links the sale to the visit minutes later at the same store with the same amount", () => {
    const pairs = inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:30", 85.5)], opts)
    expect(pairs.get("s1")).toEqual({ visitId: "v1", clientId: "c-v1", kind: "inferred_amount" })
  })

  it("uses the amount to pick among several sales in the window", () => {
    const pairs = inferGuestLinks(
      [order("s1", "20:24", 85.5), order("s2", "20:26", 120)],
      [visit("v1", "20:30", 120.9)],
      opts,
    )
    expect(pairs.get("s2")?.kind).toBe("inferred_amount")
    expect(pairs.has("s1")).toBe(false)
  })

  it("links by time alone only when sale and visit are each other's only candidate", () => {
    const lone = inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:30", null)], opts)
    expect(lone.get("s1")?.kind).toBe("inferred_time")
    const ambiguous = inferGuestLinks(
      [order("s1", "20:24", 85.5), order("s2", "20:26", 40)],
      [visit("v1", "20:30", null)],
      opts,
    )
    expect(ambiguous.size).toBe(0)
  })

  it("never links across stores, outside the window, before the sale beyond the slack, or when the typed amount disagrees", () => {
    expect(
      inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:30", null, "Jacaranda")], opts)
        .size,
    ).toBe(0)
    expect(
      inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:50", null)], opts).size,
    ).toBe(0)
    expect(
      inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:15", null)], opts).size,
    ).toBe(0)
    expect(
      inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:30", 40)], opts).size,
    ).toBe(0)
    // Scanned a minute before the order closed: still the same purchase.
    expect(
      inferGuestLinks([order("s1", "20:24", 85.5)], [visit("v1", "20:23", null)], opts).size,
    ).toBe(1)
  })

  it("abstains on an amount tie and respects the configured window", () => {
    // Two sales of S/ 85.50 and one stamp of 85.50: either could be it.
    const tie = inferGuestLinks(
      [order("s1", "20:24", 85.5), order("s2", "20:25", 85.5)],
      [visit("v1", "20:30", 85.5)],
      opts,
    )
    expect(tie.size).toBe(0)
    const twoStamps = inferGuestLinks(
      [order("s1", "20:24", 85.5)],
      [visit("v1", "20:30", 85.5), visit("v2", "20:31", 85.5)],
      opts,
    )
    expect(twoStamps.size).toBe(0)
    const wide = inferGuestLinks([order("s1", "20:00", 85.5)], [visit("v1", "20:50", 85.5)], {
      ...opts,
      windowMinutes: 60,
    })
    expect(wide.size).toBe(1)
  })
})

describe("inferred links give way to a DNI sale in the window", () => {
  const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00Z`)
  const opts = { windowMinutes: 20, timezone: "America/Lima" }
  const guest = { id: "g", soldAt: at("20:24"), store: "PEZET - SAN ISIDRO", amount: 85.5 }
  const visit = (amount: number | null) => ({
    id: "v",
    clientId: "c",
    createdAt: at("20:30"),
    location: "Pezet",
    amount,
  })

  it("does not pair the guest sale by time when a DNI sale nobody matched sits in the window", () => {
    const blockers = [{ soldAt: at("20:27"), store: "PEZET - SAN ISIDRO", amount: 40 }]
    expect(inferGuestLinks([guest], [visit(null)], { ...opts, blockers }).size).toBe(0)
    // By amount it still pairs: the DNI sale's amount is not the visit's.
    expect(inferGuestLinks([guest], [visit(85.5)], { ...opts, blockers }).size).toBe(1)
    // Unless the DNI sale has that amount too.
    const same = [{ soldAt: at("20:27"), store: "PEZET - SAN ISIDRO", amount: 85.5 }]
    expect(inferGuestLinks([guest], [visit(85.5)], { ...opts, blockers: same }).size).toBe(0)
  })
})

describe("inferred links and the store map", () => {
  const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00Z`)
  const opts = { windowMinutes: 20, timezone: "America/Lima" }
  const sale = (store: string) => ({ id: "s", soldAt: at("20:24"), store, amount: 30 })
  const stamp = (location: string | null) => ({
    id: "v",
    clientId: "c",
    createdAt: at("20:30"),
    location,
    amount: null,
  })

  it("maps each POS store to one Cuik location, or to none when a district word makes it ambiguous", () => {
    const clear = storeMap(
      ["SURCO - JACARANDA", "SANTA CRUZ - MIRAFLORES", "PEZET - SAN ISIDRO", "EVENTOS"],
      ["Jacaranda", "Santa Cruz", "Pezet"],
    )
    expect(clear.get("SURCO - JACARANDA")).toBe("Jacaranda")
    expect(clear.get("SANTA CRUZ - MIRAFLORES")).toBe("Santa Cruz")
    expect(clear.has("EVENTOS")).toBe(false)
    const shared = storeMap(
      ["CHACARILLA - SURCO", "SURCO - JACARANDA"],
      ["Surco - Jacaranda", "Pezet"],
    )
    expect(shared.has("CHACARILLA - SURCO")).toBe(false)
    expect(shared.has("SURCO - JACARANDA")).toBe(false)
  })

  it("never links through a shared district word", () => {
    const stores = ["CHACARILLA - SURCO", "SURCO - JACARANDA"]
    const locations = ["Surco - Jacaranda", "Pezet"]
    const pairs = inferGuestLinks([sale("CHACARILLA - SURCO")], [stamp("Surco - Jacaranda")], {
      ...opts,
      stores,
      locations,
    })
    expect(pairs.size).toBe(0)
  })

  it("accepts a visit without location only when the tenant has a single location", () => {
    const single = inferGuestLinks([sale("Caja 1")], [stamp(null)], {
      ...opts,
      stores: ["Caja 1"],
      locations: ["Tienda"],
    })
    expect(single.size).toBe(1)
    const multi = inferGuestLinks([sale("PEZET - SAN ISIDRO")], [stamp(null)], {
      ...opts,
      stores: ["PEZET - SAN ISIDRO", "SURCO - JACARANDA"],
      locations: ["Pezet", "Jacaranda"],
    })
    expect(multi.size).toBe(0)
  })

  it("never crosses local midnight and keeps the amount tolerance tight", () => {
    const late = {
      id: "s",
      soldAt: new Date("2026-11-07T04:58:00Z"),
      store: "PEZET - SAN ISIDRO",
      amount: 30,
    }
    const next = { ...stamp("Pezet"), createdAt: new Date("2026-11-07T05:05:00Z") }
    expect(inferGuestLinks([late], [next], opts).size).toBe(0)
    expect(sameAmount(100, 102)).toBe(true)
    expect(sameAmount(100, 102.01)).toBe(false)
    expect(sameAmount(10, 10.5)).toBe(true)
    expect(sameAmount(10, 10.51)).toBe(false)
    expect(sameAmount(10, Number.NaN)).toBe(false)
  })
})
