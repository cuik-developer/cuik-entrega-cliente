import { describe, expect, it } from "vitest"
import { formatBirthday, formatBirthdayShort, hasBirthYear } from "./birthday"

describe("birthday without year", () => {
  it("hides the sentinel year and keeps a real one", () => {
    expect(hasBirthYear("1904-05-12")).toBe(false)
    expect(hasBirthYear("1990-05-12")).toBe(true)
    expect(hasBirthYear(null)).toBe(false)
    expect(formatBirthday("1904-05-12")).toBe("12 de mayo")
    expect(formatBirthday("1990-05-12")).toBe("12 de mayo de 1990")
    expect(formatBirthday("1904-02-29")).toBe("29 de febrero")
    expect(formatBirthday(null)).toBe("")
    expect(formatBirthdayShort("1904-05-12")).toBe("12/05")
    expect(formatBirthdayShort("1990-05-12")).toBe("12/05/1990")
  })
})
