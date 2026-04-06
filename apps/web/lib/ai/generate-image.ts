import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import sharp from "sharp"

// ─── Types ──────────────────────────────────────────────────────────

interface GenerateImageOptions {
  width: number
  height: number
  transparent?: boolean
}

// ─── Constants ──────────────────────────────────────────────────────

const TIMEOUT_MS = 60_000
const CLI_NAME = "nano-banana"

// ─── Size & Aspect Resolution ───────────────────────────────────────

/** Map pixel dimensions to nano-banana size flags */
function resolveSize(width: number, height: number): string {
  const maxDim = Math.max(width, height)
  if (maxDim <= 512) return "512"
  return "1K"
}

/**
 * Pick the best VALID nano-banana aspect ratio for the target dimensions.
 * nano-banana only accepts: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5, 5:4, 21:9
 *
 * We pick the closest valid ratio — sharp will crop/resize to exact dims after.
 */
function resolveAspect(width: number, height: number): string {
  const target = width / height

  const ratioValues: [string, number][] = [
    ["1:1", 1],
    ["5:4", 5 / 4],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
    ["21:9", 21 / 9],
    ["4:5", 4 / 5],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ]

  let best = ratioValues[0]
  let bestDiff = Math.abs(target - best[1])

  for (const entry of ratioValues) {
    const diff = Math.abs(target - entry[1])
    if (diff < bestDiff) {
      best = entry
      bestDiff = diff
    }
  }

  return best[0]
}

// ─── Post-Processing ────────────────────────────────────────────────

/**
 * Resize + crop the generated image to exact wallet dimensions using sharp.
 * Uses fit: 'cover' + position: 'centre' — preserves quality, crops centered.
 */
async function resizeToExact(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: "centre",
    })
    .png()
    .toBuffer()
}

/**
 * Remove green screen background from an image generated with nano-banana's -t flag.
 * Converts bright green pixels (chroma key) to transparent.
 * Uses a tolerance-based approach to handle anti-aliased edges.
 */
async function removeGreenScreen(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  const { width, height, channels } = info

  for (let i = 0; i < width * height; i++) {
    const offset = i * channels
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]

    // Detect green screen: high green, low red, low blue
    // Tolerance handles anti-aliased edges
    if (g > 150 && r < 130 && b < 130 && g > r * 1.3 && g > b * 1.3) {
      // Make fully transparent
      pixels[offset + 3] = 0
    } else if (g > 120 && r < 150 && b < 150 && g > r * 1.1 && g > b * 1.1) {
      // Semi-transparent for edge pixels (anti-aliasing)
      const greenDominance = (g - Math.max(r, b)) / g
      pixels[offset + 3] = Math.round(255 * (1 - greenDominance))
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer()
}

// ─── Generate Image ─────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  options: GenerateImageOptions,
): Promise<Buffer> {
  const { width, height, transparent } = options

  // Create temp directory
  const tempDir = join(tmpdir(), `cuik-gen-${randomUUID()}`)
  await mkdir(tempDir, { recursive: true })

  try {
    // Build CLI arguments
    const outputName = `gen-${randomUUID().slice(0, 8)}`
    const aspect = resolveAspect(width, height)
    const args: string[] = [
      prompt,
      "-o",
      outputName,
      "-s",
      resolveSize(width, height),
      "-a",
      aspect,
    ]

    if (transparent) {
      args.push("-t")
    }

    // Execute nano-banana from tempDir (avoid -d flag which has path issues on Windows)
    await execCli(args, tempDir)

    // Read the generated file (nano-banana may create .png or .jpeg)
    const files = await readdir(tempDir)
    const outputFile = files.find(
      (f) =>
        f.startsWith(outputName) &&
        (f.endsWith(".png") || f.endsWith(".jpeg") || f.endsWith(".jpg")),
    )

    if (!outputFile) {
      throw new Error(
        "nano-banana did not produce an output file. Check GEMINI_API_KEY configuration.",
      )
    }

    const rawBuffer = await readFile(join(tempDir, outputFile))

    // Remove green screen if transparent mode was used
    const processedBuffer = transparent ? await removeGreenScreen(rawBuffer) : rawBuffer

    // Resize + crop to exact wallet dimensions
    const finalBuffer = await resizeToExact(processedBuffer, width, height)

    return finalBuffer
  } finally {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    })
  }
}

// ─── CLI Execution Helper ───────────────────────────────────────────

function execCli(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      CLI_NAME,
      args,
      {
        timeout: TIMEOUT_MS,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd,
      },
      (error, stdout, stderr) => {
        if (error) {
          // Check for specific error types
          if (
            "code" in error &&
            (error.code === "ENOENT" || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
          ) {
            reject(
              new Error(
                `${CLI_NAME} CLI not installed or not found in PATH. Install it globally first.`,
              ),
            )
            return
          }

          if (error.killed || ("signal" in error && error.signal === "SIGTERM")) {
            reject(
              new Error(
                `Image generation timed out (${TIMEOUT_MS / 1000}s). Try a simpler prompt.`,
              ),
            )
            return
          }

          // Check for content filtering
          const output = `${stdout}\n${stderr}`.toLowerCase()
          if (
            output.includes("safety") ||
            output.includes("blocked") ||
            output.includes("filtered") ||
            output.includes("content policy")
          ) {
            reject(new Error("Content filtered by AI safety model. Try a different prompt."))
            return
          }

          reject(new Error(`Image generation failed: ${stderr || error.message}`))
          return
        }

        resolve(stdout)
      },
    )
  })
}
