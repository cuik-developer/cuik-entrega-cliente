const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"])

/**
 * Convert a File to a base64 data URI string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("FileReader did not return a string"))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Validate that a file does not exceed the maximum size in KB.
 */
export function validateImageSize(file: File, maxKB = 500): boolean {
  return file.size <= maxKB * 1024
}

/**
 * Validate that a file is an allowed image type (PNG, JPG, SVG, WEBP).
 */
export function validateImageType(file: File): boolean {
  return ALLOWED_TYPES.has(file.type)
}

/**
 * Compress a base64 data URI image to fit within maxBytes.
 *
 * Uses the browser Canvas API to iteratively reduce quality and dimensions
 * until the output fits the target size. Returns the original if already small enough.
 */
export async function compressImage(dataUri: string, maxBytes = 500_000): Promise<string> {
  // Check if already under limit (base64 length * 0.75 ≈ byte size)
  const base64Part = dataUri.split(",")[1] ?? ""
  if (base64Part.length * 0.75 <= maxBytes) {
    return dataUri
  }

  const img = await loadImage(dataUri)

  let scale = 1.0
  let quality = 0.85
  const QUALITY_FLOOR = 0.3
  const SCALE_STEP = 0.8
  const QUALITY_STEP = 0.1
  const MAX_ITERATIONS = 10

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const width = Math.round(img.naturalWidth * scale)
    const height = Math.round(img.naturalHeight * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get 2d context for image compression")

    ctx.drawImage(img, 0, 0, width, height)

    const result = canvas.toDataURL("image/jpeg", quality)
    const resultBase64 = result.split(",")[1] ?? ""

    if (resultBase64.length * 0.75 <= maxBytes) {
      return result
    }

    // Reduce quality first, then scale down
    if (quality > QUALITY_FLOOR) {
      quality = Math.max(QUALITY_FLOOR, quality - QUALITY_STEP)
    } else {
      scale *= SCALE_STEP
    }
  }

  // Return best effort after max iterations
  const finalCanvas = document.createElement("canvas")
  const finalWidth = Math.round(img.naturalWidth * scale)
  const finalHeight = Math.round(img.naturalHeight * scale)
  finalCanvas.width = finalWidth
  finalCanvas.height = finalHeight

  const finalCtx = finalCanvas.getContext("2d")
  if (!finalCtx) throw new Error("Could not get 2d context for final compression")

  finalCtx.drawImage(img, 0, 0, finalWidth, finalHeight)
  return finalCanvas.toDataURL("image/jpeg", QUALITY_FLOOR)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image for compression"))
    img.src = src
  })
}
