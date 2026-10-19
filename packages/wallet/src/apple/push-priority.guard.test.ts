import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import {
  APNS_DIAGNOSTIC_PRIORITY,
  APNS_DIAGNOSTIC_PUSH_TYPE,
  APNS_PRIORITY,
  APNS_PUSH_TYPE,
} from "../shared/constants"

// Guard for a business decision (19 Oct 2026): every pass-update push (visit,
// redeem, design publish, campaigns) goes out as "alert" with priority 10.
// "background"/5 made iOS stop fetching passes on 15 Oct 2026 (cb057bb,
// 08e89c9). If one of these tests fails, the change is wrong — do not "fix"
// the test.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..")
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", ".git", ".claude"])
// The only place allowed to request the old "background"/5 kind.
const DIAGNOSTIC_ROUTE = ["apps", "web", "app", "api", "apple-wallet", "push-test", "route.ts"].join(sep)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe("APNs push priority (fixed at alert / 10)", () => {
  it("pass updates use alert with priority 10", () => {
    expect(APNS_PUSH_TYPE).toBe("alert")
    expect(APNS_PRIORITY).toBe("10")
  })

  it("keeps background / 5 only as the diagnostic kind", () => {
    expect(APNS_DIAGNOSTIC_PUSH_TYPE).toBe("background")
    expect(APNS_DIAGNOSTIC_PRIORITY).toBe("5")
  })

  it("sendApnsPush defaults to the immediate kind", () => {
    const src = readFileSync(join(__dirname, "apns.ts"), "utf8")
    expect(src).toMatch(/immediate = true,/)
    expect(src).not.toMatch(/immediate = false/)
  })

  it("no caller outside the push-test diagnostic opts out of priority 10", () => {
    const offenders = [join(REPO_ROOT, "apps"), join(REPO_ROOT, "packages")]
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !file.endsWith(DIAGNOSTIC_ROUTE))
      .filter((file) => /immediate\s*:\s*false/.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file))
    expect(offenders).toEqual([])
  })
})
