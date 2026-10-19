import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@cuik/email", () => ({ MensajePersonalizado: vi.fn(), sendEmail: vi.fn() }))

import { DAILY_NOTIFY_CAP, notifyDecision, resetNotifyCounters } from "./notify-cap"

describe("notifyDecision", () => {
  beforeEach(() => resetNotifyCounters())

  const day = new Date("2026-10-19T15:00:00Z")

  it("emails up to the cap, sends one notice, then skips", () => {
    const seen = Array.from({ length: DAILY_NOTIFY_CAP + 3 }, () =>
      notifyDecision("reclamaciones", day),
    )
    expect(seen.slice(0, DAILY_NOTIFY_CAP).every((d) => d === "send")).toBe(true)
    expect(seen[DAILY_NOTIFY_CAP]).toBe("cap-reached")
    expect(seen.slice(DAILY_NOTIFY_CAP + 1).every((d) => d === "skip")).toBe(true)
  })

  it("counts each kind separately", () => {
    for (let i = 0; i < DAILY_NOTIFY_CAP; i++) notifyDecision("reclamaciones", day)
    expect(notifyDecision("solicitudes", day)).toBe("send")
  })

  it("starts again on the next Lima day", () => {
    for (let i = 0; i < DAILY_NOTIFY_CAP + 1; i++) notifyDecision("contacto", day)
    expect(notifyDecision("contacto", new Date("2026-10-20T15:00:00Z"))).toBe("send")
  })
})
