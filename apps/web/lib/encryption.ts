import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${hex.length} characters`,
    )
  }
  return Buffer.from(hex, "hex")
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:tag:ciphertext` with each segment base64-encoded.
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":")
}

/**
 * Decrypt a ciphertext string produced by `encrypt`.
 * Expects `iv:tag:ciphertext` format with base64-encoded segments.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:tag:ciphertext")
  }

  const [ivB64, tagB64, encB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const encrypted = Buffer.from(encB64, "base64")

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString("utf8")
}
