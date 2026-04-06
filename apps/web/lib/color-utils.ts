// ── Color Constants ─────────────────────────────────────────────────
export const CUIK_PRIMARY = "#0e70db"
export const CUIK_ACCENT = "#ff4810"

// ── Helpers ─────────────────────────────────────────────────────────

/** Normalize hex to 6-digit format with #. Returns null if invalid. */
function normalizeHex(hex: string): string | null {
  let h = hex.startsWith("#") ? hex.slice(1) : hex
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    return null
  }
  return `#${h}`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6

  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Darken a hex color by reducing its lightness.
 *
 * @param hex - Color in "#RRGGBB", "#RGB", or "RRGGBB" format
 * @param amount - 0 (no change) to 1 (nearly black). Lightness is clamped to min 5%.
 * @returns Darkened hex color in "#RRGGBB" format, or the original input if invalid.
 */
export function darkenColor(hex: string, amount: number): string {
  const normalized = normalizeHex(hex)
  if (!normalized) return hex

  const [r, g, b] = hexToRgb(normalized)
  const [h, s, l] = rgbToHsl(r, g, b)

  const newL = Math.max(0.05, l * (1 - Math.max(0, Math.min(1, amount))))
  const [nr, ng, nb] = hslToRgb(h, s, newL)

  return rgbToHex(nr, ng, nb)
}

/**
 * Return a high-contrast text color for a given background.
 *
 * Uses the WCAG relative luminance formula to decide between light and dark text.
 *
 * @param hex - Background color in "#RRGGBB", "#RGB", or "RRGGBB" format
 * @returns "#ffffff" for dark backgrounds, "#000000" for light backgrounds.
 *          Returns "#000000" if the input is invalid.
 */
export function contrastText(hex: string): string {
  const normalized = normalizeHex(hex)
  if (!normalized) return "#000000"

  const [r, g, b] = hexToRgb(normalized)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance > 0.55 ? "#000000" : "#ffffff"
}
