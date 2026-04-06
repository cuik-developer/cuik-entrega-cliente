import { describe, expect, it } from "vitest"
import { ASSET_DIMENSIONS, buildPrompt } from "./prompt-templates"

describe("ASSET_DIMENSIONS", () => {
  it("has correct strip dimensions", () => {
    expect(ASSET_DIMENSIONS.strip).toEqual({ width: 750, height: 246 })
  })

  it("has correct logo dimensions", () => {
    expect(ASSET_DIMENSIONS.logo).toEqual({ width: 256, height: 256 })
  })

  it("has correct stamp dimensions", () => {
    expect(ASSET_DIMENSIONS.stamp).toEqual({ width: 128, height: 128 })
  })
})

describe("buildPrompt", () => {
  const baseContext = {
    businessName: "Café del Centro",
    businessType: "cafetería",
  }

  describe("strip", () => {
    it("contains business type in the prompt", () => {
      const prompt = buildPrompt("strip", baseContext)

      expect(prompt).toContain("cafetería")
    })

    it("references dimensions", () => {
      const prompt = buildPrompt("strip", baseContext)

      expect(prompt).toContain("750x246")
    })

    it("includes custom primaryColor when provided", () => {
      const prompt = buildPrompt("strip", {
        ...baseContext,
        primaryColor: "#ff4810",
      })

      expect(prompt).toContain("#ff4810")
    })

    it("uses default color hint when primaryColor is omitted", () => {
      const prompt = buildPrompt("strip", baseContext)

      expect(prompt).toContain("warm, professional tones")
    })
  })

  describe("logo", () => {
    it("contains business name", () => {
      const prompt = buildPrompt("logo", baseContext)

      expect(prompt).toContain("Café del Centro")
    })

    it("contains business type", () => {
      const prompt = buildPrompt("logo", baseContext)

      expect(prompt).toContain("cafetería")
    })

    it("references dimensions", () => {
      const prompt = buildPrompt("logo", baseContext)

      expect(prompt).toContain("256x256")
    })
  })

  describe("stamp", () => {
    it("contains business type", () => {
      const prompt = buildPrompt("stamp", baseContext)

      expect(prompt).toContain("cafetería")
    })

    it("references dimensions", () => {
      const prompt = buildPrompt("stamp", baseContext)

      expect(prompt).toContain("128x128")
    })
  })

  describe("defaults", () => {
    it("uses 'business' when businessType is omitted", () => {
      const prompt = buildPrompt("strip", { businessName: "Test" })

      expect(prompt).toContain("business")
      expect(prompt).not.toContain("undefined")
    })

    it("logo uses 'business' default when businessType is omitted", () => {
      const prompt = buildPrompt("logo", { businessName: "Test" })

      expect(prompt).toContain("business")
    })

    it("stamp uses 'business' default when businessType is omitted", () => {
      const prompt = buildPrompt("stamp", { businessName: "Test" })

      expect(prompt).toContain("business")
    })
  })
})
