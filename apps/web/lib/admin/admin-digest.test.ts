import { describe, expect, it } from "vitest"
import { type AdminAlert, CERT_THRESHOLDS, composeDigest, dueToday } from "./admin-digest"

describe("certificate thresholds", () => {
  const pick = (days: number) => [...CERT_THRESHOLDS].reverse().find((t) => days <= t)
  it("picks the tightest threshold reached", () => {
    expect(pick(30)).toBe(30)
    expect(pick(12)).toBe(14)
    expect(pick(7)).toBe(7)
    expect(pick(1)).toBe(1)
    expect(pick(0)).toBe(0)
    expect(pick(31)).toBeUndefined()
  })
})

function alert(
  partial: Partial<AdminAlert> & { key: string; kind: AdminAlert["kind"] },
): AdminAlert {
  return {
    severity: "warning",
    who: "Tenant",
    text: "texto",
    href: "https://cuik.org/admin/tenants/x",
    ...partial,
  }
}

describe("dueToday", () => {
  const today = "2026-10-09"
  it("billing alerts go out every day", () => {
    const a = alert({ key: "billing:x:2026-10:overdue", kind: "billing" })
    expect(dueToday([a], { [a.key]: today }, today)).toHaveLength(1)
  })
  it("one-shot alerts (demo, cert, campaign) never repeat", () => {
    const list = [
      alert({ key: "demo:x:2026-10-12", kind: "demo" }),
      alert({ key: "cert:x:30", kind: "cert" }),
      alert({ key: "campaign:c1", kind: "campaign" }),
    ]
    expect(dueToday(list, {}, today)).toHaveLength(3)
    expect(
      dueToday(
        list,
        { "demo:x:2026-10-12": "2026-10-08", "cert:x:30": "2026-09-20", "campaign:c1": today },
        today,
      ),
    ).toHaveLength(0)
  })
  it("cold tenants repeat every 7 days", () => {
    const a = alert({ key: "cold:x", kind: "cold" })
    expect(dueToday([a], { "cold:x": "2026-10-03" }, today)).toHaveLength(0)
    expect(dueToday([a], { "cold:x": "2026-10-02" }, today)).toHaveLength(1)
  })
  it("a new certificate threshold is a new key", () => {
    const a = alert({ key: "cert:x:7", kind: "cert" })
    expect(
      dueToday([a], { "cert:x:30": "2026-09-15", "cert:x:14": "2026-10-01" }, today),
    ).toHaveLength(1)
  })
})

describe("composeDigest", () => {
  it("groups by section and counts in the subject", () => {
    const body = composeDigest([
      alert({ key: "cert:x:7", kind: "cert", who: "D'frios", text: "vence en 7 días." }),
      alert({ key: "cold:y", kind: "cold", who: "Gym Fit", text: "lleva 20 días sin visitas." }),
      alert({ key: "cold:z", kind: "cold", who: "Librería", text: "lleva 15 días sin visitas." }),
      alert({ key: "billing:q", kind: "billing", who: "Café", text: "sin factura." }),
    ])
    expect(body.subject).toBe(
      "Resumen Cuik: 1 certificado Apple, 2 comercios fríos, 1 de facturación",
    )
    expect(body.paragraphs).toHaveLength(3)
    expect(body.paragraphs[0]).toContain("Certificados Apple:")
    expect(body.paragraphs[1]).toContain("• Gym Fit: lleva 20 días sin visitas.")
  })
})
