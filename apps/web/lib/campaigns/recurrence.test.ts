import { describe, expect, it } from "vitest"
import {
  computeNextRun,
  describeRecurrence,
  isSendDay,
  nextOccurrences,
  type RecurrenceRule,
} from "./recurrence"

const LIMA = "America/Lima" // UTC-5, no DST

// 2026-10-07 is a Wednesday.
const WEEKLY_WED: RecurrenceRule = {
  frequency: "weekly",
  intervalWeeks: 1,
  weekdays: [3],
  sendHour: 10,
  sendMinute: 0,
  startsOn: "2026-10-07",
}

const lima = (ymd: string, hh: string) => new Date(`${ymd}T${hh}:00-05:00`)

describe("isSendDay", () => {
  it("weekly: matches the weekday from startsOn onward", () => {
    expect(isSendDay(WEEKLY_WED, "2026-10-07")).toBe(true)
    expect(isSendDay(WEEKLY_WED, "2026-10-14")).toBe(true)
    expect(isSendDay(WEEKLY_WED, "2026-10-08")).toBe(false)
    expect(isSendDay(WEEKLY_WED, "2026-09-30")).toBe(false) // before startsOn
  })

  it("every 2 weeks: alternates, anchored on startsOn's week", () => {
    const rule = { ...WEEKLY_WED, intervalWeeks: 2 }
    expect(isSendDay(rule, "2026-10-07")).toBe(true)
    expect(isSendDay(rule, "2026-10-14")).toBe(false)
    expect(isSendDay(rule, "2026-10-21")).toBe(true)
    expect(isSendDay(rule, "2026-11-04")).toBe(true)
  })

  it("every 3 weeks with two weekdays", () => {
    const rule = { ...WEEKLY_WED, intervalWeeks: 3, weekdays: [1, 4] } // Mon + Thu
    // week of 2026-10-05 is week 1
    expect(isSendDay(rule, "2026-10-08")).toBe(true) // Thu week 1
    expect(isSendDay(rule, "2026-10-12")).toBe(false) // Mon week 2
    expect(isSendDay(rule, "2026-10-26")).toBe(true) // Mon week 4
    expect(isSendDay(rule, "2026-10-29")).toBe(true) // Thu week 4
  })

  it("respects endsOn", () => {
    const rule = { ...WEEKLY_WED, endsOn: "2026-10-20" }
    expect(isSendDay(rule, "2026-10-14")).toBe(true)
    expect(isSendDay(rule, "2026-10-21")).toBe(false)
  })

  it("monthly_weekday: first Friday and last Sunday", () => {
    const firstFri: RecurrenceRule = {
      frequency: "monthly_weekday",
      intervalWeeks: 1,
      weekdays: [5],
      weekOfMonth: 1,
      sendHour: 9,
      sendMinute: 30,
      startsOn: "2026-10-01",
    }
    expect(isSendDay(firstFri, "2026-10-02")).toBe(true)
    expect(isSendDay(firstFri, "2026-10-09")).toBe(false)
    expect(isSendDay(firstFri, "2026-11-06")).toBe(true)

    const lastSun: RecurrenceRule = { ...firstFri, weekdays: [0], weekOfMonth: -1 }
    expect(isSendDay(lastSun, "2026-10-25")).toBe(true)
    expect(isSendDay(lastSun, "2026-10-18")).toBe(false)
    expect(isSendDay(lastSun, "2026-11-29")).toBe(true)
  })
})

describe("computeNextRun", () => {
  it("returns the send instant in the tenant timezone, strictly after `after`", () => {
    // Monday 10/05 noon Lima → Wednesday 10/07 10:00 Lima = 15:00 UTC
    const next = computeNextRun(WEEKLY_WED, lima("2026-10-05", "12:00"), LIMA)
    expect(next?.toISOString()).toBe("2026-10-07T15:00:00.000Z")
  })

  it("same day: before the hour → today; at or after the hour → next week", () => {
    expect(computeNextRun(WEEKLY_WED, lima("2026-10-07", "09:59"), LIMA)?.toISOString()).toBe(
      "2026-10-07T15:00:00.000Z",
    )
    expect(computeNextRun(WEEKLY_WED, lima("2026-10-07", "10:00"), LIMA)?.toISOString()).toBe(
      "2026-10-14T15:00:00.000Z",
    )
  })

  it("never before startsOn", () => {
    const next = computeNextRun(WEEKLY_WED, lima("2026-09-01", "12:00"), LIMA)
    expect(next?.toISOString()).toBe("2026-10-07T15:00:00.000Z")
  })

  it("stops at endsOn and at maxOccurrences", () => {
    expect(
      computeNextRun({ ...WEEKLY_WED, endsOn: "2026-10-13" }, lima("2026-10-07", "11:00"), LIMA),
    ).toBeNull()
    expect(
      computeNextRun({ ...WEEKLY_WED, maxOccurrences: 4 }, lima("2026-10-07", "11:00"), LIMA, 4),
    ).toBeNull()
    expect(
      computeNextRun({ ...WEEKLY_WED, maxOccurrences: 4 }, lima("2026-10-07", "11:00"), LIMA, 3),
    ).not.toBeNull()
  })

  it("handles a DST timezone by converting wall time per date", () => {
    const madrid = "Europe/Madrid"
    // 2026-10-21 (CEST, UTC+2) and 2026-10-28 (CET, UTC+1): 10:00 local differs in UTC
    const a = computeNextRun(WEEKLY_WED, new Date("2026-10-20T00:00:00Z"), madrid)
    const b = computeNextRun(WEEKLY_WED, new Date("2026-10-27T00:00:00Z"), madrid)
    expect(a?.toISOString()).toBe("2026-10-21T08:00:00.000Z")
    expect(b?.toISOString()).toBe("2026-10-28T09:00:00.000Z")
  })

  it("monthly: first Friday of the next months", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly_weekday",
      intervalWeeks: 1,
      weekdays: [5],
      weekOfMonth: 1,
      sendHour: 9,
      sendMinute: 30,
      startsOn: "2026-10-03", // after Oct's first Friday (10/02) → first hit is November
    }
    expect(computeNextRun(rule, lima("2026-10-01", "00:00"), LIMA)?.toISOString()).toBe(
      "2026-11-06T14:30:00.000Z",
    )
  })
})

describe("nextOccurrences", () => {
  it("lists the next N send instants (preview)", () => {
    const rule = { ...WEEKLY_WED, intervalWeeks: 2 }
    const list = nextOccurrences(rule, lima("2026-10-01", "00:00"), LIMA, 3).map((d) =>
      d.toISOString(),
    )
    expect(list).toEqual([
      "2026-10-07T15:00:00.000Z",
      "2026-10-21T15:00:00.000Z",
      "2026-11-04T15:00:00.000Z",
    ])
  })

  it("is cut short by maxOccurrences", () => {
    const rule = { ...WEEKLY_WED, maxOccurrences: 2 }
    expect(nextOccurrences(rule, lima("2026-10-01", "00:00"), LIMA, 5)).toHaveLength(2)
  })
})

describe("describeRecurrence", () => {
  it("weekly", () => {
    expect(describeRecurrence(WEEKLY_WED)).toBe("todos los miércoles a las 10:00")
    expect(describeRecurrence({ ...WEEKLY_WED, intervalWeeks: 2 })).toBe(
      "cada 2 semanas los miércoles a las 10:00",
    )
    expect(describeRecurrence({ ...WEEKLY_WED, weekdays: [4, 1, 6], sendMinute: 30 })).toBe(
      "todos los lunes, jueves y sábado a las 10:30",
    )
  })

  it("monthly", () => {
    expect(
      describeRecurrence({
        frequency: "monthly_weekday",
        intervalWeeks: 1,
        weekdays: [5],
        weekOfMonth: -1,
        sendHour: 18,
        sendMinute: 0,
        startsOn: "2026-10-01",
      }),
    ).toBe("el último viernes de cada mes a las 18:00")
  })
})
