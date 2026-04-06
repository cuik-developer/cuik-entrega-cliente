import { db, eq, passAssets, passDesigns, promotions, solicitudes, sql, tenants } from "@cuik/db"
import { BienvenidaComercio, sendEmail } from "@cuik/email"
import { DEFAULT_STAMPS_CONFIG, updateSolicitudSchema } from "@cuik/shared/validators"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { auth } from "@/lib/auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const body = await request.json()
    const parsed = updateSolicitudSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    // Fetch the solicitud
    const [solicitud] = await db.select().from(solicitudes).where(eq(solicitudes.id, id)).limit(1)

    if (!solicitud) {
      return errorResponse("Solicitud not found", 404)
    }

    if (solicitud.status !== "pending") {
      return errorResponse("Solicitud already processed", 409)
    }

    // --- REJECT ---
    if (parsed.data.status === "rejected") {
      const [updated] = await db
        .update(solicitudes)
        .set({
          status: "rejected",
          notes: parsed.data.rejectionReason ?? null,
        })
        .where(eq(solicitudes.id, id))
        .returning()

      return successResponse(updated)
    }

    // --- APPROVE ---
    // Step a) Transaction: create tenant + update solicitud
    const { tenant: newTenant, updatedSolicitud } = await db.transaction(async (tx) => {
      // Create tenant from solicitud data — strip accents, lowercase, replace spaces with hyphens
      let slug = solicitud.businessName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")

      // Check slug uniqueness, append random suffix if collision
      const existingSlugs = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1)

      if (existingSlugs.length > 0) {
        const suffix = crypto.randomUUID().slice(0, 4)
        slug = `${slug}-${suffix}`
      }

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: solicitud.businessName,
          slug,
          status: "trial",
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
        })
        .returning()

      // Update solicitud
      const [updated] = await tx
        .update(solicitudes)
        .set({
          status: "approved",
          tenantId: tenant.id,
        })
        .where(eq(solicitudes.id, id))
        .returning()

      // Create default stamps promotion (inactive — SA activates when ready)
      const [promo] = await tx
        .insert(promotions)
        .values({
          tenantId: tenant.id,
          type: "stamps",
          maxVisits: 8,
          rewardValue: "Producto gratis",
          active: false,
          config: DEFAULT_STAMPS_CONFIG,
        })
        .returning({ id: promotions.id })

      // Create default pass design linked to the promotion
      const [newDesign] = await tx
        .insert(passDesigns)
        .values({
          tenantId: tenant.id,
          promotionId: promo.id,
          name: `${solicitud.businessName} - Apple`,
          type: "apple_store",
          isActive: false,
          version: 1,
          colors: {
            backgroundColor: "#1a1a2e",
            foregroundColor: "#ffffff",
            labelColor: "#e0e0e0",
          },
          stampsConfig: { maxVisits: 8, gridCols: 4, gridRows: 2 },
          fields: {
            headerFields: [{ key: "total", label: "# DE VISITAS", value: "{{stamps.total}}" }],
            secondaryFields: [
              { key: "client", label: "NOMBRE", value: "{{client.name}}" },
              { key: "stamps", label: "Visitas en ciclo", value: "{{stamps.current}}" },
            ],
            backFields: [
              {
                key: "stamps_b",
                label: "Visitas en ciclo",
                value: "{{stamps.current}} de {{stamps.max}}",
              },
              { key: "total_b", label: "Visitas totales", value: "{{stamps.total}}" },
              { key: "rewards_b", label: "Premios pendientes", value: "{{rewards.pending}}" },
            ],
          },
          canvasData: { width: 375, height: 123, elements: [] },
        })
        .returning({ id: passDesigns.id })

      // Insert default assets so wallet can generate .pkpass immediately
      await tx.insert(passAssets).values([
        {
          designId: newDesign.id,
          type: "icon" as const,
          url: "/defaults/cuik-icon.png",
          metadata: { description: "Default icon" },
        },
        {
          designId: newDesign.id,
          type: "strip_bg" as const,
          url: "/defaults/cuik-strip.png",
          metadata: { description: "Default strip" },
        },
        {
          designId: newDesign.id,
          type: "stamp" as const,
          url: "/defaults/cuik-stamp.png",
          metadata: { description: "Default stamp" },
        },
      ])

      return { tenant, updatedSolicitud: updated }
    })

    // Step b) Create admin user via Better Auth API
    // Generate a temporary password
    const tempPassword = `cuik-${crypto.randomUUID().slice(0, 8)}`
    let createdUserId: string | null = null

    try {
      const res = await auth.api.signUpEmail({
        body: {
          email: solicitud.email,
          password: tempPassword,
          name: solicitud.contactName,
        },
      })

      if (res?.user?.id) {
        createdUserId = res.user.id
        // Set role to admin
        await db.execute(sql`UPDATE public."user" SET role = 'admin' WHERE id = ${res.user.id}`)
      }
    } catch (err) {
      console.error("[APPROVE] Failed to create admin user:", err)
      // Don't rollback — SA can fix manually
    }

    // Step c) Create organization via Better Auth API
    let orgId: string | null = null
    if (createdUserId) {
      try {
        const org = await auth.api.createOrganization({
          body: {
            name: newTenant.name,
            slug: newTenant.slug,
            userId: createdUserId,
          },
        })
        orgId = org?.id ?? null
      } catch (err) {
        console.error("[APPROVE] Failed to create organization:", err)
        // Don't rollback — SA can fix manually
      }
    }

    // Step d) Update tenant with ownerId
    if (createdUserId) {
      await db.update(tenants).set({ ownerId: createdUserId }).where(eq(tenants.id, newTenant.id))
    }

    // Step e) Log generated credentials
    console.log("[APPROVE] Tenant created:", {
      tenantId: newTenant.id,
      slug: newTenant.slug,
      adminEmail: solicitud.email,
      orgId,
    })

    // Step f) Send welcome email with credentials (fire-and-forget)
    const loginUrl = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/login`
    sendEmail({
      to: solicitud.email,
      subject: `Bienvenido a Cuik — ${solicitud.businessName}`,
      template: BienvenidaComercio({
        businessName: solicitud.businessName,
        adminName: solicitud.contactName,
        email: solicitud.email,
        password: tempPassword,
        loginUrl,
      }),
    }).catch((err) => console.error("[EMAIL] Failed to send welcome email:", err))

    return successResponse({
      solicitud: updatedSolicitud,
      tenant: newTenant,
      credentials: {
        email: solicitud.email,
        tempPassword,
      },
    })
  } catch (error) {
    console.error("[PATCH /api/admin/solicitudes/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
