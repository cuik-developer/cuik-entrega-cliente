import { describe, expect, it } from "vitest"

import { copyName, copyWarnings } from "./design-copy"

describe("copying a pass design to another merchant", () => {
  const five = { type: "stamps", maxVisits: 5 }

  it("says nothing when both merchants run the same card", () => {
    expect(copyWarnings(five, { type: "stamps", maxVisits: 5 })).toEqual([])
  })

  it("warns when the destination fills its card with another number of stamps", () => {
    const [warning] = copyWarnings(five, { type: "stamps", maxVisits: 8 })
    expect(warning).toContain("5 sellos")
    expect(warning).toContain("usa 8")
  })

  it("warns when the destination runs another kind of program", () => {
    const [warning] = copyWarnings(five, { type: "points", maxVisits: 5 })
    expect(warning).toContain("programa de sellos")
    expect(warning).toContain("usa puntos")
  })

  it("warns when the destination has no program yet", () => {
    expect(copyWarnings(five, null)).toHaveLength(1)
    expect(copyWarnings(null, null)).toHaveLength(1)
  })

  it("has nothing to compare when the source had no program", () => {
    expect(copyWarnings(null, five)).toEqual([])
  })

  it("does not compare stamp counts of points cards", () => {
    expect(
      copyWarnings({ type: "points", maxVisits: 8 }, { type: "points", maxVisits: 10 }),
    ).toEqual([])
  })

  it("names the copy inside the 100 characters the column takes", () => {
    expect(copyName("Tarjeta Doomo")).toBe("Tarjeta Doomo (copia)")
    const long = copyName("x".repeat(100))
    expect(long).toHaveLength(100)
    expect(long.endsWith(" (copia)")).toBe(true)
  })
})
