"use server"

import { asc, db, desc, eq, rewardCatalog } from "@cuik/db"
import {
  type CreateCatalogItemInput,
  createCatalogItemSchema,
  type UpdateCatalogItemInput,
  updateCatalogItemSchema,
} from "@cuik/shared/validators"
// revalidatePath removed — modal components refresh data manually
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ── Auth helper ─────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { session: null, error: "No autenticado" } as const
  }

  const role = session.user.role ?? "user"
  if (role !== "super_admin") {
    return { session: null, error: "No autorizado — se requiere super_admin" } as const
  }

  return { session, error: null } as const
}

// ── Actions ─────────────────────────────────────────────────────────

export async function getCatalogItems(
  tenantId: string,
): Promise<ActionResult<(typeof rewardCatalog.$inferSelect)[]>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const rows = await db
      .select()
      .from(rewardCatalog)
      .where(eq(rewardCatalog.tenantId, tenantId))
      .orderBy(asc(rewardCatalog.sortOrder), desc(rewardCatalog.createdAt))

    return { success: true, data: rows }
  } catch (err) {
    console.error("[getCatalogItems]", err)
    return { success: false, error: "Error al obtener items del catálogo" }
  }
}

export async function createCatalogItem(
  tenantId: string,
  input: CreateCatalogItemInput,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = createCatalogItemSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const [inserted] = await db
      .insert(rewardCatalog)
      .values({
        tenantId,
        name: parsed.data.name,
        description: parsed.data.description,
        imageUrl: parsed.data.imageUrl,
        pointsCost: parsed.data.pointsCost,
        category: parsed.data.category,
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      })
      .returning({ id: rewardCatalog.id })

    // Data refresh handled by parent component

    return { success: true, data: { id: inserted.id } }
  } catch (err) {
    console.error("[createCatalogItem]", err)
    return { success: false, error: "Error al crear item del catálogo" }
  }
}

export async function updateCatalogItem(
  itemId: string,
  input: UpdateCatalogItemInput,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = updateCatalogItemSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const [existing] = await db.select().from(rewardCatalog).where(eq(rewardCatalog.id, itemId))

    if (!existing) {
      return { success: false, error: "Item no encontrado" }
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description
    if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl
    if (parsed.data.pointsCost !== undefined) updateData.pointsCost = parsed.data.pointsCost
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder

    await db.update(rewardCatalog).set(updateData).where(eq(rewardCatalog.id, itemId))

    // Data refresh handled by parent component

    return { success: true, data: { id: itemId } }
  } catch (err) {
    console.error("[updateCatalogItem]", err)
    return { success: false, error: "Error al actualizar item del catálogo" }
  }
}

export async function deleteCatalogItem(itemId: string): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [existing] = await db.select().from(rewardCatalog).where(eq(rewardCatalog.id, itemId))

    if (!existing) {
      return { success: false, error: "Item no encontrado" }
    }

    // Soft delete: set active = false
    await db.update(rewardCatalog).set({ active: false }).where(eq(rewardCatalog.id, itemId))

    // Data refresh handled by parent component

    return { success: true, data: { id: itemId } }
  } catch (err) {
    console.error("[deleteCatalogItem]", err)
    return { success: false, error: "Error al eliminar item del catálogo" }
  }
}
