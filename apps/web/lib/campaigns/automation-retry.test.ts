import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({ campaigns: {}, db: {}, eq: vi.fn(), sql: vi.fn() }))
vi.mock("./execute-campaign", () => ({ executeCampaign: vi.fn() }))

import {
  automationAttempts,
  MAX_AUTOMATION_ATTEMPTS,
  shouldRetryAutomation,
} from "./automation-retry"

describe("automation retry rules", () => {
  it("counts the first send as one attempt and reads stored attempts", () => {
    expect(automationAttempts({ automation: "birthday", date: "2026-10-15" })).toBe(1)
    expect(automationAttempts({ attempts: 2 })).toBe(2)
    expect(automationAttempts(null)).toBe(1)
    expect(automationAttempts({ attempts: "x" })).toBe(1)
  })

  it("retries only a failed send (still a draft) with attempts left", () => {
    expect(shouldRetryAutomation({ id: "a", status: "draft", content: {} })).toBe(true)
    expect(shouldRetryAutomation({ id: "a", status: "sent", content: {} })).toBe(false)
    expect(shouldRetryAutomation({ id: "a", status: "sending", content: {} })).toBe(false)
    expect(
      shouldRetryAutomation({
        id: "a",
        status: "draft",
        content: { attempts: MAX_AUTOMATION_ATTEMPTS },
      }),
    ).toBe(false)
  })
})
