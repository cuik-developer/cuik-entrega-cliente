import { documentSchema } from "@cuik/shared/validators"
import { z } from "zod"
import {
  DocumentError,
  deleteDocument,
  isDocumentNumberConflict,
  setDocumentStatus,
  updateDocument,
} from "@/lib/admin/documents-data"
import { badRequest, requireSuperAdmin, UUID_RE } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { deleteAsset } from "@/lib/storage"

type Ctx = { params: Promise<{ id: string }> }

async function guard(request: Request, ctx: Ctx) {
  const g = await requireSuperAdmin(request)
  if (!g.ok) return { error: g.error }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return { error: errorResponse("Not found", 404) }
  return { session: g.session, id }
}

function known(err: unknown) {
  if (err instanceof DocumentError) return errorResponse(err.message, err.status)
  if (isDocumentNumberConflict(err))
    return errorResponse("Ya existe un comprobante con ese número", 409)
  return null
}

/** Replace a document (whole object). */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const parsed = documentSchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      await updateDocument(g.id, parsed.data, g.session.user.id)
    } catch (err) {
      const res = known(err)
      if (res) return res
      throw err
    }
    return successResponse({ id: g.id })
  } catch (err) {
    console.error("[PUT /api/admin/finance/documents/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

const statusSchema = z.object({ status: z.enum(["registered", "void"]) })

/** Void or reactivate. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const parsed = statusSchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      await setDocumentStatus(g.id, parsed.data.status, g.session.user.id)
    } catch (err) {
      const res = known(err)
      if (res) return res
      throw err
    }
    return successResponse({ id: g.id })
  } catch (err) {
    console.error("[PATCH /api/admin/finance/documents/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

/** Delete a document registered by mistake, its files and the cost it created. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    let keys: string[]
    try {
      keys = await deleteDocument(g.id)
    } catch (err) {
      const res = known(err)
      if (res) return res
      throw err
    }
    for (const key of keys) await deleteAsset(key).catch(() => undefined)
    return successResponse({ id: g.id })
  } catch (err) {
    console.error("[DELETE /api/admin/finance/documents/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
