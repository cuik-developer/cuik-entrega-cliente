import { describe, expect, it } from "vitest"
import {
  decideOrganizationRequest,
  decideSignUp,
  isInvitedHttpSignUp,
  needsRoleForOrganizationPath,
  type SignUpInvitation,
  updatesOrganizationSlug,
} from "./auth-guards"

const now = new Date("2026-10-19T12:00:00Z")
const pending: SignUpInvitation = {
  id: "inv_1",
  email: "cajero@cafe.pe",
  status: "pending",
  expiresAt: new Date("2026-10-21T12:00:00Z"),
}

function code(decision: ReturnType<typeof decideSignUp>) {
  return decision.allow ? "ALLOW" : decision.code
}

describe("decideOrganizationRequest", () => {
  const blocked = [
    "/organization/create",
    "/organization/update",
    "/organization/delete",
    "/organization/invite-member",
    "/organization/update-member-role",
    "/organization/remove-member",
    "/organization/cancel-invitation",
    "/organization/leave",
    "/organization/list-user-invitations",
    "/organization/get-invitation",
    "/organization/list-invitations",
    "/organization/list-members",
    "/organization/get-full-organization",
    "/organization/check-slug",
  ]

  it.each(blocked)("denies %s to merchants, cashiers, staff and anonymous", (path) => {
    for (const role of ["admin", "user", "staff", null, undefined]) {
      const d = decideOrganizationRequest(path, role)
      expect(d.allow).toBe(false)
      if (!d.allow) expect(d.code).toBe("ORGANIZATION_ENDPOINT_FORBIDDEN")
    }
  })

  it.each(blocked)("lets a super_admin call %s", (path) => {
    expect(decideOrganizationRequest(path, "super_admin").allow).toBe(true)
  })

  it.each([
    "/organization/accept-invitation",
    "/organization/reject-invitation",
    "/organization/set-active",
  ])("lets any role call %s (Better Auth checks the invitee / membership)", (path) => {
    expect(decideOrganizationRequest(path, "user").allow).toBe(true)
    expect(needsRoleForOrganizationPath(path)).toBe(false)
  })

  it("ignores paths outside /organization/", () => {
    expect(decideOrganizationRequest("/get-session", "user").allow).toBe(true)
    expect(decideOrganizationRequest("/sign-in/email", null).allow).toBe(true)
    expect(needsRoleForOrganizationPath("/admin/list-users")).toBe(false)
    expect(needsRoleForOrganizationPath("/organization/update")).toBe(true)
  })
})

describe("decideSignUp", () => {
  it("allows the invited email with the invitation id (case and spaces ignored)", () => {
    expect(
      code(
        decideSignUp({
          email: " Cajero@Cafe.PE ",
          invitationId: "inv_1",
          invitation: pending,
          now,
        }),
      ),
    ).toBe("ALLOW")
  })

  it("requires an invitation id", () => {
    expect(
      code(decideSignUp({ email: pending.email, invitationId: null, invitation: null, now })),
    ).toBe("INVITATION_REQUIRED")
    expect(
      code(decideSignUp({ email: pending.email, invitationId: "", invitation: null, now })),
    ).toBe("INVITATION_REQUIRED")
  })

  it("rejects an unknown id or a lookup that returned another invitation", () => {
    expect(
      code(decideSignUp({ email: pending.email, invitationId: "x", invitation: null, now })),
    ).toBe("INVITATION_REQUIRED")
    expect(
      code(decideSignUp({ email: pending.email, invitationId: "inv_2", invitation: pending, now })),
    ).toBe("INVITATION_REQUIRED")
  })

  it("rejects accepted, canceled, rejected and expired invitations", () => {
    for (const status of ["accepted", "canceled", "rejected"]) {
      expect(
        code(
          decideSignUp({
            email: pending.email,
            invitationId: "inv_1",
            invitation: { ...pending, status },
            now,
          }),
        ),
      ).toBe("INVITATION_NOT_VALID")
    }
    expect(
      code(
        decideSignUp({
          email: pending.email,
          invitationId: "inv_1",
          invitation: { ...pending, expiresAt: now },
          now,
        }),
      ),
    ).toBe("INVITATION_NOT_VALID")
  })

  it("rejects a different email (no squatting another address with a valid id)", () => {
    expect(
      code(
        decideSignUp({ email: "otro@cafe.pe", invitationId: "inv_1", invitation: pending, now }),
      ),
    ).toBe("INVITATION_EMAIL_MISMATCH")
    expect(
      code(decideSignUp({ email: undefined, invitationId: "inv_1", invitation: pending, now })),
    ).toBe("INVITATION_EMAIL_MISMATCH")
  })
})

describe("isInvitedHttpSignUp", () => {
  it("only marks HTTP sign-ups (server-side signUpEmail calls carry no request)", () => {
    expect(isInvitedHttpSignUp({ path: "/sign-up/email", request: {} })).toBe(true)
    expect(isInvitedHttpSignUp({ path: "/sign-up/email" })).toBe(false)
    expect(isInvitedHttpSignUp({ path: "/sign-in/email", request: {} })).toBe(false)
    expect(isInvitedHttpSignUp(null)).toBe(false)
  })
})

describe("updatesOrganizationSlug", () => {
  it("flags any slug in the update payload", () => {
    expect(updatesOrganizationSlug({ slug: "otro" })).toBe(true)
    expect(updatesOrganizationSlug({ name: "Nuevo nombre" })).toBe(false)
    expect(updatesOrganizationSlug({ slug: undefined })).toBe(false)
    expect(updatesOrganizationSlug(null)).toBe(false)
  })
})
