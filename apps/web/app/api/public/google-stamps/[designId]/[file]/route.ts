import { loadAssetBuffer } from "@cuik/wallet/shared"

import { checkRateLimit } from "@/lib/rate-limit"
import { parseStampsImageFile, stampsImageHash } from "@/lib/wallet/google-stamps-image"
import { stampsImageSourceOfDesign } from "@/lib/wallet/google-stamps-image-db"
import { buildStripImages } from "@/lib/wallet/points-strip"
import { safeAssetUrl, stripLayoutFrom } from "@/lib/wallet/strip-layout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/public/google-stamps/<designId>/<hash>-<state>.png
 *
 * The stamp card Google Wallet shows for tenants with the "sellos en Google"
 * switch on: the Apple strip (750×288, same `buildStripImages`) for one state
 * of a design. Public because Google's servers download it; it holds no client
 * data and only composes images that are already public.
 *
 * A picture is kept in memory under the hash of what it was drawn from, so a
 * hit costs no DB read and "immutable" is true: the same address always gives
 * the same picture. An address with an outdated hash still gets today's picture
 * (never a broken image on a phone), cached briefly.
 *
 * Drawing is the only expensive step and the states of a design are few
 * (visits per card + 1), so misses are rate limited as a whole: DB lookups
 * generously, drawings tightly.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_CACHED = 96
const MAX_CACHED_BYTES = 1_500_000
const RENDERS_PER_MINUTE = 120
const LOOKUPS_PER_MINUTE = 600

const rendered = new Map<string, Buffer>()
const inFlight = new Map<string, Promise<{ image: Buffer; complete: boolean }>>()

function remember(key: string, png: Buffer) {
  if (png.length > MAX_CACHED_BYTES) return
  rendered.delete(key)
  rendered.set(key, png)
  while (rendered.size > MAX_CACHED) {
    const oldest = rendered.keys().next().value
    if (oldest === undefined) break
    rendered.delete(oldest)
  }
}

function png(body: Buffer, cacheControl: string) {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(body.length),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

const notFound = () => new Response(null, { status: 404 })
const busy = () => new Response(null, { status: 429, headers: { "Retry-After": "60" } })

const IMMUTABLE = "public, max-age=31536000, immutable"
const OUTDATED = "public, max-age=300"

type RouteParams = { params: Promise<{ designId: string; file: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  const { designId: rawId, file } = await params
  const parsed = parseStampsImageFile(file)
  if (!parsed || !UUID.test(rawId)) return notFound()
  const designId = rawId.toLowerCase()

  // Already drawn from exactly what this address names: no DB read.
  const asked = `${designId}:${parsed.hash}:${parsed.state}`
  const hit = rendered.get(asked)
  if (hit) {
    remember(asked, hit)
    return png(hit, IMMUTABLE)
  }

  // Everything below reads the DB: an address nobody drew yet, or a made-up one.
  if (!checkRateLimit("google-stamps-lookup", LOOKUPS_PER_MINUTE, 60_000)) return busy()

  try {
    const source = await stampsImageSourceOfDesign(designId)
    if (!source) return notFound()

    const hash = stampsImageHash(source)
    const current = hash === parsed.hash
    let state = parsed.state
    if (state !== "full" && state >= source.maxVisits) {
      // With today's hash this state does not exist. With an old one it is a
      // pass from when the card was longer: give it the closest picture.
      if (current) return notFound()
      state = Math.max(0, source.maxVisits - 1)
    }
    const key = `${designId}:${hash}:${state}`
    const cacheControl = current ? IMMUTABLE : OUTDATED

    const known = rendered.get(key)
    if (known) return png(known, cacheControl)

    let drawing = inFlight.get(key)
    if (!drawing) {
      if (!checkRateLimit("google-stamps-render", RENDERS_PER_MINUTE, 60_000)) return busy()
      const specialUrl = safeAssetUrl(source.stampsConfig?.specialStampUrl)
      drawing = (async () => {
        // Like Apple, a special icon that fails to load is drawn as the badge.
        // But that picture is not what the hash names: never keep it.
        let complete = true
        const [background, stamp, specialStamp] = await Promise.all([
          loadAssetBuffer(source.stripBgUrl),
          loadAssetBuffer(source.stampUrl),
          specialUrl
            ? loadAssetBuffer(specialUrl).catch(() => {
                complete = false
                return null
              })
            : null,
        ])
        const { strip2x } = await buildStripImages({
          programType: "stamps",
          background,
          stamp,
          stampsInCycle: state === "full" ? 0 : state,
          maxVisits: source.maxVisits,
          gridLayout: stripLayoutFrom(source.stampsConfig),
          specialStamp,
          completed: state === "full",
        })
        if (complete) remember(key, strip2x)
        return { image: strip2x, complete }
      })().finally(() => inFlight.delete(key))
      inFlight.set(key, drawing)
    }

    const { image, complete } = await drawing
    return png(image, complete ? cacheControl : OUTDATED)
  } catch (err) {
    console.error("[GET /api/public/google-stamps]", err)
    return new Response(null, { status: 500 })
  }
}
