/**
 * Pure decisions for the Better Auth request guard (lib/auth.ts `hooks.before`).
 *
 * The guard only judges HTTP calls to /api/auth/*. Server-side `auth.api.*`
 * calls made by our own code (solicitud approval, Equipo Cuik, cajeros/actions)
 * carry no `request` and are never judged here: they enforce their own rules.
 */

/** Header the register page sends with the invitation id from the invite link. */
export const INVITATION_HEADER = "x-cuik-invitation-id"

/**
 * Organization endpoints a signed-in non-super-admin may call over HTTP.
 * Everything else under /organization/* is denied: team changes go through
 * the server actions in app/(dashboard)/panel/cajeros/actions.ts.
 * - accept/reject-invitation: Better Auth itself checks the invitee's email.
 * - set-active: only works on organizations the user belongs to (TenantProvider).
 */
export const ORGANIZATION_PATHS_FOR_MEMBERS: ReadonlySet<string> = new Set([
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/set-active",
])

export const SIGN_UP_PATH = "/sign-up/email"

export type GuardDecision =
  | { allow: true }
  | { allow: false; status: "FORBIDDEN"; code: string; message: string }

const ALLOW: GuardDecision = { allow: true }

function deny(code: string, message: string): GuardDecision {
  return { allow: false, status: "FORBIDDEN", code, message }
}

/** Does this organization path need the caller's session to be judged? */
export function needsRoleForOrganizationPath(path: string): boolean {
  return path.startsWith("/organization/") && !ORGANIZATION_PATHS_FOR_MEMBERS.has(path)
}

/** HTTP call to an /organization/* endpoint by a user with global `role`. */
export function decideOrganizationRequest(
  path: string,
  role: string | null | undefined,
): GuardDecision {
  if (!path.startsWith("/organization/")) return ALLOW
  if (ORGANIZATION_PATHS_FOR_MEMBERS.has(path)) return ALLOW
  if (role === "super_admin") return ALLOW
  return deny("ORGANIZATION_ENDPOINT_FORBIDDEN", "Esta acción se hace desde el panel de Cuik.")
}

export interface SignUpInvitation {
  id: string
  email: string
  status: string
  expiresAt: Date
}

/**
 * Public sign-up only for someone holding a pending, unexpired invitation
 * addressed to the same email. Holding the id proves access to that inbox.
 */
export function decideSignUp(input: {
  email: unknown
  invitationId: string | null | undefined
  invitation: SignUpInvitation | null
  now: Date
}): GuardDecision {
  const { email, invitationId, invitation, now } = input
  if (!invitationId || !invitation || invitation.id !== invitationId) {
    return deny(
      "INVITATION_REQUIRED",
      "Solo puedes crear una cuenta desde el enlace de una invitación.",
    )
  }
  if (invitation.status !== "pending" || invitation.expiresAt.getTime() <= now.getTime()) {
    return deny(
      "INVITATION_NOT_VALID",
      "La invitación ya no es válida. Pide que te la envíen de nuevo.",
    )
  }
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : ""
  if (!normalized || normalized !== invitation.email.trim().toLowerCase()) {
    return deny("INVITATION_EMAIL_MISMATCH", "Usa el mismo correo al que te llegó la invitación.")
  }
  return ALLOW
}

/** Users created by an HTTP sign-up passed decideSignUp: their inbox is proven. */
export function isInvitedHttpSignUp(ctx: { path?: string; request?: unknown } | null): boolean {
  return Boolean(ctx?.request) && ctx?.path === SIGN_UP_PATH
}

/** Better Auth org updates may never change the slug (it links org ↔ tenant). */
export function updatesOrganizationSlug(data: Record<string, unknown> | null | undefined): boolean {
  return Boolean(data && Object.hasOwn(data, "slug") && data.slug !== undefined)
}
