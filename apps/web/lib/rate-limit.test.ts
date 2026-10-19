import { afterEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, HOUR_MS, pruneRateLimitStore } from "./rate-limit"

let n = 0
const key = () => `test:${++n}`

describe("checkRateLimit", () => {
  afterEach(() => vi.useRealTimers())

  it("allows up to max requests, then blocks", () => {
    const k = key()
    expect(checkRateLimit(k, 2)).toBe(true)
    expect(checkRateLimit(k, 2)).toBe(true)
    expect(checkRateLimit(k, 2)).toBe(false)
  })

  it("keeps the default 10-minute window when none is given", () => {
    vi.useFakeTimers()
    const k = key()
    expect(checkRateLimit(k, 1)).toBe(true)
    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(checkRateLimit(k, 1)).toBe(false)
    vi.advanceTimersByTime(61 * 1000)
    expect(checkRateLimit(k, 1)).toBe(true)
  })

  it("honours a custom window across the periodic sweep", () => {
    vi.useFakeTimers()
    const k = key()
    expect(checkRateLimit(k, 1, HOUR_MS)).toBe(true)
    // 30 minutes later the sweep runs: an hourly entry must survive it.
    vi.advanceTimersByTime(30 * 60 * 1000)
    pruneRateLimitStore()
    expect(checkRateLimit(k, 1, HOUR_MS)).toBe(false)
    vi.advanceTimersByTime(31 * 60 * 1000)
    pruneRateLimitStore()
    expect(checkRateLimit(k, 1, HOUR_MS)).toBe(true)
  })
})
