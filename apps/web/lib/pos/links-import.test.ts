import { describe, expect, it } from "vitest"
import { buildLinksExcel } from "./links-excel"
import { isLinkDecision, parseLinksFile } from "./links-import"
import type { LinksReview } from "./links-review"

const V1 = "d9de8e6e-78b5-45d3-b35d-e52a0ff1d743"
const V2 = "2b6f0c1e-1111-4222-8333-444455556666"
const S1 = "0f1e2d3c-4b5a-4697-8899-aabbccddeeff"

describe("links import", () => {
  it("reads the merchant's sheet: group row above the headers, decision per row", async () => {
    const csv = [
      "REGISTRO CUIK,REGISTRO CUIK,REGISTRO MASCOTA VELOZ,,,",
      "#,Visita (Lima),Venta más cercana,Monto venta,Decisión,visita_id",
      `1,2026-11-10 13:30,SURCO - JACARANDA/79083,418.2,Enlazar,${V1}`,
      `2,2026-11-09 10:00,SURCO - JACARANDA/79001,50,No,${V2}`,
      "3,2026-11-08 09:00,,,Revisar,no-es-uuid",
    ].join("\n")
    const parsed = await parseLinksFile(Buffer.from(csv, "utf8"), "decisiones.csv")
    if ("error" in parsed) throw new Error(parsed.error)
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0]).toMatchObject({
      visitId: V1,
      saleId: null,
      orderRef: "SURCO - JACARANDA/79083",
      decision: "Enlazar",
      line: 3,
    })
    expect(parsed.rows[1].decision).toBe("No")
    expect(parsed.rows[2].visitId).toBe(null)
  })

  it("accepts the screen's own export (venta_id column) and rejects a sheet without visita_id", async () => {
    const ours = ["Nombre,Decisión,visita_id,venta_id", `Ana,Sí,${V1},${S1}`].join("\n")
    const parsed = await parseLinksFile(Buffer.from(ours, "utf8"), "x.csv")
    if ("error" in parsed) throw new Error(parsed.error)
    expect(parsed.rows[0]).toMatchObject({ visitId: V1, saleId: S1 })
    const bad = await parseLinksFile(Buffer.from("a,b\n1,2", "utf8"), "x.csv")
    expect("error" in bad).toBe(true)
  })

  it("only 'Enlazar'-like decisions link", () => {
    expect(isLinkDecision("Enlazar")).toBe(true)
    expect(isLinkDecision(" sí ")).toBe(true)
    expect(isLinkDecision("Revisar")).toBe(false)
    expect(isLinkDecision("")).toBe(false)
  })
})

describe("links excel", () => {
  it("writes the sheet the merchant answers and reads it back for the import", async () => {
    const review: LinksReview = {
      month: "2026-11",
      from: "2026-11-01",
      to: "2026-11-30",
      timezone: "America/Lima",
      summary: {
        visits: 2,
        withSale: 1,
        withoutSale: 1,
        rate: 50,
        byKind: { dni: 1, inferredAmount: 0, inferredTime: 0, manual: 0 },
        guestUnlinked: 3,
        clientNoVisit: 0,
        suggestions: { link: 1, review: 0, none: 0 },
      },
      unlinked: [
        {
          visitId: V1,
          createdAt: "2026-11-10T18:30:00Z",
          day: "2026-11-10",
          clientId: V2,
          clientName: "Juan Pinedo",
          dni: "46198799",
          phone: "940242928",
          location: "Jacaranda",
          amount: 418.2,
          registeredBy: "Rosa",
          suggestion: "link",
          candidates: [
            {
              saleId: S1,
              orderRef: "SURCO - JACARANDA/79083",
              soldAt: "2026-11-10T18:28:00Z",
              minutes: -2,
              store: "SURCO - JACARANDA",
              amount: 418.2,
              dni: null,
              customerName: null,
              clientId: null,
              sameAmount: true,
              sameStore: true,
            },
          ],
        },
      ],
      inferred: [],
    }
    const buffer = await buildLinksExcel(review, "Mascota Veloz")
    expect(buffer.length).toBeGreaterThan(1000)
    const parsed = await parseLinksFile(buffer, "registros.xlsx")
    if ("error" in parsed) throw new Error(parsed.error)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({ visitId: V1, saleId: S1, decision: "Enlazar" })
  })
})
