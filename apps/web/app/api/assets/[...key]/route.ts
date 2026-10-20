import { getAsset } from "@/lib/storage"

/** Public keys: tenant pass assets and generated designs only. */
const PUBLIC_KEY = /^tenants\/[0-9a-f-]{36}\/(assets|designs|generated)\/[^/]+$/i

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params
  const key = keyParts.join("/")

  // This route is public and CDN-cacheable: only pass assets live here.
  // Billing documents (tenants/{id}/billing/...) are served exclusively by the
  // authenticated super-admin route; answer 404 as if they did not exist.
  if (!PUBLIC_KEY.test(key)) {
    return Response.json({ success: false, error: "Asset not found" }, { status: 404 })
  }

  try {
    const { stream, contentType, etag } = await getAsset(key)

    // Collect stream into a buffer for the response
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk))
    }
    const body = Buffer.concat(chunks)

    // Uploaded files are served from our own origin: never let one run as a
    // page. A sandboxed, script-free CSP neutralises any HTML/SVG that slipped
    // in earlier, and SVGs download instead of rendering when opened directly
    // (they still display inside <img>).
    const isSvg = /svg/i.test(contentType)
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=86400, immutable",
        ETag: `"${etag}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        ...(isSvg ? { "Content-Disposition": "attachment" } : {}),
      },
    })
  } catch (error: unknown) {
    const err = error as { code?: string }
    if (err.code === "NotFound" || err.code === "NoSuchKey") {
      return Response.json({ success: false, error: "Asset not found" }, { status: 404 })
    }
    console.error("[GET /api/assets]", error)
    return Response.json({ success: false, error: "Failed to retrieve asset" }, { status: 500 })
  }
}
