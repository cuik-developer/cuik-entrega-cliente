import { errorResponse, requireAuth, requireRole } from "@/lib/api-utils"

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Session = NonNullable<Awaited<ReturnType<typeof requireAuth>>["session"]>

/** The owner's (super_admin) session, or the error response to return. Staff never pass. */
export async function requireSuperAdmin(
  request: Request,
): Promise<{ ok: true; session: Session } | { ok: false; error: Response }> {
  const { session, error } = await requireAuth(request)
  if (error || !session) return { ok: false, error: error ?? errorResponse("Unauthorized", 401) }
  const roleError = requireRole(session, "super_admin")
  if (roleError) return { ok: false, error: roleError }
  return { ok: true, session }
}

/** 400 with zod's flattened field errors (the panel shows the first one). */
export function badRequest(details: unknown) {
  return errorResponse("Validation failed", 400, details)
}
