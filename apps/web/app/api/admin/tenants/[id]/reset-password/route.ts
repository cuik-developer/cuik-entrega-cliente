import { account, db, eq, tenants } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params

    // Get tenant owner
    const [tenant] = await db
      .select({ ownerId: tenants.ownerId, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)

    if (!tenant?.ownerId) {
      return errorResponse("Tenant or owner not found", 404)
    }

    // Generate temp password
    const tempPassword = `cuik-${crypto.randomUUID().slice(0, 8)}`

    // Hash password using the same method as Better Auth (bcrypt via Web Crypto)
    const { hashPassword } = await import("better-auth/crypto")
    const hashedPassword = await hashPassword(tempPassword)

    // Update password directly in the account table
    await db
      .update(account)
      .set({ password: hashedPassword })
      .where(eq(account.userId, tenant.ownerId))

    console.log(
      `[reset-password] Password reset for tenant ${tenant.name} (owner: ${tenant.ownerId})`,
    )

    return successResponse({ tempPassword })
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/reset-password]", error)
    return errorResponse("Failed to reset password", 500)
  }
}
