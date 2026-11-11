import { describe, expect, it } from "vitest"

import { dayInTz, matchOrdersToVisits, sameStore, storeTokens } from "./match"
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
