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
//
// Google also caps an object at 10 messages and does not say what happens to
// the 11th. We never get there: the pass keeps only the latest campaign.
// Before adding, any previous messages are wiped with a full PUT of the
// object minus `messages` (the same PUT a visit does, which is verified to
// clear them). A visit then clears that one too.

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
  /** Remove the pass's previous messages first (default true): one campaign at a time. */
  replacePrevious?: boolean
}

export type AddLoyaltyObjectMessageResult =
  | { ok: true; objectId: string; notified: boolean }
  | { ok: false; error: string; status?: number }

// Google's answer when the 3-notifications-per-24h budget of THIS pass is spent.
// A plain 429 / rateLimitExceeded is the per-minute API limit: retryable, and
// must not downgrade the message to silent TEXT.
const NOTIFICATION_QUOTA_MARKER =
  /QuotaExceededException|notification.{0,40}quota|quota.{0,40}notification/i
const RATE_LIMIT_RETRY_MS = 1500

/**
 * Adds a message to a loyalty object and (by default) triggers the Android
 * notification. Never throws on HTTP errors: returns a discriminated result.
 */
export async function addLoyaltyObjectMessage(
  params: AddLoyaltyObjectMessageParams,
): Promise<AddLoyaltyObjectMessageResult> {
  const notify = params.notify ?? true

  if (params.replacePrevious ?? true) {
    const cleared = await clearMessages(params)
    if (!cleared.ok) return cleared
  }

  const type = notify ? "TEXT_AND_NOTIFY" : "TEXT"
  let first = await postMessage(params, type)
  if (first.ok) return { ok: true, objectId: params.objectId, notified: notify }

  // Per-minute rate limit: wait and try the same request once more.
  if (first.status === 429 && !NOTIFICATION_QUOTA_MARKER.test(first.error)) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS))
    first = await postMessage(params, type)
    if (first.ok) return { ok: true, objectId: params.objectId, notified: notify }
  }

  // Notification quota of this pass exhausted (3 / 24 h): keep the message on
  // the pass without the push and say so.
  if (notify && NOTIFICATION_QUOTA_MARKER.test(first.error)) {
    const second = await postMessage(params, "TEXT")
    if (second.ok) return { ok: true, objectId: params.objectId, notified: false }
    return second
  }

  return first
}

/**
 * Drops every message the object currently carries. GET the object; if it has
 * messages, PUT it back without them (PUT replaces the whole resource).
 * No messages → nothing to do, no extra request.
 */
async function clearMessages(
  params: AddLoyaltyObjectMessageParams,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const headers = {
    Authorization: `Bearer ${params.accessToken}`,
    "Content-Type": "application/json",
  }

  let getResponse: Response
  try {
    getResponse = await fetch(`${WALLET_API_BASE}/${params.objectId}`, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `[Wallet:Google] GET loyalty object error: ${message}` }
  }
  if (!getResponse.ok) {
    const text = await getResponse.text().catch(() => "Unknown error")
    return {
      ok: false,
      error: `[Wallet:Google] GET loyalty object failed: ${getResponse.status} ${text}`,
      status: getResponse.status,
    }
  }

  const object = (await getResponse.json().catch(() => null)) as Record<string, unknown> | null
  if (!object || !Array.isArray(object.messages) || object.messages.length === 0)
    return { ok: true }

  // Drop the messages and the output-only fields Google adds on read.
  const {
    messages: _previous,
    classReference: _cls,
    hasUsers: _hu,
    hasLinkedDevice: _hld,
    kind: _kind,
    version: _ver,
    ...withoutMessages
  } = object
  let putResponse: Response
  try {
    putResponse = await fetch(`${WALLET_API_BASE}/${params.objectId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(withoutMessages),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `[Wallet:Google] PUT (clear messages) error: ${message}` }
  }
  if (!putResponse.ok) {
    const text = await putResponse.text().catch(() => "Unknown error")
    return {
      ok: false,
      error: `[Wallet:Google] PUT (clear messages) failed: ${putResponse.status} ${text}`,
      status: putResponse.status,
    }
  }
  return { ok: true }
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
