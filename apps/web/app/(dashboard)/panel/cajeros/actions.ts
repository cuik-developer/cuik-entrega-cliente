"use server"

import { account, and, count, db, eq, inArray, member, sql, user, visits } from "@cuik/db"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type CajeroStatsMap = Record<
  string,
  {
    visitCount: number
    lastAccess: Date | null
  }
>

// ── Auth helper ─────────────────────────────────────────────────────

async function requireDashboardAuth() {
  const headersList = await headers()
  const currentSession = await auth.api.getSession({ headers: headersList })

  if (!currentSession) {
    return { session: null, error: "No autenticado" } as const
  }

  return { session: currentSession, error: null } as const
}

// ── Actions ─────────────────────────────────────────────────────────

export async function getCajeroStats({
  tenantId,
  organizationId,
}: {
  tenantId: string
  organizationId: string
}): Promise<ActionResult<CajeroStatsMap>> {
  const { error } = await requireDashboardAuth()
  if (error) return { success: false, error }

  try {
    // Query 1: Visit counts per registered_by user
    const visitRows = await db
      .select({
        userId: visits.registeredBy,
        visitCount: count(),
      })
      .from(visits)
      .where(eq(visits.tenantId, tenantId))
      .groupBy(visits.registeredBy)

    // Query 2: Get member user IDs for this organization
    const memberRows = await db
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, organizationId))

    const memberUserIds = memberRows.map((r) => r.userId)

    // Query 3: Last access per member from user.updated_at
    // Better Auth deletes sessions on signOut, so session table is unreliable
    // for tracking "last access". user.updated_at is updated on every auth
    // interaction (login, session refresh) and persists after signOut.
    const accessRows =
      memberUserIds.length > 0
        ? await db
            .select({
              userId: user.id,
              lastAccess: user.updatedAt,
            })
            .from(user)
            .where(inArray(user.id, memberUserIds))
        : []

    // Merge into a single map
    const statsMap: CajeroStatsMap = {}

    for (const row of visitRows) {
      if (row.userId) {
        statsMap[row.userId] = {
          visitCount: row.visitCount,
          lastAccess: null,
        }
      }
    }

    for (const row of accessRows) {
      if (row.userId) {
        if (statsMap[row.userId]) {
          statsMap[row.userId].lastAccess = row.lastAccess ? new Date(row.lastAccess) : null
        } else {
          statsMap[row.userId] = {
            visitCount: 0,
            lastAccess: row.lastAccess ? new Date(row.lastAccess) : null,
          }
        }
      }
    }

    return { success: true, data: statsMap }
  } catch (err) {
    console.error("[getCajeroStats]", err)
    return { success: false, error: "Error al obtener estadísticas de cajeros" }
  }
}

// ── Reset password ──────────────────────────────────────────────────

export async function resetCajeroPassword({
  userId,
  organizationId,
}: {
  userId: string
  organizationId: string
}): Promise<ActionResult<{ tempPassword: string }>> {
  const { session: currentSession, error } = await requireDashboardAuth()
  if (error || !currentSession) return { success: false, error: error ?? "No autenticado" }

  try {
    // Verify the target user is a member of the same organization
    const [targetMember] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(sql`${member.organizationId} = ${organizationId} AND ${member.userId} = ${userId}`)
      .limit(1)

    if (!targetMember) {
      return { success: false, error: "El usuario no pertenece a esta organización" }
    }

    if (targetMember.role === "owner") {
      return {
        success: false,
        error: "No se puede resetear la contraseña del propietario desde aquí",
      }
    }

    // Generate temp password
    const tempPassword = `cuik-${crypto.randomUUID().slice(0, 8)}`

    // Hash and update
    const { hashPassword } = await import("better-auth/crypto")
    const hashedPassword = await hashPassword(tempPassword)

    const _updated = await db
      .update(account)
      .set({ password: hashedPassword })
      .where(eq(account.userId, userId))

    return { success: true, data: { tempPassword } }
  } catch (err) {
    console.error("[resetCajeroPassword]", err)
    return { success: false, error: "Error al resetear contraseña" }
  }
}

// ── Toggle cajero ban status ─────────────────────────────────────────

export async function toggleCajeroBan({
  userId,
  organizationId,
  ban,
}: {
  userId: string
  organizationId: string
  ban: boolean
}): Promise<ActionResult<{ banned: boolean }>> {
  const { session: currentSession, error } = await requireDashboardAuth()
  if (error || !currentSession) return { success: false, error: error ?? "No autenticado" }

  try {
    // Verify target is member of org and not owner
    const [targetMember] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1)

    if (!targetMember) {
      return { success: false, error: "El usuario no pertenece a esta organización" }
    }

    if (targetMember.role === "owner") {
      return { success: false, error: "No se puede desactivar al propietario" }
    }

    await db
      .update(user)
      .set({ banned: ban, banReason: ban ? "Desactivado por admin" : null })
      .where(eq(user.id, userId))

    return { success: true, data: { banned: ban } }
  } catch (err) {
    console.error("[toggleCajeroBan]", err)
    return { success: false, error: `Error al ${ban ? "desactivar" : "activar"} cajero` }
  }
}

// ── Update cajero name ──────────────────────────────────────────────

export async function updateCajeroName({
  userId,
  organizationId,
  name,
}: {
  userId: string
  organizationId: string
  name: string
}): Promise<ActionResult<{ name: string }>> {
  const { session: currentSession, error } = await requireDashboardAuth()
  if (error || !currentSession) return { success: false, error: error ?? "No autenticado" }

  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length < 2) {
    return { success: false, error: "El nombre debe tener al menos 2 caracteres" }
  }

  try {
    // Verify target is member of org
    const [targetMember] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1)

    if (!targetMember) {
      return { success: false, error: "El usuario no pertenece a esta organización" }
    }

    await db.update(user).set({ name: trimmedName }).where(eq(user.id, userId))

    return { success: true, data: { name: trimmedName } }
  } catch (err) {
    console.error("[updateCajeroName]", err)
    return { success: false, error: "Error al actualizar nombre" }
  }
}
