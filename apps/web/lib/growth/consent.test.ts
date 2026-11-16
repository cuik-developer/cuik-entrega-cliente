import { describe, expect, it } from "vitest"
import { type BlockState, suggestion } from "./audiences"
import { DEFAULT_RULES } from "./rules"

// Growth writes outside the loyalty program (WhatsApp, exported lists), so a
// client who did not tick "Quiero recibir promociones" is never suggested.
describe("suggestion · promotions consent", () => {
  const base: BlockState = {
    lastSentOn: null,
    inOpenSend: false,
    noContact: false,
    controlUntil: null,
    noConsent: false,
  }
  const member = { readyOn: null }

  it("keeps a consenting client ready", () => {
    expect(suggestion(member, base, "2026-11-16", DEFAULT_RULES).ready).toBe(true)
  })

  it("never suggests a client without consent", () => {
    expect(suggestion(member, { ...base, noConsent: true }, "2026-11-16", DEFAULT_RULES)).toEqual({
      ready: false,
      reason: "no_consent",
      availableOn: null,
    })
  })

  it("reports No contactar first when both apply", () => {
    const both = { ...base, noContact: true, noConsent: true }
    expect(suggestion(member, both, "2026-11-16", DEFAULT_RULES).reason).toBe("no_contact")
  })

  it("does not let a cooldown or a later ready day hide the missing consent", () => {
    const block = { ...base, noConsent: true, lastSentOn: "2026-11-15" }
    expect(suggestion({ readyOn: "2026-12-01" }, block, "2026-11-16", DEFAULT_RULES).reason).toBe(
      "no_consent",
    )
  })

  it("treats a block state without the field as consenting (older callers)", () => {
    const { noConsent: _omit, ...legacy } = base
    expect(suggestion(member, legacy, "2026-11-16", DEFAULT_RULES).ready).toBe(true)
  })
})
