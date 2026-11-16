import { describe, expect, it } from "vitest"
import { consentEvent } from "./client-timeline"

const at = new Date("2026-11-20T19:40:00Z")
const base = { id: "e1", at, version: "2026-11-16" }

describe("consentEvent (Actividad › Privacidad)", () => {
  it("shows the accepted notice with its version and origin", () => {
    expect(
      consentEvent({ ...base, kind: "privacy", granted: true, source: "registro" }),
    ).toMatchObject({
      id: "consent-e1",
      type: "consent",
      at: at.toISOString(),
      title: "Aceptó el aviso de privacidad",
      detail: "en el registro · aviso versión 2026-11-16",
    })
  })

  it("tells a 'no' at registration apart from a later withdrawal", () => {
    expect(
      consentEvent({ ...base, kind: "marketing", granted: false, source: "registro" }).title,
    ).toBe("No autorizó recibir promociones")
    expect(
      consentEvent({ ...base, kind: "marketing", granted: false, source: "preferencias" }).title,
    ).toBe("Retiró la autorización de promociones")
  })

  it("shows a given authorization and never the IP or browser", () => {
    const e = consentEvent({ ...base, kind: "marketing", granted: true, source: "preferencias" })
    expect(e.title).toBe("Autorizó recibir promociones por WhatsApp y correo")
    expect(e.detail).toBe("desde su enlace de preferencias · aviso versión 2026-11-16")
  })
})
