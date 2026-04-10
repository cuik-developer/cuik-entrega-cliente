import { and, appleDevices, db, eq, passInstances } from "@cuik/db"
import { sendApnsPush } from "@cuik/wallet/apple"
import { generateETag, validateAppleApnsEnv } from "@cuik/wallet/shared"
import { getTenantAppleConfig, resolveClientTenantId } from "@/lib/wallet/tenant-apple-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/apple-wallet/push-test
 *
 * Force an APNs push to all devices registered for a given serial number.
 * Also updates lastUpdatedAt + etag so the subsequent registrations-list
 * call returns the serial as "updated".
 *
 * Body: { "serialNumber": "MV_12345678", "secret": "<CRON_SECRET>" }
 *
 * Protected by CRON_SECRET to prevent abuse.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { serialNumber?: string; secret?: string }
    const { serialNumber, secret } = body

    if (!secret || secret !== process.env.CRON_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!serialNumber) {
      return Response.json({ error: "serialNumber required" }, { status: 400 })
    }

    // 1. Find the pass instance
    const [instance] = await db
      .select({
        id: passInstances.id,
        clientId: passInstances.clientId,
        lastUpdatedAt: passInstances.lastUpdatedAt,
        etag: passInstances.etag,
      })
      .from(passInstances)
      .where(eq(passInstances.serialNumber, serialNumber))
      .limit(1)

    if (!instance) {
      return Response.json({ error: "pass_instance not found", serialNumber }, { status: 404 })
    }

    // 2. Find registered devices
    const deviceRows = await db
      .select({
        deviceLibId: appleDevices.deviceLibId,
        pushToken: appleDevices.pushToken,
        passTypeId: appleDevices.passTypeId,
      })
      .from(appleDevices)
      .where(eq(appleDevices.serialNumber, serialNumber))

    const tokens = deviceRows.map((r) => r.pushToken).filter((t): t is string => !!t)

    // 3. Update lastUpdatedAt + etag so registrations-list returns this serial
    const now = new Date()
    const etag = generateETag(serialNumber, 0, now)
    await db
      .update(passInstances)
      .set({ etag, lastUpdatedAt: now })
      .where(eq(passInstances.serialNumber, serialNumber))

    // 4. Resolve APNs config
    const apnsConfig = validateAppleApnsEnv()
    if (!apnsConfig) {
      return Response.json({
        error: "APNs env not configured",
        devices: deviceRows.length,
        tokens: tokens.length,
        lastUpdatedAt: now.toISOString(),
        etag,
      }, { status: 503 })
    }

    if (tokens.length === 0) {
      return Response.json({
        ok: true,
        message: "No device tokens — lastUpdatedAt updated but no push sent",
        devices: deviceRows.length,
        tokens: 0,
        lastUpdatedAt: now.toISOString(),
        etag,
      })
    }

    // 5. Resolve passTypeId from tenant config
    const tenantId = await resolveClientTenantId(instance.clientId)
    const tenantConfig = tenantId ? await getTenantAppleConfig(tenantId) : null

    const rawP8 = apnsConfig.p8Base64
    const candidate = rawP8.includes("-----BEGIN")
      ? rawP8
      : Buffer.from(rawP8, "base64").toString("utf-8")
    const p8KeyPem = candidate.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()

    // 6. Send push
    const pushResult = await sendApnsPush({
      deviceTokens: tokens,
      passTypeId: tenantConfig?.passTypeId ?? apnsConfig.topic,
      p8KeyPem,
      teamId: apnsConfig.teamId,
      keyId: apnsConfig.keyId,
    })

    console.info(
      `[Wallet:PushTest] serial=${serialNumber}`,
      `devices=${deviceRows.length} tokens=${tokens.length}`,
      `sent=${pushResult.sent}/${pushResult.total}`,
      `lastUpdatedAt=${now.toISOString()} etag=${etag}`,
    )

    return Response.json({
      ok: true,
      serialNumber,
      devices: deviceRows.length,
      tokens: tokens.length,
      push: {
        sent: pushResult.sent,
        total: pushResult.total,
        results: pushResult.results.map((r) => ({
          tokenPrefix: r.tokenPrefix,
          ok: r.ok,
          status: r.status,
          envUsed: r.envUsed,
          error: r.error,
        })),
      },
      lastUpdatedAt: now.toISOString(),
      etag,
      previousLastUpdatedAt: instance.lastUpdatedAt?.toISOString() ?? "NULL",
      previousEtag: instance.etag ?? "NULL",
    })
  } catch (err) {
    console.error("[Wallet:PushTest] Error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}
