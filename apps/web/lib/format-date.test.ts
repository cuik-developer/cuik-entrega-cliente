import { describe, expect, it } from "vitest"
import { formatDateTime } from "./format-date"

describe("formatDateTime", () => {
  const utc = "2026-09-09T20:32:00.000Z"

  it('renders the panel format "9 set. 2026, 15:32" in the tenant timezone', () => {
    expect(formatDateTime(utc, "America/Lima")).toBe("9 set. 2026, 15:32")
    expect(formatDateTime(new Date(utc), "America/Argentina/Buenos_Aires")).toBe(
      "9 set. 2026, 17:32",
    )
  })

  it("uses 24-hour clock (no a. m./p. m.) and single-digit days", () => {
    expect(formatDateTime("2026-01-03T04:05:00.000Z", "America/Lima")).toBe("2 ene. 2026, 23:05")
  })

  it("returns the placeholder for empty or invalid input", () => {
    expect(formatDateTime(null, "America/Lima")).toBe("—")
    expect(formatDateTime("not a date", "America/Lima")).toBe("—")
    expect(formatDateTime(undefined, "America/Lima", { placeholder: "--" })).toBe("--")
  })
})
