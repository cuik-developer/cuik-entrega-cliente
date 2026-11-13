import { issuerSchema, isValidRuc, taxProfileSchema } from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"
import {
  issuerForMonth,
  overlappingIssuer,
  profileForMonth,
  splitIgv,
  validityLabel,
} from "./issuers"

const MB = { id: "mb", fromMonth: null, toMonth: "2026-10" }
const CUIK = { id: "cuik", fromMonth: "2026-11", toMonth: null }

describe("isValidRuc", () => {
  it("accepts real RUCs with a valid check digit", () => {
    expect(isValidRuc("20606652055")).toBe(true) // CUIK E.I.R.L.
    expect(isValidRuc("20602048196")).toBe(true) // Making Brands
  })
  it("rejects a wrong check digit, length or prefix", () => {
    expect(isValidRuc("20606652054")).toBe(false)
    expect(isValidRuc("2060665205")).toBe(false)
    expect(isValidRuc("30606652055")).toBe(false)
    expect(isValidRuc("2060665205a")).toBe(false)
  })
})

describe("issuerForMonth", () => {
  it("hands October to Making Brands and November to Cuik", () => {
    expect(issuerForMonth([MB, CUIK], "2026-02")?.id).toBe("mb")
    expect(issuerForMonth([MB, CUIK], "2026-10")?.id).toBe("mb")
    expect(issuerForMonth([MB, CUIK], "2026-11")?.id).toBe("cuik")
    expect(issuerForMonth([MB, CUIK], "2030-01")?.id).toBe("cuik")
  })
  it("returns null in a gap", () => {
    expect(issuerForMonth([{ id: "a", fromMonth: "2027-01", toMonth: null }], "2026-12")).toBeNull()
  })
})

describe("overlappingIssuer", () => {
  it("finds no overlap between consecutive issuers", () => {
    expect(overlappingIssuer([MB], CUIK)).toBeNull()
    expect(overlappingIssuer([MB, CUIK], CUIK, "cuik")).toBeNull()
  })
  it("flags a shared month and open ranges", () => {
    expect(overlappingIssuer([MB], { fromMonth: "2026-10", toMonth: null })?.id).toBe("mb")
    expect(overlappingIssuer([CUIK], { fromMonth: null, toMonth: null })?.id).toBe("cuik")
    expect(overlappingIssuer([CUIK], { fromMonth: "2025-01", toMonth: "2026-10" })).toBeNull()
  })
})

describe("profileForMonth", () => {
  const profiles = [
    { issuerId: "cuik", fromMonth: "2026-11", regime: "rmt" },
    { issuerId: "cuik", fromMonth: "2028-01", regime: "general" },
    { issuerId: "mb", fromMonth: "2026-01", regime: "general" },
  ]
  it("picks the latest profile starting on or before the month", () => {
    expect(profileForMonth(profiles, "cuik", "2026-11")?.regime).toBe("rmt")
    expect(profileForMonth(profiles, "cuik", "2027-12")?.regime).toBe("rmt")
    expect(profileForMonth(profiles, "cuik", "2028-03")?.regime).toBe("general")
  })
  it("returns null before the first profile", () => {
    expect(profileForMonth(profiles, "cuik", "2026-10")).toBeNull()
  })
})

describe("splitIgv", () => {
  it("takes IGV out of an amount that includes it", () => {
    expect(splitIgv(250, true, 0.18)).toEqual({ base: 211.86, igv: 38.14, total: 250 })
    expect(splitIgv(59, true, 0.18)).toEqual({ base: 50, igv: 9, total: 59 })
  })
  it("adds IGV on top otherwise", () => {
    expect(splitIgv(250, false, 0.18)).toEqual({ base: 250, igv: 45, total: 295 })
  })
  it("always adds up", () => {
    for (const a of [79, 99.9, 1234.56, 0.01]) {
      const s = splitIgv(a, true, 0.18)
      expect(Math.round((s.base + s.igv) * 100) / 100).toBe(s.total)
    }
  })
})

describe("validityLabel", () => {
  it("describes open and closed ranges", () => {
    expect(validityLabel(MB)).toBe("Hasta oct 2026")
    expect(validityLabel(CUIK)).toBe("Desde nov 2026")
    expect(validityLabel({ fromMonth: "2026-11", toMonth: "2027-12" })).toBe("nov 2026 – dic 2027")
  })
})

describe("issuer and tax profile validators", () => {
  it("rejects an invalid RUC and an inverted range", () => {
    const base = {
      ruc: "20606652055",
      razonSocial: "CUIK E.I.R.L.",
      nombreComercial: "",
      domicilioFiscal: "",
      fromMonth: "2026-11",
      toMonth: "",
      notes: "",
    }
    expect(issuerSchema.safeParse(base).success).toBe(true)
    expect(issuerSchema.safeParse({ ...base, ruc: "20606652054" }).success).toBe(false)
    expect(issuerSchema.safeParse({ ...base, toMonth: "2026-10" }).success).toBe(false)
  })
  it("requires ascending brackets ending in an open one", () => {
    const profile = {
      issuerId: "6f1c1a52-6f7b-4a43-9a58-0d2c4f1e9b11",
      fromMonth: "2026-11",
      regime: "rmt",
      igvRate: 0.18,
      monthlyRate: 0.01,
      annualBrackets: [
        { upToUit: 15, rate: 0.1 },
        { upToUit: null, rate: 0.295 },
      ],
      representationCapPct: 0.005,
      representationCapUit: 40,
      validatedByAccountant: false,
      notes: null,
    }
    expect(taxProfileSchema.safeParse(profile).success).toBe(true)
    expect(
      taxProfileSchema.safeParse({
        ...profile,
        annualBrackets: [
          { upToUit: null, rate: 0.1 },
          { upToUit: 15, rate: 0.295 },
        ],
      }).success,
    ).toBe(false)
    expect(
      taxProfileSchema.safeParse({
        ...profile,
        annualBrackets: [
          { upToUit: 15, rate: 0.1 },
          { upToUit: 10, rate: 0.2 },
        ],
      }).success,
    ).toBe(false)
    expect(
      taxProfileSchema.safeParse({ ...profile, annualBrackets: [{ upToUit: 15, rate: 0.1 }] })
        .success,
    ).toBe(false)
    expect(
      taxProfileSchema.safeParse({ ...profile, regime: "rer", annualBrackets: [] }).success,
    ).toBe(true)
  })
})
