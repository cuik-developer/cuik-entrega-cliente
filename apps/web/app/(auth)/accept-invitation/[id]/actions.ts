"use server"

import { db, eq, invitation, organization, tenants, user } from "@cuik/db"
import { type TenantBranding, tenantBrandingSchema } from "@cuik/shared/validators"

export interface InvitationInfo {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: Date
  organizationName: string
  inviterName: string
  branding: TenantBranding | null
}

export type InvitationResult =
  | { success: true; data: InvitationInfo }
  | { success: false; error: "not-found" | "expired" | "already-accepted" }

export async function getInvitationInfo(invitationId: string): Promise<InvitationResult> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: organization.name,
      inviterName: user.name,
      tenantBranding: tenants.branding,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .leftJoin(tenants, eq(organization.slug, tenants.slug))
    .where(eq(invitation.id, invitationId))
    .limit(1)

  if (rows.length === 0) {
    return { success: false, error: "not-found" }
  }

  const inv = rows[0]

  if (inv.status === "accepted") {
    return { success: false, error: "already-accepted" }
  }

  if (inv.status === "canceled" || inv.status === "rejected") {
    return { success: false, error: "not-found" }
  }

  if (new Date(inv.expiresAt) < new Date()) {
    return { success: false, error: "expired" }
  }

  // Parse branding JSONB — fallback to null if invalid or missing
  const brandingResult = tenantBrandingSchema.safeParse(inv.tenantBranding)
  const branding: TenantBranding | null = brandingResult.success ? brandingResult.data : null

  return {
    success: true,
    data: {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      organizationName: inv.organizationName,
      inviterName: inv.inviterName,
      branding,
    },
  }
}
