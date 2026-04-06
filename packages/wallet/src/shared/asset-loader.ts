import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ASSET_CACHE_MAX_ENTRIES, ASSET_CACHE_TTL_MS } from "./constants"

type CacheEntry = {
  buffer: Buffer
  expiresAt: number
}

/** Module-level LRU cache for asset buffers */
const cache = new Map<string, CacheEntry>()

/**
 * Evict expired entries and enforce max size.
 */
function evict(): void {
  const now = Date.now()

  // Remove expired entries
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }

  // Enforce max size (remove oldest entries first)
  if (cache.size > ASSET_CACHE_MAX_ENTRIES) {
    const excess = cache.size - ASSET_CACHE_MAX_ENTRIES
    const keys = cache.keys()
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next()
      if (value) cache.delete(value)
    }
  }
}

/**
 * Load an asset from a URL and return its raw Buffer.
 * Results are cached in-memory with a 10-minute TTL and max 50 entries.
 *
 * Supports both HTTP(S) URLs and `data:` URIs.
 */
export async function loadAssetBuffer(url: string): Promise<Buffer> {
  // Check cache
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer
  }

  let buffer: Buffer

  if (url.startsWith("data:")) {
    // Handle data URI: data:[<mediatype>][;base64],<data>
    const commaIndex = url.indexOf(",")
    if (commaIndex === -1) {
      throw new Error(`[Wallet:AssetLoader] Invalid data URI: ${url.slice(0, 50)}...`)
    }
    const base64Data = url.slice(commaIndex + 1)
    buffer = Buffer.from(base64Data, "base64")
  } else if (url.startsWith("/api/assets/")) {
    // Relative path — try local filesystem first, then HTTP fetch as fallback
    const key = url.replace("/api/assets/", "")
    const localPath = join(process.cwd(), ".local-storage", key)
    try {
      buffer = await readFile(localPath)
    } catch {
      // Fallback: fetch via HTTP using the app's base URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL
      if (baseUrl) {
        const fullUrl = `${baseUrl.replace(/\/$/, "")}${url}`
        const response = await fetch(fullUrl)
        if (!response.ok) {
          throw new Error(
            `[Wallet:AssetLoader] Failed to fetch asset ${fullUrl}: ${response.status} ${response.statusText}`,
          )
        }
        const arrayBuffer = await response.arrayBuffer()
        buffer = Buffer.from(arrayBuffer)
      } else {
        throw new Error(
          `[Wallet:AssetLoader] Local file not found: ${localPath}. Set NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL for HTTP fallback.`,
        )
      }
    }
  } else if (url.startsWith("/")) {
    // Relative path to public directory (e.g. /defaults/cuik-icon.png)
    const localPath = join(process.cwd(), "public", url)
    try {
      buffer = await readFile(localPath)
    } catch {
      throw new Error(`[Wallet:AssetLoader] Public file not found: ${localPath}`)
    }
  } else {
    // Fetch from HTTP(S)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `[Wallet:AssetLoader] Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      )
    }
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  }

  // Store in cache
  evict()
  cache.set(url, {
    buffer,
    expiresAt: Date.now() + ASSET_CACHE_TTL_MS,
  })

  return buffer
}

/**
 * Clear the asset cache. Useful for testing.
 */
export function clearAssetCache(): void {
  cache.clear()
}
