import { describe, expect, it } from "vitest"
import { clientIp } from "./client-ip"

const req = (headers: Record<string, string>) => new Request("https://cuik.org/api/x", { headers })

describe("clientIp", () => {
  it("prefers x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4")
  })

  it("falls back to the last x-forwarded-for hop (the one Traefik appended)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.1 , 5.6.7.8" }))).toBe("5.6.7.8")
    expect(clientIp(req({ "x-forwarded-for": "5.6.7.8" }))).toBe("5.6.7.8")
  })

  it("returns unknown without headers", () => {
    expect(clientIp(req({}))).toBe("unknown")
    expect(clientIp(req({ "x-forwarded-for": " , " }))).toBe("unknown")
  })
})
