import http2 from "node:http2"
import { importPKCS8, SignJWT } from "jose"

import {
  APNS_PORT,
  APNS_PRIORITY,
  APNS_PRODUCTION_HOST,
  APNS_PUSH_TYPE,
  APNS_SANDBOX_HOST,
} from "../shared/constants"
import type {
  ApnsClientCert,
  ApnsPushParams,
  ApnsPushResult,
  ApnsPushTokenResult,
} from "../shared/types"

/**
 * Create an ES256 JWT for APNs authentication.
 *
 * Uses `jose` library to handle key import and signing natively,
 * eliminating the need for manual DER-to-JOSE signature conversion.
 */
async function createApnsJwt(p8KeyPem: string, teamId: string, keyId: string): Promise<string> {
  // Normalize line endings — Dokploy / copy-paste often introduces \r\n which
  // jose tolerates but other parsers don't. Doing it here is harmless and
  // surfaces consistent diagnostics below.
  const normalized = p8KeyPem.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()

  let privateKey: Awaited<ReturnType<typeof importPKCS8>>
  try {
    privateKey = await importPKCS8(normalized, "ES256")
  } catch (err) {
    // Diagnostic: log shape of the supplied PEM (no secret content) so we can
    // tell whether the env var was double-encoded, mis-pasted, or the wrong
    // key format. This runs on every failed push so the operator sees it
    // immediately without needing extra tooling.
    const head = normalized.slice(0, 30).replace(/\n/g, "\\n")
    const tail = normalized.slice(-30).replace(/\n/g, "\\n")
    const hasBeginPrivate = normalized.includes("-----BEGIN PRIVATE KEY-----")
    const hasBeginEc = normalized.includes("-----BEGIN EC PRIVATE KEY-----")
    const hasBeginRsa = normalized.includes("-----BEGIN RSA PRIVATE KEY-----")
    const hasEnd = normalized.includes("-----END")
    console.error(
      `[Wallet:APNs] importPKCS8 failed: ${err instanceof Error ? err.message : String(err)}`,
      `len=${normalized.length} head="${head}" tail="${tail}"`,
      `hasBeginPrivate=${hasBeginPrivate} hasBeginEc=${hasBeginEc} hasBeginRsa=${hasBeginRsa} hasEnd=${hasEnd}`,
      `teamId=${teamId} keyId=${keyId}`,
    )
    throw err
  }

  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ iss: teamId, iat: now })
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .sign(privateKey)
}

/**
 * How a request authenticates to APNs: a provider token (.p8 key of the
 * team) or the pass type's own certificate as the TLS client certificate.
 */
type ApnsAuth = { kind: "token"; jwt: string } | { kind: "cert"; cert: ApnsClientCert }

/** Connect + response budget per APNs request. */
const APNS_TIMEOUT_MS = 10_000

type SendOutcome = { ok: boolean; status: number; error?: string }

/**
 * Send a single APNs push notification to a device token via HTTP/2.
 *
 * Returns a promise that resolves with the status and environment used.
 */
function sendToDevice(
  host: string,
  deviceToken: string,
  passTypeId: string,
  auth: ApnsAuth,
): Promise<SendOutcome> {
  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session | null = null

    try {
      client =
        auth.kind === "cert"
          ? http2.connect(`https://${host}:${APNS_PORT}`, {
              cert: auth.cert.certPem,
              key: auth.cert.keyPem,
              ...(auth.cert.passphrase ? { passphrase: auth.cert.passphrase } : {}),
            })
          : http2.connect(`https://${host}:${APNS_PORT}`)

      client.on("error", (err) => {
        try {
          client?.close()
        } catch {
          // ignore close errors
        }
        resolve({ ok: false, status: 0, error: err.message })
      })
      // A half-open connection must never hang a whole batch.
      client.setTimeout(APNS_TIMEOUT_MS, () => {
        try {
          client?.destroy()
        } catch {
          // ignore destroy errors
        }
        resolve({ ok: false, status: 0, error: `timeout after ${APNS_TIMEOUT_MS} ms` })
      })

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "apns-topic": passTypeId,
        "apns-push-type": APNS_PUSH_TYPE,
        "apns-priority": APNS_PRIORITY,
        "apns-expiration": "0",
        ...(auth.kind === "token" ? { authorization: `bearer ${auth.jwt}` } : {}),
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

/** " (Reason)" from an APNs error body like {"reason":"TopicDisallowed"}; empty when absent. */
function apnsReason(body: string | undefined): string {
  if (!body) return ""
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason
    return typeof reason === "string" && reason ? ` (${reason})` : ""
  } catch {
    return ""
  }
}

type Attempt = {
  ok: boolean
  status: number
  envUsed: "production" | "sandbox"
  /** Human summary of the failure, e.g. "prod=400 (TopicDisallowed) sandbox=400 (BadDeviceToken)". */
  error?: string
  /** Dead token: 410 from both environments. */
  dead: boolean
}

/**
 * One delivery attempt with one credential: production first; on 400/410
 * the sandbox (passes signed for development live there).
 */
async function attempt(token: string, passTypeId: string, auth: ApnsAuth): Promise<Attempt> {
  const prod = await sendToDevice(APNS_PRODUCTION_HOST, token, passTypeId, auth)
  if (prod.ok) return { ok: true, status: prod.status, envUsed: "production", dead: false }

  if (prod.status === 400 || prod.status === 410) {
    const sandbox = await sendToDevice(APNS_SANDBOX_HOST, token, passTypeId, auth)
    if (sandbox.ok) {
      return { ok: true, status: sandbox.status, envUsed: "sandbox", dead: false }
    }
    const dead = sandbox.status === 410
    return {
      ok: false,
      status: sandbox.status,
      envUsed: "sandbox",
      error: `prod=${prod.status}${apnsReason(prod.error)} sandbox=${sandbox.status}${apnsReason(sandbox.error)}${dead ? " (dead token)" : ""}`,
      dead,
    }
  }

  return {
    ok: false,
    status: prod.status,
    envUsed: "production",
    error: prod.status === 0 ? prod.error : `prod=${prod.status}${apnsReason(prod.error)}`,
    dead: false,
  }
}

/**
 * Send push notifications to multiple device tokens.
 *
 * Credentials: the pass type's own certificate first when the caller has it
 * (it is valid for that topic by construction, whatever team the global key
 * belongs to), then the provider token (.p8). A dead token (410 everywhere)
 * is not retried with the other credential. Uses the `jose` library for JWT
 * signing and `node:http2` for the HTTP/2 connection required by APNs.
 *
 * @param params - Device tokens, passTypeId, P8 key credentials and optional client certificate
 * @returns Per-token results with status, environment and credential used
 */
export async function sendApnsPush(params: ApnsPushParams): Promise<ApnsPushResult> {
  const { deviceTokens, passTypeId, p8KeyPem, teamId, keyId, clientCert } = params

  if (deviceTokens.length === 0) {
    return { sent: 0, total: 0, results: [] }
  }

  let jwt: string | null = null
  const tokenAuth = async (): Promise<ApnsAuth> => {
    if (!jwt) jwt = await createApnsJwt(p8KeyPem, teamId, keyId)
    return { kind: "token", jwt }
  }

  let sent = 0
  const results: ApnsPushTokenResult[] = []
  // Once Apple rejects the certificate itself (not just one token), do not pay
  // two extra connections per token for the rest of the batch.
  let certUsable = !!clientCert

  for (const token of deviceTokens) {
    const tokenPrefix = token.slice(0, 8)

    if (clientCert && certUsable) {
      const byCert = await attempt(token, passTypeId, { kind: "cert", cert: clientCert })
      if (byCert.ok) {
        results.push({
          tokenPrefix,
          ok: true,
          status: byCert.status,
          envUsed: byCert.envUsed,
          authUsed: "cert",
        })
        sent++
        continue
      }
      if (byCert.dead) {
        results.push({
          tokenPrefix,
          ok: false,
          status: byCert.status,
          envUsed: byCert.envUsed,
          authUsed: "cert",
          error: byCert.error,
        })
        continue
      }
      // Fall back to the provider token and report both outcomes. A 403 means
      // Apple refused the certificate: skip it for the remaining tokens.
      if (byCert.status === 403) certUsable = false
      const byToken = await attempt(token, passTypeId, await tokenAuth())
      if (byToken.ok) {
        results.push({
          tokenPrefix,
          ok: true,
          status: byToken.status,
          envUsed: byToken.envUsed,
          authUsed: "token",
        })
        sent++
        continue
      }
      results.push({
        tokenPrefix,
        ok: false,
        status: byToken.status,
        envUsed: byToken.envUsed,
        authUsed: "token",
        error: `cert: ${byCert.error ?? "failed"} | token: ${byToken.error ?? "failed"}`,
      })
      continue
    }

    const byToken = await attempt(token, passTypeId, await tokenAuth())
    results.push({
      tokenPrefix,
      ok: byToken.ok,
      status: byToken.status,
      envUsed: byToken.envUsed,
      authUsed: "token",
      ...(byToken.ok ? {} : { error: byToken.error }),
    })
    if (byToken.ok) sent++
  }

  return { sent, total: deviceTokens.length, results }
}
