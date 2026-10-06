// ─── Google Wallet: messages + push notifications ─────────────────────────
//
// Google does not notify the phone when a loyalty object is PUT/PATCHed.
// The only way to show an Android notification for a campaign is the
// `addMessage` endpoint with messageType TEXT_AND_NOTIFY: Google appends the
// message to the back of the pass and sends the push itself.
//
// Limits (official docs): 3 notifying messages per object per 24 h; past the
// quota Google answers with QuotaExceededException. When that happens we fall
// back to a plain TEXT message so the pass still shows it, and report
// `notified: false` so the caller can record it honestly.

const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject"

export type AddLoyaltyObjectMessageParams = {
  /** Full Google object id (`{issuerId}.{serial}`), as stored in pass_instances.google_object_id. */
  objectId: string
  /** Shown as the message title inside the pass (e.g. the business name). */
  header: string
  /** Message text, already resolved (no {{variables}} left). */
  body: string
  /** Stable id so re-sending the same campaign does not pile up duplicates. */
  messageId: string
  accessToken: string
  /** TEXT_AND_NOTIFY (default) pushes a notification; TEXT only adds it to the pass. */
  notify?: boolean
}

export type AddLoyaltyObjectMessageResult =
  | { ok: true; objectId: string; notified: boolean }
  | { ok: false; error: string; status?: number }

const QUOTA_MARKER = /quota/i

/**
 * Adds a message to a loyalty object and (by default) triggers the Android
 * notification. Never throws on HTTP errors: returns a discriminated result.
 */
export async function addLoyaltyObjectMessage(
  params: AddLoyaltyObjectMessageParams,
): Promise<AddLoyaltyObjectMessageResult> {
  const notify = params.notify ?? true
  const first = await postMessage(params, notify ? "TEXT_AND_NOTIFY" : "TEXT")
  if (first.ok) return { ok: true, objectId: params.objectId, notified: notify }

  // Quota exhausted (3 notifications / 24 h): keep the message on the pass without the push.
  if (notify && (first.status === 429 || QUOTA_MARKER.test(first.error))) {
    const second = await postMessage(params, "TEXT")
    if (second.ok) return { ok: true, objectId: params.objectId, notified: false }
    return second
  }

  return first
}

async function postMessage(
  params: AddLoyaltyObjectMessageParams,
  messageType: "TEXT" | "TEXT_AND_NOTIFY",
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const payload = {
    message: {
      id: params.messageId,
      header: params.header,
      body: params.body,
      messageType,
    },
  }

  let response: Response
  try {
    response = await fetch(`${WALLET_API_BASE}/${params.objectId}/addMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `[Wallet:Google] addMessage request error: ${message}` }
  }

  if (response.ok) return { ok: true }

  const text = await response.text().catch(() => "Unknown error")
  return {
    ok: false,
    error: `[Wallet:Google] addMessage failed: ${response.status} ${text}`,
    status: response.status,
  }
}
