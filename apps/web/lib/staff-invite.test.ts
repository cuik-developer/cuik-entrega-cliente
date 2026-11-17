import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { STAFF_INVITE_DAYS, staffInviteIdentifier, staffInviteLink } from "./staff-invite"

// The Equipo Cuik invitation writes a Better Auth reset token itself. If a
// Better Auth upgrade renames the key or the route, invitations would stop
// working silently: this reads the installed library to catch it.
const passwordRoutes = readFileSync(
  join(__dirname, "..", "node_modules", "better-auth", "dist", "api", "routes", "password.mjs"),
  "utf8",
)

describe("Equipo Cuik invitation token", () => {
  it("uses the key Better Auth's reset endpoints read", () => {
    expect(staffInviteIdentifier("abc")).toBe("reset-password:abc")
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text of Better Auth
    expect(passwordRoutes).toContain("findVerificationValue(`reset-password:${token}`)")
    expect(passwordRoutes).toContain('"/reset-password/:token"')
    // The POST that sets the password consumes the same key (single use).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text of Better Auth
    expect(passwordRoutes).toContain("const id = `reset-password:${token}`")
    expect(passwordRoutes).toContain("consumeVerificationValue(id)")
  })

  it("links to Better Auth's check, which then opens our page", () => {
    expect(staffInviteLink("https://cuik.org", "tok")).toBe(
      "https://cuik.org/api/auth/reset-password/tok?callbackURL=%2Freset-password",
    )
  })

  it("lasts a week", () => {
    expect(STAFF_INVITE_DAYS).toBe(7)
  })
})
