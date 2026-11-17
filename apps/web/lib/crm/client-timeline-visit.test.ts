import { describe, expect, it } from "vitest"
import { visitEvent } from "./client-timeline"

const base = {
  id: "v1",
  at: new Date("2026-11-17T21:51:00Z"),
  visitNum: 3,
  cycleNumber: 2,
  source: "qr",
  bonusKind: null,
  amount: null,
  cashbackAmount: null,
  points: 1,
  locationName: null,
  cashierName: "Francesco",
}

describe("visitEvent (Clientes › Actividad)", () => {
  it("names the origin like the cashier Historial and the Excel", () => {
    expect(visitEvent(base, false).detail).toBe("QR")
    expect(visitEvent({ ...base, source: "manual" }, false).detail).toBe("Manual")
    expect(visitEvent({ ...base, source: "bonus" }, false).detail).toBe("Bono de registro")
    expect(visitEvent({ ...base, bonusKind: "special_hour" }, false).detail).toBe(
      "Bono hora especial",
    )
    expect(visitEvent({ ...base, bonusKind: "birthday" }, false).detail).toBe("Bono de cumpleaños")
  })

  it("shows the amount and the cashback the purchase earned", () => {
    const e = visitEvent(
      {
        ...base,
        source: "manual",
        bonusKind: "special_hour",
        amount: "47.90",
        cashbackAmount: "4.80",
        locationName: "Sucursal 1",
      },
      false,
    )
    expect(e.title).toBe("Visita · sello 3 (ciclo 2)")
    expect(e.detail).toBe("Sucursal 1 · S/ 47.90 · +S/ 4.80 cashback · Bono hora especial")
    expect(e.by).toBe("Francesco")
  })

  it("points: the registration bonus is said once, in the title", () => {
    const e = visitEvent({ ...base, source: "bonus", points: 10 }, true)
    expect(e.title).toBe("Bono de registro · +10 pts")
    expect(e.detail).toBeUndefined()
    expect(visitEvent({ ...base, points: 26, amount: "26" }, true).detail).toBe("S/ 26.00 · QR")
  })
})
