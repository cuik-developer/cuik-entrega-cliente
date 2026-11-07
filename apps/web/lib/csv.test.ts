import { describe, expect, it } from "vitest"
import { csvCell } from "./csv"

describe("csvCell", () => {
  it("neutralises formulas a client could put in their name", () => {
    expect(csvCell('=HYPERLINK("http://x";"ver")')).toBe('"\'=HYPERLINK(""http://x"";""ver"")"')
    expect(csvCell("+1+1")).toBe('"\'+1+1"')
    expect(csvCell("-2")).toBe('"\'-2"')
    expect(csvCell("@SUM(1)")).toBe('"\'@SUM(1)"')
    expect(csvCell("\t=1")).toBe('"\'\t=1"')
  })

  it("keeps ordinary values and closes quotes", () => {
    expect(csvCell("Ana Torres")).toBe('"Ana Torres"')
    expect(csvCell('x","=1+1","')).toBe('"x"",""=1+1"","""')
    expect(csvCell("")).toBe('""')
  })
})
