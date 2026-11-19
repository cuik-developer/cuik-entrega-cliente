import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Guard (19 Nov 2026): the Google banner lives only on the loyalty class since
// objects stopped repeating it as an image module (Google's 2026 full-screen
// pass view showed both). Publishing a design must therefore refresh the class
// even when the tenant has no clients yet; before, that case returned early and
// the first sign-ups got a stale banner or none.

const WEB = join(__dirname, "..", "..")
const src = (path: string) => readFileSync(join(WEB, path), "utf8").replace(/\r\n/g, "\n")

describe("publishing a design refreshes the Google class", () => {
  it("updates the class before giving up on a tenant with no passes", () => {
    const s = src("app/(super-admin)/admin/pases/actions.ts")
    const start = s.indexOf("async function propagateGooglePasses(")
    const body = s.slice(start)
    const classUpdate = body.indexOf("await updateLoyaltyClass(")
    const noPassesExit = body.indexOf("if (googleInstances.length === 0)")

    expect(start).toBeGreaterThan(-1)
    expect(classUpdate).toBeGreaterThan(-1)
    expect(noPassesExit).toBeGreaterThan(classUpdate)
  })

  it("loyalty objects do not carry the banner again", () => {
    const s = readFileSync(
      join(WEB, "..", "..", "packages", "wallet", "src", "google", "loyalty-object.ts"),
      "utf8",
    )
    // The header comment explains the removal; no payload may set the field.
    expect(s).not.toMatch(/\.imageModulesData\s*=/)
    expect(s).not.toMatch(/imageModulesData\s*:/)
  })
})
