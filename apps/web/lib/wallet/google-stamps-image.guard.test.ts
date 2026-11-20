import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseTenantFeatures } from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"

// Guard (19 Nov 2026): the stamp card drawn on Google Wallet is opt-in per
// tenant and off for everyone by default. A Google object is re-sent whole on
// every update (PUT), so every path that sends one must pass the image, or a
// visit would silently bring the fixed banner back on a tenant with the switch on.

const WEB = join(__dirname, "..", "..")
const ROOT = join(WEB, "..", "..")
const src = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n")

describe("stamp card on Google Wallet", () => {
  it("is off unless the stored value is exactly true", () => {
    expect(parseTenantFeatures(null).googleStampsImage).toBe(false)
    expect(parseTenantFeatures({}).googleStampsImage).toBe(false)
    expect(parseTenantFeatures({ googleStampsImage: false }).googleStampsImage).toBe(false)
    expect(parseTenantFeatures({ googleStampsImage: "true" }).googleStampsImage).toBe(false)
    expect(parseTenantFeatures({ googleStampsImage: true }).googleStampsImage).toBe(true)
  })

  it("every path that sends a Google object passes the image", () => {
    const senders = [
      "apps/web/app/api/[tenant]/register-client/route.ts",
      "apps/web/app/api/[tenant]/wallet/google/[clientId]/route.ts",
      "apps/web/app/(super-admin)/admin/pases/actions.ts",
      "packages/wallet/src/shared/update-after-visit.ts",
    ]
    for (const file of senders) {
      const s = src(file)
      const calls = s.split("upsertLoyaltyObject({").length - 1
      const withImage = s.split("stampsImageUrl:").length - 1
      expect(calls, file).toBeGreaterThan(0)
      expect(withImage, file).toBeGreaterThanOrEqual(calls)
    }
    // Visits and redemptions reach update-after-visit through here.
    expect(src("apps/web/lib/wallet/trigger-wallet-update.ts")).toContain("googleStampsImageUrl(")
  })

  it("the fixed banner is never sent as the object image", () => {
    for (const file of [
      "apps/web/app/api/[tenant]/register-client/route.ts",
      "apps/web/app/api/[tenant]/wallet/google/[clientId]/route.ts",
      "apps/web/app/(super-admin)/admin/pases/actions.ts",
    ]) {
      expect(src(file), file).not.toMatch(/stampsImageUrl:\s*heroImageUrl/)
    }
  })

  it("the switch refreshes Android passes only, without pushing iPhones", () => {
    const s = src("apps/web/app/(super-admin)/admin/tenants/tenant-features-section.tsx")
    const toggle = s.slice(
      s.indexOf("async function toggle("),
      s.indexOf("async function changeBarcode("),
    )
    expect(toggle).toContain("refreshTenantGooglePasses(tenantId)")
    expect(toggle).not.toContain("refreshTenantPasses(tenantId)")
  })
})
