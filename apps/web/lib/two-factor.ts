/**
 * Verificación en dos pasos (app autenticadora, TOTP) for the Cuik team.
 * Pure module: safe on client and server.
 *
 * Mandatory for super_admin and Equipo Cuik staff; merchants are untouched.
 * Owner's decision, 7 Nov 2026: authenticator app (Google Authenticator or
 * similar) with backup codes, no email codes.
 */

/** Where a signed-in team member without 2FA is sent to turn it on. */
export const TWO_FACTOR_SETUP_PATH = "/dos-pasos/activar"
/** Second step of the login, reached after the password was accepted. */
export const TWO_FACTOR_VERIFY_PATH = "/login/verificar"
/** Days a device stays trusted after "confiar en este dispositivo". */
export const TWO_FACTOR_TRUST_DAYS = 30

export function requiresTwoFactor(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "staff"
}

/** True when this user must turn on 2FA before using the super-admin. */
export function twoFactorPending(user: {
  role?: string | null
  twoFactorEnabled?: boolean | null
}): boolean {
  return requiresTwoFactor(user.role) && !user.twoFactorEnabled
}

export const TWO_FACTOR_PENDING_ERROR =
  "Activa la verificación en dos pasos para usar el super-admin."
