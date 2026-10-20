import { headers } from "next/headers"
import { adminAccessOf } from "@/lib/api-utils"
import { auth } from "@/lib/auth"
import { type AdminAccess, canAccess, type StaffPermission } from "@/lib/staff-permissions"

/**
 * Server-side access checks for super-admin server actions and server
 * components (they cannot rely on the middleware, which only gates paths).
 */

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

export async function currentAdminAccess(): Promise<{
  session: AuthSession | null
  access: AdminAccess
}> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { session: null, access: { kind: "none" } }
  return { session, access: await adminAccessOf(session) }
}

/**
 * Server-action guard: super_admin always passes; staff only with one of
 * `permission`; no permission = super_admin only. Errors are Spanish copy
 * for the action result.
 */
export async function requireSuperAdminOrAction(
  permission?: StaffPermission | readonly StaffPermission[],
): Promise<
  | { session: AuthSession; access: AdminAccess; error: null }
  | { session: null; access: AdminAccess; error: string }
> {
  const { session, access } = await currentAdminAccess()
  if (!session) return { session: null, access, error: "No autenticado" }
  if (canAccess(access, permission ?? null)) return { session, access, error: null }
  return {
    session: null,
    access,
    error:
      access.kind === "staff"
        ? "No tienes permiso para esta acción"
        : "No autorizado — se requiere super_admin",
  }
}
