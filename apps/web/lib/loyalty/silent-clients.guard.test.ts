import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { isSilentClient, SILENT_CLIENT_STATUSES } from "./archive"

// Guard for a business rule (3 Nov 2026): an archived or deleted client gets
// no communication of any kind. On 2–3 Nov the purge's last pass update
// re-rendered "Hola {{client.name}}" as "Hola Cliente eliminado" and Apple
// showed it on the lock screen. If one of these tests fails, the change is
// wrong — do not "fix" the test.

const WEB = join(__dirname, "..", "..")
const src = (path: string) => readFileSync(join(WEB, path), "utf8").replace(/\r\n/g, "\n")

describe("isSilentClient", () => {
  it("silences archived and deleted only", () => {
    expect(SILENT_CLIENT_STATUSES).toEqual(["archived", "deleted"])
    expect(isSilentClient("archived")).toBe(true)
    expect(isSilentClient("deleted")).toBe(true)
    expect(isSilentClient("active")).toBe(false)
    expect(isSilentClient("inactive")).toBe(false)
    expect(isSilentClient("blocked")).toBe(false)
    expect(isSilentClient(null)).toBe(false)
  })
})

describe("no communication to archived / deleted clients", () => {
  it("the purge drops the stored campaign text before anonymizing", () => {
    const s = src("lib/loyalty/purge-archived-clients.ts")
    const clear = s.indexOf(".set({ campaignMessage: null })")
    const rename = s.indexOf('name: "Cliente eliminado"')
    expect(clear).toBeGreaterThan(-1)
    expect(clear).toBeLessThan(rename)
  })

  it("archiving drops the stored campaign text", () => {
    const s = src("app/api/[tenant]/clients/[id]/route.ts")
    expect(s).toMatch(
      /status === "archived"\) \{\n\s+await tx\n\s+\.update\(passInstances\)\n\s+\.set\(\{ campaignMessage: null \}\)/,
    )
  })

  it("pass updates skip archived and deleted clients", () => {
    const s = src("lib/wallet/trigger-wallet-update.ts")
    expect(s).toMatch(/statusRow\.status === "archived" \|\| statusRow\.status === "deleted"/)
  })

  it("campaign audiences only take active and inactive clients", () => {
    expect(src("lib/campaigns/resolve-segment.ts")).toMatch(
      /inArray\(clients\.status, \["active", "inactive"\]\)/,
    )
    expect(src("lib/loyalty/expire-points.ts")).toMatch(
      /clients\.status\} IN \('active', 'inactive'\)/,
    )
    expect(src("lib/campaigns/birthday.ts")).toMatch(
      /clients\.status\} IN \('active', 'inactive'\)/,
    )
  })

  it("publishing a design does not push silent clients' passes", () => {
    const s = src("app/(super-admin)/admin/pases/actions.ts")
    expect(s).toMatch(/\.filter\(\(i\) => !isSilentClient\(i\.clientStatus\)\)/)
  })

  it("the pass-link email is not sent to silent clients", () => {
    expect(src("app/api/[tenant]/send-pass-link/route.ts")).toMatch(
      /if \(!client \|\| isSilentClient\(client\.status\)\)/,
    )
  })

  it("pass downloads refuse silent clients", () => {
    for (const path of [
      "app/api/[tenant]/wallet/apple/[clientId]/route.ts",
      "app/api/[tenant]/wallet/apple/[clientId]/[token]/route.ts",
      "app/api/[tenant]/wallet/google/[clientId]/route.ts",
    ]) {
      expect(src(path)).toMatch(/if \(isSilentClient\(client\.status\)\) return errorResponse/)
    }
  })
})
