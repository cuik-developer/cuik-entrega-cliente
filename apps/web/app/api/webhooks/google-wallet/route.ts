import { db, eq, googleCallbackEvents, passInstances } from "@cuik/db"
import { verifyGoogleWalletCallback } from "@cuik/wallet/google"
import { validateGoogleEnv } from "@cuik/wallet/shared"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Google Wallet save/delete callback (class `callbackOptions.url`).
 *
 * Google POSTs a signed ECv2SigningOnly message whenever a user saves ("save")
 * or removes ("del") a loyalty object. There is no session: the signature,
 * verified against Google's public keys for our issuer id, is the auth.
 *
 * Always answers 200 once the message is authentic (even for unknown objects
 * or duplicates) so Google stops retrying; 401 for anything we cannot verify.
 */
export async function POST(request: Request) {
  const googleConfig = validateGoogleEnv()
  if (!googleConfig) {
    return NextResponse.json({ error: "Google Wallet not configured" }, { status: 503 })
  }

  const body = await request.text()
  const verified = await verifyGoogleWalletCallback({ issuerId: googleConfig.issuerId, body })
  if (!verified.ok) {
    console.warn(`[Wallet:GoogleCallback] rejected: ${verified.error}`)
    return NextResponse.json({ error: verified.error }, { status: 401 })
  }

  const { objectId, classId, eventType, expTimeMillis, nonce } = verified.message

  try {
    // Google may deliver the same event more than once: the nonce dedupes it.
    const inserted = await db
      .insert(googleCallbackEvents)
      .values({ nonce, eventType, objectId, classId, expTimeMillis })
      .onConflictDoNothing({ target: googleCallbackEvents.nonce })
      .returning({ id: googleCallbackEvents.id })
    if (inserted.length === 0) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const now = new Date()
    const patch =
      eventType === "save"
        ? { googleSavedAt: now, googleDeletedAt: null }
        : { googleDeletedAt: now }
    const updated = await db
      .update(passInstances)
      .set(patch)
      .where(eq(passInstances.googleObjectId, objectId))
      .returning({ serialNumber: passInstances.serialNumber })

    console.info(
      `[Wallet:GoogleCallback] ${eventType} object=${objectId} matched=${updated.length} serial=${updated[0]?.serialNumber ?? "-"}`,
    )
    return NextResponse.json({ ok: true, matched: updated.length })
  } catch (error) {
    console.error("[Wallet:GoogleCallback] DB error:", error)
    // 500 makes Google retry later (best effort on their side).
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
