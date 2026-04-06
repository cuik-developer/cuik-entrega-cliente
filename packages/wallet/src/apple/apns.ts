import http2 from "node:http2"
import { importPKCS8, SignJWT } from "jose"

import {
  APNS_PORT,
  APNS_PRIORITY,
  APNS_PRODUCTION_HOST,
  APNS_PUSH_TYPE,
  APNS_SANDBOX_HOST,
} from "../shared/constants"
import type { ApnsPushParams, ApnsPushResult, ApnsPushTokenResult } from "../shared/types"

/**
 * Create an ES256 JWT for APNs authentication.
 *
 * Uses `jose` library to handle key import and signing natively,
 * eliminating the need for manual DER-to-JOSE signature conversion.
 */
async function createApnsJwt(p8KeyPem: string, teamId: string, keyId: string): Promise<string> {
  const privateKey = await importPKCS8(p8KeyPem, "ES256")
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ iss: teamId, iat: now })
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .sign(privateKey)
}

/**
 * Send a single APNs push notification to a device token via HTTP/2.
 *
 * Returns a promise that resolves with the status and environment used.
 * Never rejects — errors are captured in the result.
 */
function sendToDevice(
  host: string,
  deviceToken: string,
  passTypeId: string,
  jwt: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session | null = null

    try {
      client = http2.connect(`https://${host}:${APNS_PORT}`)

      client.on("error", (err) => {
        try {
          client?.close()
        } catch {
          // ignore close errors
        }
        resolve({ ok: false, status: 0, error: err.message })
      })

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "apns-topic": passTypeId,
        "apns-push-type": APNS_PUSH_TYPE,
        "apns-priority": APNS_PRIORITY,
        "apns-expiration": "0",
        authorization: `bearer ${jwt}`,
        "content-type": "application/json",
      })

      let data = ""

      req.setEncoding("utf8")
      req.on("data", (chunk: string) => {
        data += chunk
      })

      req.on("response", (headers) => {
        const status = Number(headers[":status"] || 0)

        req.on("end", () => {
          try {
            client?.close()
          } catch {
            // ignore close errors
          }
          resolve({
            ok: status === 200,
            status,
            error: data || undefined,
          })
        })
      })

      req.on("error", (err) => {
        try {
          client?.close()
        } catch {
          // ignore close errors
        }
        resolve({ ok: false, status: 0, error: err.message })
      })

      // Empty JSON body triggers pass refresh
      req.end("{}")
    } catch (err) {
      try {
        client?.close()
      } catch {
        // ignore close errors
      }
      resolve({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}

/**
 * Send APNs push notifications to trigger pass refresh on registered devices.
 *
 * Strategy: try production gateway first. On 400/410, retry with sandbox.
 * On 410 from both gateways, mark token as dead (caller handles DB cleanup).
 *
 * Uses `jose` for ES256 JWT signing (no manual DER-to-JOSE conversion needed)
 * and `node:http2` for the HTTP/2 connection required by APNs.
 *
 * @param params - Device tokens, passTypeId, and P8 key credentials
 * @returns Per-token results with status and environment used
 */
export async function sendApnsPush(params: ApnsPushParams): Promise<ApnsPushResult> {
  const { deviceTokens, passTypeId, p8KeyPem, teamId, keyId } = params

  if (deviceTokens.length === 0) {
    return { sent: 0, total: 0, results: [] }
  }

  const jwt = await createApnsJwt(p8KeyPem, teamId, keyId)

  let sent = 0
  const results: ApnsPushTokenResult[] = []

  for (const token of deviceTokens) {
    const tokenPrefix = token.slice(0, 8)

    // 1. Try production first
    const prod = await sendToDevice(APNS_PRODUCTION_HOST, token, passTypeId, jwt)

    if (prod.ok) {
      results.push({ tokenPrefix, ok: true, status: prod.status, envUsed: "production" })
      sent++
      continue
    }

    // 2. On 400/410, retry with sandbox
    if (prod.status === 400 || prod.status === 410) {
      const sandbox = await sendToDevice(APNS_SANDBOX_HOST, token, passTypeId, jwt)

      if (sandbox.ok) {
        results.push({ tokenPrefix, ok: true, status: sandbox.status, envUsed: "sandbox" })
        sent++
        continue
      }

      // Both failed — 410 from both means dead token
      results.push({
        tokenPrefix,
        ok: false,
        status: sandbox.status,
        envUsed: "sandbox",
        error: `prod=${prod.status} sandbox=${sandbox.status}${sandbox.status === 410 ? " (dead token)" : ""}`,
      })
      continue
    }

    // 3. Non-400/410 production failure (network error, etc.)
    results.push({
      tokenPrefix,
      ok: false,
      status: prod.status,
      envUsed: "production",
      error: prod.error,
    })
  }

  return { sent, total: deviceTokens.length, results }
}
