import { describe, expect, it } from "vitest"
import { generateETag } from "./etag"

describe("generateETag", () => {
  const serial = "cuik:cafe:a1b2c3d4e5f6"
  const date = new Date("2026-03-01T12:00:00.000Z")

  it("wraps the value in double quotes (HTTP ETag format)", () => {
    const etag = generateETag(serial, 5, date)
    expect(etag.startsWith('"')).toBe(true)
    expect(etag.endsWith('"')).toBe(true)
  })

  it("contains the serial, totalVisits, and ISO date", () => {
    const etag = generateETag(serial, 5, date)
    expect(etag).toBe(`"${serial}:5:2026-03-01T12:00:00.000Z"`)
  })

  it("is deterministic for the same inputs", () => {
    const a = generateETag(serial, 5, date)
    const b = generateETag(serial, 5, date)
    expect(a).toBe(b)
  })

  it("changes when totalVisits changes", () => {
    const a = generateETag(serial, 5, date)
    const b = generateETag(serial, 6, date)
    expect(a).not.toBe(b)
  })

  it("changes when lastModified changes", () => {
    const a = generateETag(serial, 5, date)
    const b = generateETag(serial, 5, new Date("2026-03-02T12:00:00.000Z"))
    expect(a).not.toBe(b)
  })

  it("changes when serial changes", () => {
    const a = generateETag(serial, 5, date)
    const b = generateETag("cuik:other:000000000000", 5, date)
    expect(a).not.toBe(b)
  })

  it("handles 0 totalVisits", () => {
    const etag = generateETag(serial, 0, date)
    expect(etag).toContain(":0:")
  })
})
