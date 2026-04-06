import { randomUUID } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import * as Minio from "minio"
import { z } from "zod"

// ─── Env Validation (graceful degradation like wallet/env.ts) ──────────

const storageEnvSchema = z.object({
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1).default("cuik-assets"),
  MINIO_USE_SSL: z
    .string()
    .optional()
    .transform((v) => v === "true"),
})

function validateStorageEnv() {
  const result = storageEnvSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ")
    console.warn(`[Storage] Disabled — missing env vars: ${missing}`)
    return null
  }
  return result.data
}

function isMinioConfigured(): boolean {
  return validateStorageEnv() !== null
}

// ─── Local Filesystem Fallback (dev mode) ──────────────────────────────

const LOCAL_STORAGE_DIR = join(process.cwd(), ".local-storage")

async function ensureLocalDir(key: string): Promise<string> {
  const filePath = join(LOCAL_STORAGE_DIR, key)
  await mkdir(dirname(filePath), { recursive: true })
  return filePath
}

// ─── Singleton Client ──────────────────────────────────────────────────

let client: Minio.Client | null = null

function getClient(): Minio.Client {
  if (client) return client

  const env = validateStorageEnv()
  if (!env) {
    throw new Error(
      "[Storage] MinIO is not configured. Check MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY env vars.",
    )
  }

  const [host, portStr] = env.MINIO_ENDPOINT.split(":")
  const port = portStr ? Number.parseInt(portStr, 10) : env.MINIO_USE_SSL ? 443 : 9000

  client = new Minio.Client({
    endPoint: host,
    port,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  })

  return client
}

function getBucket(): string {
  return process.env.MINIO_BUCKET || "cuik-assets"
}

// ─── Bucket Initialization ─────────────────────────────────────────────

let bucketReady = false

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return

  const minioClient = getClient()
  const bucket = getBucket()
  const exists = await minioClient.bucketExists(bucket)

  if (!exists) {
    await minioClient.makeBucket(bucket)
    console.log(`[Storage] Created bucket: ${bucket}`)
  }

  bucketReady = true
}

// ─── Key Generation ────────────────────────────────────────────────────

export function generateAssetKey(tenantId: string, ext: string): string {
  const id = randomUUID()
  return `tenants/${tenantId}/assets/${id}.${ext}`
}

// ─── URL Resolution ────────────────────────────────────────────────────

export function getPublicUrl(key: string): string {
  // Return relative path so it works across all domains (localhost, ngrok, production)
  return `/api/assets/${key}`
}

// ─── Upload ────────────────────────────────────────────────────────────

export async function uploadAsset(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (!isMinioConfigured()) {
    // Dev fallback: save to local filesystem
    const filePath = await ensureLocalDir(key)
    await writeFile(filePath, buffer)
    console.log(`[Storage:Local] Saved asset to ${filePath}`)
    return getPublicUrl(key)
  }

  await ensureBucket()

  const minioClient = getClient()
  const bucket = getBucket()

  await minioClient.putObject(bucket, key, buffer, buffer.length, {
    "Content-Type": contentType,
  })

  return getPublicUrl(key)
}

// ─── Download ──────────────────────────────────────────────────────────

export async function getAsset(
  key: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; size: number; etag: string }> {
  if (!isMinioConfigured()) {
    // Dev fallback: read from local filesystem
    const filePath = join(LOCAL_STORAGE_DIR, key)
    if (!existsSync(filePath)) {
      throw new Error(`[Storage:Local] Asset not found: ${key}`)
    }
    const fileStat = await stat(filePath)
    const stream = createReadStream(filePath)
    const ext = key.split(".").pop() ?? "png"
    const contentType =
      ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "application/octet-stream"

    return {
      stream,
      contentType,
      size: fileStat.size,
      etag: `"local-${fileStat.mtimeMs}"`,
    }
  }

  await ensureBucket()

  const minioClient = getClient()
  const bucket = getBucket()

  const fileStat = await minioClient.statObject(bucket, key)
  const stream = await minioClient.getObject(bucket, key)

  return {
    stream,
    contentType: (fileStat.metaData?.["content-type"] as string) || "application/octet-stream",
    size: fileStat.size,
    etag: fileStat.etag,
  }
}

// ─── Delete ────────────────────────────────────────────────────────────

export async function deleteAsset(key: string): Promise<void> {
  if (!isMinioConfigured()) {
    // Dev fallback: delete from local filesystem
    const filePath = join(LOCAL_STORAGE_DIR, key)
    await rm(filePath, { force: true })
    console.log(`[Storage:Local] Deleted asset: ${key}`)
    return
  }

  await ensureBucket()

  const minioClient = getClient()
  const bucket = getBucket()

  await minioClient.removeObject(bucket, key)
}
