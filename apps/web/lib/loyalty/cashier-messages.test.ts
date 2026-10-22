import { describe, expect, it } from "vitest"

import {
  REDEEM_FALLBACK,
  redeemRejectionMessage,
  VISIT_FALLBACK,
  visitRejectionMessage,
} from "./cashier-messages"

describe("cashier messages", () => {
  it("names every visit rejection the engine can return", () => {
    for (const code of [
      "ALREADY_SCANNED_TODAY",
      "MAX_VISITS_REACHED",
      "LOCATION_NOT_ALLOWED",
      "CLIENT_NOT_FOUND",
      "NO_ACTIVE_PROMOTION",
      "CLIENT_BLOCKED",
      "CLIENT_ARCHIVED",
      "AMOUNT_REQUIRED",
      "BELOW_MINIMUM_PURCHASE",
    ]) {
      expect(visitRejectionMessage(code)).not.toBe(VISIT_FALLBACK)
    }
    expect(visitRejectionMessage("MAX_VISITS_REACHED")).toBe(
      "Ya alcanzó el máximo de visitas de hoy",
    )
  })
  it("falls back to the server message, then to a generic one", () => {
    expect(visitRejectionMessage(undefined, "El monto máximo por compra es S/ 10,000")).toBe(
      "El monto máximo por compra es S/ 10,000",
    )
    expect(visitRejectionMessage("SOMETHING_NEW")).toBe(VISIT_FALLBACK)
  })
  it("names redeem rejections", () => {
    expect(redeemRejectionMessage("DUPLICATE_REDEEM")).toBe(
      "Ese premio ya se canjeó hace unos segundos",
    )
    expect(redeemRejectionMessage("NOPE")).toBe(REDEEM_FALLBACK)
  })
})
