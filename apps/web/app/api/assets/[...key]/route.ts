import { getAsset } from "@/lib/storage"

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params
  const key = keyParts.join("/")

  try {
    const { stream, contentType, etag } = await getAsset(key)

    // Collect stream into a buffer for the response
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk))
    }
    const body = Buffer.concat(chunks)

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=86400, immutable",
        ETag: `"${etag}"`,
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
