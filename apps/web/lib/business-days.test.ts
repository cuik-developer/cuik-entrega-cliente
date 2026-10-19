import { describe, expect, it } from "vitest"
import {
  addBusinessDays,
  businessDaysBetween,
  complaintDueOn,
  easterSunday,
  isBusinessDay,
  limaYmd,
  peruHolidays,
} from "./business-days"

describe("easterSunday", () => {
  it("matches known dates", () => {
    expect(easterSunday(2024)).toBe("2024-03-31")
    expect(easterSunday(2025)).toBe("2025-04-20")
    expect(easterSunday(2026)).toBe("2026-04-05")
    expect(easterSunday(2027)).toBe("2027-03-28")
    expect(easterSunday(2038)).toBe("2038-04-25")
  })
})

describe("peruHolidays", () => {
  it("includes the fixed holidays plus Holy Thursday and Good Friday", () => {
    const h = peruHolidays(2026)
    expect(h.has("2026-04-02")).toBe(true)
    expect(h.has("2026-04-03")).toBe(true)
    expect(h.has("2026-07-28")).toBe(true)
    expect(h.has("2026-12-09")).toBe(true)
    expect(h.size).toBe(16)
  })
})

describe("isBusinessDay", () => {
  it("skips weekends and holidays", () => {
    expect(isBusinessDay("2026-10-19")).toBe(true) // Monday
    expect(isBusinessDay("2026-10-17")).toBe(false) // Saturday
    expect(isBusinessDay("2026-10-18")).toBe(false) // Sunday
    expect(isBusinessDay("2026-10-08")).toBe(false) // Angamos, Thursday
  })
})

describe("addBusinessDays", () => {
  it("does not count the start day", () => {
    expect(addBusinessDays("2026-10-19", 1)).toBe("2026-10-20")
    expect(addBusinessDays("2026-10-16", 1)).toBe("2026-10-19") // Friday → Monday
  })

  it("15 business days with no weekday holiday in between", () => {
    // Mon 19 Oct 2026 → Mon 9 Nov 2026 (1 Nov falls on a Sunday)
    expect(addBusinessDays("2026-10-19", 15)).toBe("2026-11-09")
  })

  it("skips fixed holidays", () => {
    // Fri 2 Oct 2026: Thu 8 Oct (Angamos) is skipped → Mon 26 Oct, not Fri 23 Oct
    expect(addBusinessDays("2026-10-02", 15)).toBe("2026-10-26")
  })

  it("skips Holy Week and the end of July", () => {
    // Mon 23 Mar 2026: Thu 2 / Fri 3 Apr are holidays → Wed 15 Apr
    expect(addBusinessDays("2026-03-23", 15)).toBe("2026-04-15")
    // Mon 20 Jul 2026: 23, 28, 29 Jul and 6 Aug are holidays → Fri 14 Aug
    expect(addBusinessDays("2026-07-20", 15)).toBe("2026-08-14")
  })

  it("filed on a weekend starts counting on Monday", () => {
    expect(addBusinessDays("2026-10-17", 1)).toBe("2026-10-19")
    expect(addBusinessDays("2026-10-18", 15)).toBe("2026-11-06")
  })

  it("crosses the year with Christmas and New Year", () => {
    // Mon 14 Dec 2026: 25 Dec and 1 Jan are holidays → Wed 6 Jan 2027
    expect(addBusinessDays("2026-12-14", 15)).toBe("2027-01-06")
  })
})

describe("businessDaysBetween", () => {
  it("counts (from, to]", () => {
    expect(businessDaysBetween("2026-10-19", "2026-10-19")).toBe(0)
    expect(businessDaysBetween("2026-10-19", "2026-10-20")).toBe(1)
    expect(businessDaysBetween("2026-10-16", "2026-10-19")).toBe(1)
    expect(businessDaysBetween("2026-10-19", "2026-11-09")).toBe(15)
    expect(businessDaysBetween("2026-10-20", "2026-10-19")).toBe(0)
  })
})

describe("limaYmd / complaintDueOn", () => {
  it("uses the Lima date, not UTC", () => {
    // 03:00 UTC on 20 Oct is still 19 Oct 22:00 in Lima (UTC-5)
    expect(limaYmd(new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-19")
    expect(complaintDueOn(new Date("2026-10-20T03:00:00Z"))).toBe("2026-11-09")
    expect(complaintDueOn(new Date("2026-10-20T06:00:00Z"))).toBe("2026-11-10")
  })
})
