import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { nextRewardPhrase, panelHint } from "@/components/cajero/pending-rewards"
import { columnsFor, DATASETS } from "@/lib/exports/dataset-columns"

// Guard for a business rule: Escanear and Buscar do the same job and must offer
// the same actions (user rule). On 17 Nov 2026 Buscar redeemed a S/ 22.90
// cashback with one tap while Escanear asked to confirm. Shared pieces live in
// components/cajero; if a test here fails, bring the screens back together.

const WEB = join(__dirname, "..", "..")
const src = (path: string) => readFileSync(join(WEB, path), "utf8").replace(/\r\n/g, "\n")
const ESCANEAR = "app/(cajero)/cajero/escanear/page.tsx"
const BUSCAR = "app/(cajero)/cajero/buscar/page.tsx"

describe("Escanear and Buscar parity", () => {
  it("both redeem pending rewards through the shared panel", () => {
    for (const path of [ESCANEAR, BUSCAR]) {
      const s = src(path)
      expect(s).toContain('from "@/components/cajero/pending-rewards"')
      expect(s).toContain("<PendingRewards")
      // No screen keeps its own one-tap "Canjear" box.
      expect(s).not.toContain("premio(s) pendiente(s)")
    }
  })

  it("both use the shared cash-out and cashback pieces", () => {
    for (const path of [ESCANEAR, BUSCAR]) {
      const s = src(path)
      expect(s).toContain("<CashOutOffer")
      expect(s).toContain("<CashbackSummary")
    }
  })

  it("the panel names what the redeem hands over", () => {
    expect(nextRewardPhrase({ label: "Cashback S/ 22.90", cashbackAmount: 22.9 })).toBe(
      "descontar S/ 22.90",
    )
    expect(nextRewardPhrase({ label: "Helado gratis", cashbackAmount: null })).toBe(
      "entregar Helado gratis",
    )
    expect(nextRewardPhrase(null)).toBe("entregar el premio")
  })

  it("never offers an amount it has not read", () => {
    const cb = { label: "Cashback S/ 22.90", cashbackAmount: 22.9 }
    expect(panelHint("loading", null, false)).toBe("Revisando el premio…")
    expect(panelHint("ready", null, false)).toMatch(/puede haber vencido/)
    expect(panelHint("error", null, true)).toMatch(/confirma con el cliente/)
    expect(panelHint("ready", cb, true)).toBe(
      "¿Canjear ahora? Debes descontar S/ 22.90 de esta compra.",
    )
  })
})

describe("cashback needs the purchase amount", () => {
  it("the server rejects a cashback stamp without amount", () => {
    expect(src("lib/loyalty/register-visit.ts")).toMatch(
      /if \(cashbackSettings && !\(Number\(amount\) > 0\)\) \{\n\s+return \{\n\s+code: "AMOUNT_REQUIRED"/,
    )
  })

  it("a visit that completes the card is labelled as its last stamp", () => {
    // A bonus that overflows into the next card used to read "sello 1 (ciclo 4)".
    expect(src("lib/loyalty/register-visit.ts")).toMatch(
      /const visitNum =\s+cycleComplete \|\| stampsInCycleAfter === 0 \? promotion\.maxVisits : stampsInCycleAfter/,
    )
  })

  it("the visits export has the cashback earned per visit (stamps only)", () => {
    const visits = DATASETS.find((d) => d.key === "visits")
    expect(visits).toBeDefined()
    if (!visits) return
    expect(columnsFor(visits, "stamps").some((c) => c.key === "cashbackAmount")).toBe(true)
    expect(columnsFor(visits, "points").some((c) => c.key === "cashbackAmount")).toBe(false)
  })
})
