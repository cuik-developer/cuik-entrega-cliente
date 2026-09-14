import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({ db: {}, eq: vi.fn(), sql: vi.fn(), tenants: {} }))
vi.mock("@cuik/email", () => ({ ReportePeriodico: () => null, sendEmail: vi.fn() }))

import { getReportsConfig, isReportDue } from "./send-report"

describe("getReportsConfig", () => {
  it("fills defaults (both off, Monday / day 1 at 8:00) and keeps lastSentPeriod", () => {
    expect(getReportsConfig(null)).toEqual({
      weekly: { enabled: false, dayOfWeek: 1, sendHour: 8 },
      monthly: { enabled: false, dayOfMonth: 1, sendHour: 8 },
    })
    const cfg = getReportsConfig({
      reports: {
        weekly: { enabled: true, dayOfWeek: 2, sendHour: 9, lastSentPeriod: "2026-09-07" },
      },
    })
    expect(cfg.weekly).toEqual({
      enabled: true,
      dayOfWeek: 2,
      sendHour: 9,
      lastSentPeriod: "2026-09-07",
    })
    expect(cfg.monthly.enabled).toBe(false)
  })

  it("ignores malformed json instead of throwing", () => {
    expect(getReportsConfig({ reports: { weekly: { enabled: "yes" } } }).weekly.enabled).toBe(false)
  })
})

describe("isReportDue", () => {
  const cfg = getReportsConfig({
    reports: {
      weekly: { enabled: true, dayOfWeek: 1, sendHour: 8 },
      monthly: { enabled: true, dayOfMonth: 1, sendHour: 8 },
    },
  })

  it("weekly: only on the configured weekday and hour", () => {
    expect(isReportDue("weekly", cfg, "2026-09-14", 8)).toEqual({ due: true }) // Monday
    expect(isReportDue("weekly", cfg, "2026-09-14", 9).reason).toBe("not_the_hour")
    expect(isReportDue("weekly", cfg, "2026-09-15", 8).reason).toBe("not_the_day")
  })

  it("monthly: only on the configured day of month and hour", () => {
    expect(isReportDue("monthly", cfg, "2026-10-01", 8)).toEqual({ due: true })
    expect(isReportDue("monthly", cfg, "2026-10-02", 8).reason).toBe("not_the_day")
    expect(isReportDue("monthly", cfg, "2026-10-01", 7).reason).toBe("not_the_hour")
  })

  it("disabled reports are never due", () => {
    const off = getReportsConfig(null)
    expect(isReportDue("weekly", off, "2026-09-14", 8).reason).toBe("disabled")
    expect(isReportDue("monthly", off, "2026-10-01", 8).reason).toBe("disabled")
  })
})
