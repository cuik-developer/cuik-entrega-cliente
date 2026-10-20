"use server"

import { and, db, eq, or, session as sessionTable, sql, user } from "@cuik/db"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSuperAdminOrAction } from "@/lib/admin-access"
import { auth } from "@/lib/auth"
import {
  normalizeStaffPermissions,
  STAFF_PERMISSIONS,
  type StaffPermission,
} from "@/lib/staff-permissions"

/**
 * Equipo Cuik management (owner only): invite, change permissions, revoke.
 * Staff are ordinary Better Auth users with `role = "staff"` and their areas
 * in `staff_permissions`; revoking also bans them and kills their sessions.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/** ban_reason written on revoke; lets a later invite reactivate the same account. */
const REVOKED_REASON = "Acceso a Equipo Cuik revocado"

export type StaffMember = {
  id: string
  name: string
  email: string
  permissions: StaffPermission[]
  createdAt: Date
  revoked: boolean
}

const permissionsSchema = z
  .array(z.enum(STAFF_PERMISSIONS))
  .min(1, "Elige al menos un permiso")
  .max(STAFF_PERMISSIONS.length)

const inviteSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(100),
  email: z.string().trim().toLowerCase().email("Email inválido").max(254),
  permissions: permissionsSchema,
})

const userIdSchema = z.string().min(1).max(100)

const requireOwner = () => requireSuperAdminOrAction()

async function sendSetPasswordEmail(email: string): Promise<boolean> {
  try {
    // Better Auth's reset flow (lib/auth.ts sendResetPassword): the link lets
    // the new member choose their password at /reset-password.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })
    return true
  } catch (err) {
    console.error("[equipo] set-password email failed:", err)
    return false
  }
}

async function findStaffUser(userId: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row && row.role === "staff" ? row : null
}

export async function listStaff(): Promise<ActionResult<StaffMember[]>> {
  const { error } = await requireOwner()
  if (error) return { success: false, error }

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.staffPermissions,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(or(eq(user.role, "staff"), eq(user.banReason, REVOKED_REASON)))
    .orderBy(user.name)

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      permissions: normalizeStaffPermissions(r.permissions),
      createdAt: r.createdAt,
      revoked: r.role !== "staff",
    })),
  }
}

export async function inviteStaff(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ id: string; emailSent: boolean; reactivated: boolean }>> {
  const { error } = await requireOwner()
  if (error) return { success: false, error }

  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { name, email, permissions } = parsed.data

  const [existing] = await db
    .select({ id: user.id, role: user.role, banReason: user.banReason })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1)

  let userId: string
  let reactivated = false
  if (existing) {
    if (existing.role === "staff") {
      return { success: false, error: "Esa persona ya está en Equipo Cuik" }
    }
    // Only a member revoked from here comes back; any other account (merchant,
    // cashier, owner) is never turned into staff.
    if (existing.role !== "user" || existing.banReason !== REVOKED_REASON) {
      return {
        success: false,
        error: "Ya existe una cuenta de Cuik con ese email (comercio o cajero). Usa otro email.",
      }
    }
    await db
      .update(user)
      .set({
        name,
        role: "staff",
        staffPermissions: permissions,
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, existing.id), eq(user.banReason, REVOKED_REASON)))
    userId = existing.id
    reactivated = true
  } else {
    try {
      const res = await auth.api.signUpEmail({
        // Random password nobody knows: the member sets theirs from the email link.
        body: { email, name, password: `${crypto.randomUUID()}${crypto.randomUUID()}` },
      })
      if (!res?.user?.id) return { success: false, error: "No se pudo crear la cuenta" }
      userId = res.user.id
    } catch (err) {
      console.error("[equipo] signUpEmail failed:", err)
      return { success: false, error: "No se pudo crear la cuenta" }
    }
    await db
      .update(user)
      .set({ role: "staff", staffPermissions: permissions, updatedAt: new Date() })
      .where(eq(user.id, userId))
    // Sign-up opens a session for the new account on the server: drop it.
    await db.delete(sessionTable).where(eq(sessionTable.userId, userId))
  }

  const emailSent = await sendSetPasswordEmail(email)
  revalidatePath("/admin/equipo")
  return { success: true, data: { id: userId, emailSent, reactivated } }
}

export async function updateStaffPermissions(input: {
  userId: string
  permissions: StaffPermission[]
}): Promise<ActionResult<{ permissions: StaffPermission[] }>> {
  const { error } = await requireOwner()
  if (error) return { success: false, error }

  const id = userIdSchema.safeParse(input.userId)
  const perms = permissionsSchema.safeParse(input.permissions)
  if (!id.success) return { success: false, error: "Persona no encontrada" }
  if (!perms.success) return { success: false, error: perms.error.errors[0].message }

  const target = await findStaffUser(id.data)
  if (!target) return { success: false, error: "Persona no encontrada en Equipo Cuik" }

  // Read on every request (api-utils getStaffPermissions): takes effect at once.
  const permissions = normalizeStaffPermissions(perms.data)
  await db
    .update(user)
    .set({ staffPermissions: permissions, updatedAt: new Date() })
    .where(and(eq(user.id, target.id), eq(user.role, "staff")))
  revalidatePath("/admin/equipo")
  return { success: true, data: { permissions } }
}

export async function revokeStaff(input: { userId: string }): Promise<ActionResult<null>> {
  const { error } = await requireOwner()
  if (error) return { success: false, error }

  const id = userIdSchema.safeParse(input.userId)
  if (!id.success) return { success: false, error: "Persona no encontrada" }
  const target = await findStaffUser(id.data)
  if (!target) return { success: false, error: "Persona no encontrada en Equipo Cuik" }

  // No role, no permissions, banned (cannot sign in again) and every open
  // session deleted, so the access ends now and not when the cookie expires.
  await db
    .update(user)
    .set({
      role: "user",
      staffPermissions: null,
      banned: true,
      banReason: REVOKED_REASON,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(and(eq(user.id, target.id), eq(user.role, "staff")))
  await db.delete(sessionTable).where(eq(sessionTable.userId, target.id))
  revalidatePath("/admin/equipo")
  return { success: true, data: null }
}

export async function resendStaffInvite(input: {
  userId: string
}): Promise<ActionResult<{ emailSent: boolean }>> {
  const { error } = await requireOwner()
  if (error) return { success: false, error }

  const id = userIdSchema.safeParse(input.userId)
  if (!id.success) return { success: false, error: "Persona no encontrada" }
  const target = await findStaffUser(id.data)
  if (!target) return { success: false, error: "Persona no encontrada en Equipo Cuik" }

  const emailSent = await sendSetPasswordEmail(target.email)
  return emailSent
    ? { success: true, data: { emailSent } }
    : { success: false, error: "No se pudo enviar el correo" }
}
