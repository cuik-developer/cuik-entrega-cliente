"use server"

import {
  account,
  and,
  count,
  db,
  eq,
  gt,
  inArray,
  invitation,
  member,
  ne,
  organization,
  session,
  sql,
  tenants,
  user,
  visits,
} from "@cuik/db"
import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { saViewTenantFromCookieHeader } from "@/lib/sa-view"
import {
  getMemberRole,
  isTenantAdmin,
  listTeam,
  syncGlobalRole,
  type TenantRole,
} from "@/lib/tenant-roles"

/**
 * Team management of a merchant ("Equipo"). Every action checks the caller's
 * role INSIDE this organization (owner / admin), never the global user.role:
 * - owner: everything, incl. inviting/removing admins and transferring ownership.
 * - admin: cashiers only (invite, remove, reset password, ban, rename).
 *
 * Inputs are validated with zod: server actions are reachable with arbitrary
 * JSON, TypeScript unions are not a guard.
 */

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type CajeroStatsMap = Record<
  string,
  {
    visitCount: number
    lastAccess: Date | null
  }
>

export type TeamMember = Awaited<ReturnType<typeof listTeam>>[number]

const id = z.string().min(1).max(128)
const orgInput = z.object({ organizationId: id })
const targetInput = z.object({ organizationId: id, userId: id })
const roleInput = z.enum(["admin", "member"])

// ── Auth helpers ────────────────────────────────────────────────────

async function requireDashboardAuth() {
  const headersList = await headers()
  const currentSession = await auth.api.getSession({ headers: headersList })

  if (!currentSession) {
    return { session: null, error: "No autenticado", headers: headersList } as const
  }

  return { session: currentSession, error: null, headers: headersList } as const
}

/** The caller must be owner or admin of `organizationId`. */
async function requireTeamManager(organizationId: string) {
  const ctx = await requireDashboardAuth()
  if (ctx.error || !ctx.session) {
    return { ...ctx, role: null, error: ctx.error ?? "No autenticado" } as const
  }
  const role = await getMemberRole(ctx.session.user.id, organizationId)
  if (!isTenantAdmin(role)) {
    return { ...ctx, role, error: "No tienes permiso para administrar el equipo" } as const
  }
  return { ...ctx, role: role as TenantRole, error: null } as const
}

/**
 * Like requireTeamManager, but also lets the read-only super-admin view of
 * this tenant list the team (the middleware blocks server actions that write
 * while that view is active).
 */
async function requireTeamViewer(organizationId: string) {
  const ctx = await requireTeamManager(organizationId)
  if (!ctx.error || !ctx.session || ctx.session.user.role !== "super_admin") return ctx
  const viewed = saViewTenantFromCookieHeader(ctx.headers.get("cookie"))
  const tenant = viewed ? await tenantOfOrg(organizationId) : null
  if (tenant && tenant.id === viewed) {
    return { ...ctx, role: "admin" as TenantRole, error: null } as const
  }
  return ctx
}

async function targetMember(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .orderBy(sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`)
    .limit(1)
  return row ?? null
}

/** What `callerRole` may do to a member with `targetRole`. */
function canManage(callerRole: TenantRole, targetRole: string): boolean {
  if (targetRole === "owner") return false
  if (targetRole === "admin") return callerRole === "owner"
  return true
}

/** The tenant linked to this organization (by slug). */
async function tenantOfOrg(organizationId: string) {
  const [row] = await db
    .select({ id: tenants.id, ownerId: tenants.ownerId })
    .from(organization)
    .innerJoin(tenants, eq(tenants.slug, organization.slug))
    .where(eq(organization.id, organizationId))
    .limit(1)
  return row ?? null
}

/**
 * Password, ban and name live on the global user. They may only be touched
 * by this team when the user belongs to no other merchant and owns none:
 * otherwise an admin here could take over or lock out an account that is
 * also the owner/admin somewhere else.
 */
async function belongsOnlyHere(userId: string, organizationId: string): Promise<boolean> {
  const [other] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), ne(member.organizationId, organizationId)))
    .limit(1)
  if (other) return false
  const [owned] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.ownerId, userId))
    .limit(1)
  return !owned
}

const SHARED_ACCOUNT_MSG =
  "Esta persona también pertenece a otro comercio; su contraseña, acceso y nombre se gestionan allí."

/** Better Auth error codes → what the user should read. */
function betterAuthMessage(err: unknown, fallback: string): string {
  const code = (err as { body?: { code?: string } } | null)?.body?.code ?? ""
  if (code.includes("ALREADY_A_MEMBER")) return "Esa persona ya forma parte del equipo"
  if (code.includes("ALREADY_INVITED")) return "Ya hay una invitación pendiente para ese correo"
  if (code.includes("INVITATION_LIMIT"))
    return "Demasiadas invitaciones pendientes; cancela algunas"
  if (code.includes("INVALID_EMAIL")) return "El correo no es válido"
  if (code.includes("NOT_ALLOWED")) return "No tienes permiso para esta acción"
  return fallback
}

// ── Team listing ────────────────────────────────────────────────────

export async function getTeam(organizationIdRaw: string): Promise<
  ActionResult<{
    members: TeamMember[]
    invitations: {
      id: string
      email: string
      role: string | null
      status: string
      expiresAt: Date
    }[]
    viewerRole: TenantRole
  }>
> {
  const parsed = orgInput.safeParse({ organizationId: organizationIdRaw })
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId } = parsed.data
  const ctx = await requireTeamViewer(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }
  try {
    const [members, invitations] = await Promise.all([
      listTeam(organizationId),
      db
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, organizationId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, new Date()),
          ),
        ),
    ])
    return { success: true, data: { members, invitations, viewerRole: ctx.role } }
  } catch (err) {
    console.error("[getTeam]", err)
    return { success: false, error: "Error al cargar el equipo" }
  }
}

// ── Invitations ─────────────────────────────────────────────────────

const inviteInput = z.object({
  organizationId: id,
  email: z.string().trim().toLowerCase().email().max(254),
  role: roleInput,
  resend: z.boolean().optional(),
})

export async function inviteTeamMember(
  raw: z.input<typeof inviteInput>,
): Promise<ActionResult<{ email: string }>> {
  const parsed = inviteInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: "Revisa el correo y el rol" }
  const { organizationId, email, role, resend } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }
  if (role === "admin" && ctx.role !== "owner") {
    return { success: false, error: "Solo el dueño puede invitar administradores" }
  }
  try {
    const res = await auth.api.createInvitation({
      body: { email, role, organizationId, resend: resend ?? false },
      headers: ctx.headers,
    })
    return { success: true, data: { email: res.email } }
  } catch (err) {
    console.error("[inviteTeamMember]", err)
    return { success: false, error: betterAuthMessage(err, "Error al enviar la invitación") }
  }
}

export async function cancelTeamInvitation(raw: {
  organizationId: string
  invitationId: string
}): Promise<ActionResult<null>> {
  const parsed = z.object({ organizationId: id, invitationId: id }).safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, invitationId } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }
  try {
    const [inv] = await db
      .select({ role: invitation.role, organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .limit(1)
    if (!inv || inv.organizationId !== organizationId) {
      return { success: false, error: "Invitación no encontrada" }
    }
    if (inv.role === "admin" && ctx.role !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede cancelar invitaciones de administradores",
      }
    }
    await auth.api.cancelInvitation({ body: { invitationId }, headers: ctx.headers })
    return { success: true, data: null }
  } catch (err) {
    console.error("[cancelTeamInvitation]", err)
    return { success: false, error: betterAuthMessage(err, "Error al cancelar la invitación") }
  }
}

/**
 * Called by the invitee right after accepting: derive their global role.
 * Only memberships of organizations linked to a tenant count (see
 * `syncGlobalRole`), so a self-created organization grants nothing.
 */
export async function syncMyRole(): Promise<ActionResult<{ role: string }>> {
  const ctx = await requireDashboardAuth()
  if (ctx.error || !ctx.session) return { success: false, error: ctx.error ?? "No autenticado" }
  const role = await syncGlobalRole(ctx.session.user.id)
  return { success: true, data: { role } }
}

// ── Membership changes ──────────────────────────────────────────────

export async function removeTeamMember(raw: {
  organizationId: string
  userId: string
}): Promise<ActionResult<null>> {
  const parsed = targetInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, userId } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error || !ctx.session) return { success: false, error: ctx.error ?? "No autenticado" }
  if (userId === ctx.session.user.id) {
    return { success: false, error: "No puedes quitarte a ti mismo del equipo" }
  }
  const target = await targetMember(organizationId, userId)
  if (!target) return { success: false, error: "El usuario no pertenece a este comercio" }
  if (!canManage(ctx.role, target.role)) {
    return { success: false, error: "No tienes permiso para quitar a este miembro" }
  }
  // Legacy data: the tenant owner may be stored with another member role.
  const tenant = await tenantOfOrg(organizationId)
  if (tenant?.ownerId === userId) {
    return {
      success: false,
      error: "Esta persona es el dueño del comercio; transfiere la propiedad primero",
    }
  }
  try {
    await db
      .delete(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    // Better Auth keeps the active organization on the session: clear it.
    await db
      .update(session)
      .set({ activeOrganizationId: null })
      .where(and(eq(session.userId, userId), eq(session.activeOrganizationId, organizationId)))
    await syncGlobalRole(userId)
    return { success: true, data: null }
  } catch (err) {
    console.error("[removeTeamMember]", err)
    return { success: false, error: "Error al quitar al miembro" }
  }
}

/** Owner only: promote a cashier to admin or demote an admin to cashier. */
export async function changeTeamRole(raw: {
  organizationId: string
  userId: string
  role: "admin" | "member"
}): Promise<ActionResult<{ role: TenantRole }>> {
  const parsed = targetInput.extend({ role: roleInput }).safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, userId, role } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error || !ctx.session) return { success: false, error: ctx.error ?? "No autenticado" }
  if (ctx.role !== "owner") return { success: false, error: "Solo el dueño puede cambiar roles" }
  if (userId === ctx.session.user.id) {
    return { success: false, error: "El dueño no cambia su propio rol" }
  }
  const target = await targetMember(organizationId, userId)
  if (!target) return { success: false, error: "El usuario no pertenece a este comercio" }
  if (target.role === "owner") return { success: false, error: "El dueño no se puede cambiar aquí" }
  const tenant = await tenantOfOrg(organizationId)
  if (tenant?.ownerId === userId) {
    return {
      success: false,
      error: "Esta persona es el dueño del comercio; transfiere la propiedad primero",
    }
  }
  try {
    await db
      .update(member)
      .set({ role })
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    await syncGlobalRole(userId)
    return { success: true, data: { role } }
  } catch (err) {
    console.error("[changeTeamRole]", err)
    return { success: false, error: "Error al cambiar el rol" }
  }
}

/** Owner only: hand the tenant over to an admin; the previous owner stays as admin. */
export async function transferOwnership(raw: {
  organizationId: string
  userId: string
}): Promise<ActionResult<null>> {
  const parsed = targetInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, userId } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error || !ctx.session) return { success: false, error: ctx.error ?? "No autenticado" }
  if (ctx.role !== "owner") {
    return { success: false, error: "Solo el dueño puede transferir la propiedad" }
  }
  const meId = ctx.session.user.id
  if (userId === meId) return { success: false, error: "Ya eres el dueño" }
  const target = await targetMember(organizationId, userId)
  if (!target || target.role !== "admin") {
    return { success: false, error: "Elige un administrador del comercio" }
  }
  try {
    // Conditional updates: a concurrent transfer leaves exactly one owner or aborts.
    await db.transaction(async (tx) => {
      const promoted = await tx
        .update(member)
        .set({ role: "owner" })
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, userId),
            eq(member.role, "admin"),
          ),
        )
        .returning({ id: member.id })
      const demoted = await tx
        .update(member)
        .set({ role: "admin" })
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, meId),
            eq(member.role, "owner"),
          ),
        )
        .returning({ id: member.id })
      if (promoted.length !== 1 || demoted.length !== 1) {
        throw new Error("ownership changed concurrently")
      }
      // tenants.ownerId follows the organization owner (linked by slug).
      const t = await tx.execute(
        sql`UPDATE tenants SET owner_id = ${userId}
            WHERE slug = (SELECT slug FROM organization WHERE id = ${organizationId})`,
      )
      if (Number(t.rowCount ?? 0) !== 1) throw new Error("tenant not linked to organization")
    })
    await Promise.all([syncGlobalRole(userId), syncGlobalRole(meId)])
    return { success: true, data: null }
  } catch (err) {
    console.error("[transferOwnership]", err)
    return {
      success: false,
      error: "No se pudo transferir la propiedad; recarga e intenta de nuevo",
    }
  }
}

// ── Stats ───────────────────────────────────────────────────────────

export async function getCajeroStats(raw: {
  tenantId: string
  organizationId: string
}): Promise<ActionResult<CajeroStatsMap>> {
  const parsed = z.object({ tenantId: id, organizationId: id }).safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { tenantId, organizationId } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }
  // The tenant must be the one linked to this organization.
  const tenant = await tenantOfOrg(organizationId)
  if (!tenant || tenant.id !== tenantId) {
    return { success: false, error: "El comercio no coincide con el equipo" }
  }

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

    const memberUserIds = memberRows.map((m) => m.userId)

    // Query 3: last access from user.updated_at. Better Auth deletes sessions on
    // sign-out, so the session table is unreliable; updated_at is touched on
    // every auth interaction and survives sign-out.
    const accessRows =
      memberUserIds.length > 0
        ? await db
            .select({ userId: user.id, lastAccess: user.updatedAt })
            .from(user)
            .where(inArray(user.id, memberUserIds))
        : []
    const accessMap = new Map(accessRows.map((r) => [r.userId, r.lastAccess]))

    const visitMap = new Map(visitRows.map((r) => [r.userId, Number(r.visitCount)]))
    const out: CajeroStatsMap = {}
    for (const uid of memberUserIds) {
      const last = accessMap.get(uid)
      out[uid] = { visitCount: visitMap.get(uid) ?? 0, lastAccess: last ? new Date(last) : null }
    }
    return { success: true, data: out }
  } catch (err) {
    console.error("[getCajeroStats]", err)
    return { success: false, error: "Error al cargar estadísticas" }
  }
}

// ── Reset password ──────────────────────────────────────────────────

export async function resetCajeroPassword(raw: {
  userId: string
  organizationId: string
}): Promise<ActionResult<{ tempPassword: string }>> {
  const parsed = targetInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, userId } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }

  try {
    const target = await targetMember(organizationId, userId)
    if (!target) return { success: false, error: "El usuario no pertenece a este comercio" }
    if (!canManage(ctx.role, target.role)) {
      return { success: false, error: "No tienes permiso para resetear esta contraseña" }
    }
    if (!(await belongsOnlyHere(userId, organizationId))) {
      return { success: false, error: SHARED_ACCOUNT_MSG }
    }

    // Generate temp password
    const tempPassword = `cuik-${crypto.randomUUID().slice(0, 8)}`

    // Hash and update
    const { hashPassword } = await import("better-auth/crypto")
    const hashedPassword = await hashPassword(tempPassword)

    await db.update(account).set({ password: hashedPassword }).where(eq(account.userId, userId))
    // The old password must stop working everywhere.
    await db.delete(session).where(eq(session.userId, userId))

    return { success: true, data: { tempPassword } }
  } catch (err) {
    console.error("[resetCajeroPassword]", err)
    return { success: false, error: "Error al resetear contraseña" }
  }
}

// ── Toggle ban status ───────────────────────────────────────────────

export async function toggleCajeroBan(raw: {
  userId: string
  organizationId: string
  ban: boolean
}): Promise<ActionResult<{ banned: boolean }>> {
  const parsed = targetInput.extend({ ban: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }
  const { organizationId, userId, ban } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error || !ctx.session) return { success: false, error: ctx.error ?? "No autenticado" }
  if (userId === ctx.session.user.id) {
    return { success: false, error: "No puedes desactivarte a ti mismo" }
  }

  try {
    const target = await targetMember(organizationId, userId)
    if (!target) return { success: false, error: "El usuario no pertenece a este comercio" }
    if (!canManage(ctx.role, target.role)) {
      return { success: false, error: "No tienes permiso para desactivar a este miembro" }
    }
    if (!(await belongsOnlyHere(userId, organizationId))) {
      return { success: false, error: SHARED_ACCOUNT_MSG }
    }

    await db
      .update(user)
      .set({ banned: ban, banReason: ban ? "Desactivado por admin" : null })
      .where(eq(user.id, userId))
    // Better Auth only checks `banned` at sign-in: close the open sessions too.
    if (ban) await db.delete(session).where(eq(session.userId, userId))

    return { success: true, data: { banned: ban } }
  } catch (err) {
    console.error("[toggleCajeroBan]", err)
    return { success: false, error: `Error al ${ban ? "desactivar" : "activar"}` }
  }
}

// ── Update name ─────────────────────────────────────────────────────

export async function updateCajeroName(raw: {
  userId: string
  organizationId: string
  name: string
}): Promise<ActionResult<{ name: string }>> {
  const parsed = targetInput.extend({ name: z.string().trim().min(2).max(80) }).safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: "El nombre debe tener entre 2 y 80 caracteres" }
  }
  const { organizationId, userId, name } = parsed.data
  const ctx = await requireTeamManager(organizationId)
  if (ctx.error) return { success: false, error: ctx.error }

  try {
    const target = await targetMember(organizationId, userId)
    if (!target) return { success: false, error: "El usuario no pertenece a este comercio" }
    if (!canManage(ctx.role, target.role)) {
      return { success: false, error: "No tienes permiso para editar a este miembro" }
    }
    if (!(await belongsOnlyHere(userId, organizationId))) {
      return { success: false, error: SHARED_ACCOUNT_MSG }
    }

    await db.update(user).set({ name }).where(eq(user.id, userId))

    return { success: true, data: { name } }
  } catch (err) {
    console.error("[updateCajeroName]", err)
    return { success: false, error: "Error al actualizar nombre" }
  }
}
