import { describe, expect, it } from "vitest"
import {
  cardCompleteNotice,
  getCardCompleteConfig,
  isCardCompleteMessage,
  renderCardCompleteMessage,
} from "./card-complete"

const ctx = { clientName: "Ana", tenantName: "Mascota Veloz", reward: "Baño gratis" }

describe("card complete notice", () => {
  it("is off by default and renders the merchant template when on", () => {
    expect(getCardCompleteConfig(undefined).enabled).toBe(false)
    expect(cardCompleteNotice({}, ctx)).toBeNull()
    expect(
      cardCompleteNotice(
        { cardComplete: { enabled: true, message: "Listo {{client.name}}: {{premio}}" } },
        ctx,
      ),
    ).toBe("Listo Ana: Baño gratis")
  })

  it("fills every variable, drops unknown ones and caps at 150", () => {
    expect(
      renderCardCompleteMessage("{{client.name}} en {{tenant.name}} gana {{reward}} {{x.y}}!", ctx),
    ).toBe("Ana en Mascota Veloz gana Baño gratis!")
    expect(renderCardCompleteMessage("Premio: {{premio}}", { ...ctx, reward: null })).toBe(
      "Premio: tu premio",
    )
    const long = renderCardCompleteMessage("x".repeat(200), ctx)
    expect(long).toHaveLength(150)
  })

  it("recognises its own output for any client, so the next visit can clear it", () => {
    const automations = {
      cardComplete: {
        enabled: true,
        message: "¡Completaste, {{client.name}}! Premio: {{premio}}.",
      },
    }
    const text = cardCompleteNotice(automations, ctx) as string
    expect(isCardCompleteMessage(text, automations)).toBe(true)
    expect(isCardCompleteMessage("¡Completaste, Luis! Premio: Café.", automations)).toBe(true)
    expect(isCardCompleteMessage("Tu próxima visita tiene premio", automations)).toBe(false)
    expect(isCardCompleteMessage("20 % de descuento este viernes", automations)).toBe(false)
  })
})
