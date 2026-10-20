import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"

import type { FieldSection } from "../types"

export const FIELD_SECTIONS: readonly FieldSection[] = [
  "headerFields",
  "secondaryFields",
  "backFields",
] as const

/** iOS store card limits: up to 3 header fields, 4 secondary + auxiliary combined. */
export const APPLE_MAX_HEADER_FIELDS = 3
export const APPLE_MAX_SECONDARY_AUX_FIELDS = 4

const HEX6 = /^#[0-9a-fA-F]{6}$/
const HEX3 = /^#?[0-9a-fA-F]{3}$/

export function isValidHex(value: string): boolean {
  return HEX6.test(value)
}

/**
 * "#fff" / "fff" → "#FFFFFF", "1e3a5f" → "#1e3a5f". A valid #RRGGBB is kept
 * as typed (case included); anything else is returned untouched.
 */
export function normalizeHex(value: string): string {
  const v = value.trim()
  if (HEX3.test(v)) {
    const [r, g, b] = v.replace("#", "")
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  const withHash = v.startsWith("#") ? v : `#${v}`
  return HEX6.test(withHash) ? withHash : value
}

/** Field key from a label: lowercase, accents stripped, spaces → _ */
export function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

/** Every key used across the three sections (trimmed, non-empty). */
export function allFieldKeys(fields: PassDesignConfigV2["fields"]): string[] {
  return FIELD_SECTIONS.flatMap((s) => (fields[s] ?? []).map((f) => f.key.trim())).filter(Boolean)
}

/** `base` if unused, else base_2, base_3… (empty base → "campo"). */
export function uniqueFieldKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const root = toFieldKey(base) || "campo"
  if (!used.has(root)) return root
  for (let n = 2; ; n++) {
    const candidate = `${root}_${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** Keys that appear more than once across all sections. */
export function duplicateFieldKeys(fields: PassDesignConfigV2["fields"]): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const key of allFieldKeys(fields)) {
    if (seen.has(key)) dup.add(key)
    seen.add(key)
  }
  return dup
}

const COLOR_LABELS: Record<keyof PassDesignConfigV2["colors"], string> = {
  backgroundColor: "Color de fondo",
  foregroundColor: "Color de texto",
  labelColor: "Color de labels",
}

/**
 * Copy of the config ready to be saved: colours normalised to #RRGGBB and
 * empty field keys filled with a unique key from the label. Returns the
 * problems that still block the save (invalid colour, duplicate key).
 */
export function prepareForSave(config: PassDesignConfigV2): {
  config: PassDesignConfigV2
  errors: string[]
} {
  const next = JSON.parse(JSON.stringify(config)) as PassDesignConfigV2
  const errors: string[] = []

  for (const key of Object.keys(COLOR_LABELS) as Array<keyof typeof COLOR_LABELS>) {
    next.colors[key] = normalizeHex(next.colors[key] ?? "")
    if (!isValidHex(next.colors[key])) {
      errors.push(`${COLOR_LABELS[key]}: "${config.colors[key]}" no es un color válido (#RRGGBB).`)
    }
  }

  const taken = new Set(allFieldKeys(next.fields))
  for (const section of FIELD_SECTIONS) {
    for (const field of next.fields[section] ?? []) {
      field.key = field.key.trim()
      if (!field.key) {
        field.key = uniqueFieldKey(field.label, taken)
        taken.add(field.key)
      }
    }
  }
  for (const key of duplicateFieldKeys(next.fields)) {
    errors.push(`La clave "${key}" se repite: Apple descarta los campos con clave repetida.`)
  }

  return { config: next, errors }
}
