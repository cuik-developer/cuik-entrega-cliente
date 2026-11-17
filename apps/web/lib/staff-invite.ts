/** How long an Equipo Cuik invitation works (Better Auth's own reset link lasts 1 hour). */
export const STAFF_INVITE_DAYS = 7

/**
 * Key of the invitation row in `verification`: the same one Better Auth's
 * password reset writes and reads (`reset-password:<token>`, value = user id),
 * so its reset endpoints check and consume our longer-lived token as usual.
 * staff-invite.test.ts fails if a Better Auth upgrade changes that key.
 */
export function staffInviteIdentifier(token: string): string {
  return `reset-password:${token}`
}

/** Better Auth's reset entry point: checks the token, then opens /reset-password?token=… */
export function staffInviteLink(baseUrl: string, token: string): string {
  return `${baseUrl}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/reset-password")}`
}
