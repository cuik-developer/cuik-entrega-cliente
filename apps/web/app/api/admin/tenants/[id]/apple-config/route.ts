import { randomBytes } from "node:crypto"
import { db, eq, tenants } from "@cuik/db"
import { appleConfigProductionSchema } from "@cuik/shared/validators"
import forge from "node-forge"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { generateCsr } from "@/lib/apple-csr"
import { encrypt } from "@/lib/encryption"
import { invalidateTenantAppleConfigCache } from "@/lib/wallet/tenant-apple-config"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET — Return current config status (no secrets) ─────────────────

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params

    const [tenant] = await db
      .select({ appleConfig: tenants.appleConfig })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    const cfg = tenant.appleConfig as Record<string, unknown> | null

    if (!cfg) {
      return successResponse({
        mode: null,
        passTypeId: null,
        teamId: null,
        configuredAt: null,
        expiresAt: null,
        hasSigningCert: false,
        hasPrivateKey: false,
      })
    }

    return successResponse({
      mode: cfg.mode ?? null,
      passTypeId: cfg.passTypeId ?? null,
      teamId: cfg.teamId ?? null,
      configuredAt: cfg.configuredAt ?? null,
      expiresAt: cfg.expiresAt ?? null,
      hasSigningCert: !!cfg.signerCertBase64,
      hasPrivateKey: !!cfg.signerKeyBase64,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/apple-config]", error)
    return errorResponse("Internal server error", 500)
  }
}

// ── POST — Handle wizard actions ────────────────────────────────────

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const body = await request.json()
    const { action } = body as { action: string }

    if (!action) {
      return errorResponse("Missing action field", 400)
    }

    // Verify tenant exists
    const [tenant] = await db
      .select({ id: tenants.id, appleConfig: tenants.appleConfig })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    const currentConfig = (tenant.appleConfig as Record<string, unknown> | null) ?? {}

    switch (action) {
      case "init":
        return handleInit(id, body)
      case "generate-csr":
        return handleGenerateCsr(id, currentConfig)
      case "upload-cert":
        return handleUploadCert(id, currentConfig, body)
      case "activate":
        return handleActivate(id, currentConfig)
      default:
        return errorResponse(`Unknown action: ${action}`, 400)
    }
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/apple-config]", error)
    return errorResponse("Internal server error", 500)
  }
}

// ── DELETE — Revert to demo mode ────────────────────────────────────

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params

    const [tenant] = await db
      .select({ id: tenants.id, appleConfig: tenants.appleConfig })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    const currentConfig = (tenant.appleConfig as Record<string, unknown> | null) ?? {}

    // Keep encrypted data for potential re-activation, just change mode
    await db
      .update(tenants)
      .set({
        appleConfig: { ...currentConfig, mode: "demo" },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))

    invalidateTenantAppleConfigCache(id)

    return successResponse({ mode: "demo" })
  } catch (error) {
    console.error("[DELETE /api/admin/tenants/[id]/apple-config]", error)
    return errorResponse("Internal server error", 500)
  }
}

// ── Action handlers ─────────────────────────────────────────────────

async function handleInit(tenantId: string, body: { teamId?: string; passTypeId?: string }) {
  const { teamId, passTypeId } = body

  if (!teamId || !passTypeId) {
    return errorResponse("teamId and passTypeId are required", 400)
  }

  if (teamId.length !== 10) {
    return errorResponse("teamId must be 10 characters", 400)
  }

  if (!passTypeId.startsWith("pass.")) {
    return errorResponse("passTypeId must start with 'pass.'", 400)
  }

  await db
    .update(tenants)
    .set({
      appleConfig: { mode: "configuring", teamId, passTypeId },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))

  return successResponse({ mode: "configuring", teamId, passTypeId })
}

async function handleGenerateCsr(tenantId: string, currentConfig: Record<string, unknown>) {
  const passTypeId = currentConfig.passTypeId as string | undefined

  if (!passTypeId) {
    return errorResponse("passTypeId not configured. Run init first.", 400)
  }

  const { csrPem, privateKeyPem } = generateCsr(passTypeId)

  // Encrypt the private key before storing
  const encryptedKey = encrypt(privateKeyPem)

  await db
    .update(tenants)
    .set({
      appleConfig: {
        ...currentConfig,
        signerKeyBase64: encryptedKey,
      },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))

  return successResponse({ csrPem })
}

async function handleUploadCert(
  tenantId: string,
  currentConfig: Record<string, unknown>,
  body: { certBase64?: string },
) {
  const { certBase64 } = body

  if (!certBase64) {
    return errorResponse("certBase64 is required", 400)
  }

  try {
    // Parse DER certificate
    const derBuffer = Buffer.from(certBase64, "base64")
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(derBuffer.toString("binary")))
    const cert = forge.pki.certificateFromAsn1(asn1)
    const expiresAt = cert.validity.notAfter.toISOString()

    // Convert DER cert to PEM for storage
    const pemCert = forge.pki.certificateToPem(cert)
    const pemBase64 = Buffer.from(pemCert).toString("base64")

    // Encrypt the PEM base64
    const encryptedCert = encrypt(pemBase64)

    // Generate and encrypt auth secret
    const authSecret = randomBytes(32).toString("hex")
    const encryptedAuthSecret = encrypt(authSecret)

    await db
      .update(tenants)
      .set({
        appleConfig: {
          ...currentConfig,
          signerCertBase64: encryptedCert,
          authSecret: encryptedAuthSecret,
          expiresAt,
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))

    return successResponse({ expiresAt })
  } catch (error) {
    console.error("[apple-config/upload-cert] Certificate parsing failed:", error)
    return errorResponse("Invalid certificate file. Ensure it is a valid .cer (DER) file.", 400)
  }
}

async function handleActivate(tenantId: string, currentConfig: Record<string, unknown>) {
  // Validate all required fields are present
  const requiredFields = [
    "signerCertBase64",
    "signerKeyBase64",
    "authSecret",
    "passTypeId",
    "teamId",
  ]
  const missing = requiredFields.filter((f) => !currentConfig[f])

  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(", ")}`, 400)
  }

  const activatedConfig = {
    ...currentConfig,
    mode: "production",
    configuredAt: new Date().toISOString(),
  }

  // Validate against production schema
  const parsed = appleConfigProductionSchema.safeParse(activatedConfig)
  if (!parsed.success) {
    return errorResponse(
      "Configuration incomplete for production activation",
      400,
      parsed.error.flatten(),
    )
  }

  await db
    .update(tenants)
    .set({
      appleConfig: activatedConfig,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))

  invalidateTenantAppleConfigCache(tenantId)

  return successResponse({ mode: "production", configuredAt: activatedConfig.configuredAt })
}
