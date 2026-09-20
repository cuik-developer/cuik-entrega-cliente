import { db, eq, tenantNotes, tenants } from "@cuik/db"
import { z } from "zod"

import { errorResponse, requireAuth, requireRole } from "@/lib/api-utils"
import { createSaViewToken, SA_VIEW_COOKIE, SA_VIEW_TTL_SECONDS } from "@/lib/sa-view"

const bodySchema = z.object({ tenantId: z.string().uuid() })

function cookieAttrs(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

/**
 * POST /api/admin/sa-view { tenantId } — start a read-only "view as tenant"
 * session (1 hour). Leaves an internal note on the tenant for audit.
 */
export async function POST(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, parsed.data.tenantId))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

    console.info(
      `[sa-view] ${session.user.email ?? session.user.id} opened tenant ${tenant.slug} read-only`,
    )
    await db
      .insert(tenantNotes)
      .values({
        tenantId: tenant.id,
        authorId: session.user.id,
        content: `Super-admin entró al panel del comercio en modo solo lectura.`,
      })
      .catch((err: unknown) => console.error("[sa-view] audit note failed:", err))

    const token = createSaViewToken(tenant.id)
    return new Response(JSON.stringify({ success: true, data: { tenant } }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `${SA_VIEW_COOKIE}=${encodeURIComponent(token)}; ${cookieAttrs(SA_VIEW_TTL_SECONDS)}`,
      },
    })
  } catch (error) {
    console.error("[POST /api/admin/sa-view]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** DELETE /api/admin/sa-view — leave the tenant view. */
export async function DELETE(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError
  return new Response(JSON.stringify({ success: true, data: { cleared: true } }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${SA_VIEW_COOKIE}=; ${cookieAttrs(0)}`,
    },
  })
}
