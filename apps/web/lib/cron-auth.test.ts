import { afterEach, describe, expect, it, vi } from "vitest"
import { isCronAuthorized } from "./cron-auth"

const req = (secret?: string) =>
  new Request("https://cuik.org/api/cron/x", {
    method: "POST",
    headers: secret === undefined ? {} : { "x-cron-secret": secret },
  })

describe("isCronAuthorized", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("accepts the configured secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value")
    expect(isCronAuthorized(req("s3cret-value"))).toBe(true)
  })

  it("rejects a wrong or missing header", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value")
    expect(isCronAuthorized(req("s3cret-valuX"))).toBe(false)
    expect(isCronAuthorized(req("short"))).toBe(false)
    expect(isCronAuthorized(req())).toBe(false)
  })

  it("fails closed when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", "")
    expect(isCronAuthorized(req(""))).toBe(false)
    expect(isCronAuthorized(req("anything"))).toBe(false)
  })
})
