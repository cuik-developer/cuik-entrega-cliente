import { describe, expect, it } from "vitest"

import { pickGoogleHeroAsset } from "./google-hero"

describe("pickGoogleHeroAsset", () => {
  const strip = { type: "strip_bg", url: "/api/assets/t/strip.png" }
  const logo = { type: "logo", url: "/api/assets/t/logo.png" }
  const hero = { type: "google_hero", url: "/api/assets/t/hero.png" }

  it("uses the Google-only hero when the design has one", () => {
    expect(pickGoogleHeroAsset([logo, strip, hero])).toBe(hero)
  })

  it("falls back to strip_bg exactly as before when there is no google_hero", () => {
    expect(pickGoogleHeroAsset([logo, strip])).toBe(strip)
  })

  it("returns undefined when there is neither", () => {
    expect(pickGoogleHeroAsset([logo])).toBeUndefined()
  })

  it("ignores a google_hero row with an empty url", () => {
    expect(pickGoogleHeroAsset([{ type: "google_hero", url: "" }, strip])).toBe(strip)
  })
})
