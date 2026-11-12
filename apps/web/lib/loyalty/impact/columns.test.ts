import { describe, expect, it } from "vitest"

import { normalizeDni } from "./columns"

describe("normalizeDni accepts DNI and carné de extranjería", () => {
  it("keeps 8 and 9 digit documents, rejects RUC, placeholders and blanks", () => {
    expect(normalizeDni("73039969")).toBe("73039969")
    expect(normalizeDni("002905974")).toBe("002905974")
    expect(normalizeDni("20123456789")).toBeNull()
    expect(normalizeDni("111111111")).toBeNull()
    expect(normalizeDni("")).toBeNull()
  })
})
