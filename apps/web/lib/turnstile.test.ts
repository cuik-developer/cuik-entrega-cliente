import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function load() {
  vi.resetModules()
  return import("./turnstile")
}

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("verifyTurnstile", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("skips the check (true) and warns once when the secret is unset", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { verifyTurnstile } = await load()
    expect(await verifyTurnstile(undefined)).toBe(true)
    expect(await verifyTurnstile("tok")).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a missing token without calling Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret")
    const { verifyTurnstile } = await load()
    expect(await verifyTurnstile(undefined)).toBe(false)
    expect(await verifyTurnstile(null)).toBe(false)
    expect(await verifyTurnstile("")).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts secret, token and IP and accepts success", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret")
    fetchMock.mockResolvedValue(okResponse({ success: true }))
    const { verifyTurnstile } = await load()
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify")
    const body = init.body as URLSearchParams
    expect(body.get("secret")).toBe("secret")
    expect(body.get("response")).toBe("tok")
    expect(body.get("remoteip")).toBe("1.2.3.4")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("omits an unknown IP", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret")
    fetchMock.mockResolvedValue(okResponse({ success: true }))
    const { verifyTurnstile } = await load()
    await verifyTurnstile("tok", "unknown")
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).has("remoteip")).toBe(false)
  })

  it("rejects when Cloudflare says no or answers with an error status", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret")
    const { verifyTurnstile } = await load()
    fetchMock.mockResolvedValueOnce(okResponse({ success: false, "error-codes": ["x"] }))
    expect(await verifyTurnstile("tok")).toBe(false)
    fetchMock.mockResolvedValueOnce(okResponse({}, 500))
    expect(await verifyTurnstile("tok")).toBe(false)
  })

  it("fails closed on network error or timeout", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { verifyTurnstile } = await load()
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    expect(await verifyTurnstile("tok")).toBe(false)
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
    expect(await verifyTurnstile("tok")).toBe(false)
  })
})
