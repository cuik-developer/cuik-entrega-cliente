/**
 * Turns what the POS says about a product into the keys the audiences use:
 * species ("perro" / "gato") and a category key such as "gato:alimento_humedo",
 * "perro:snacks", "gato:arenas", "perro:antipulgas". The merchant's product
 * master (category / class / subclass) wins; the Odoo category path
 * ("All / Vendibles / Gatos / Alimento / Alimento humedo") is the fallback.
 */

export type Species = "perro" | "gato"

export type ProductClass = {
  species: Species | null
  /** Group inside the species ("alimento", "alimento_prescripcion", "arenas_y_mas", "cuidado_e_higiene", …). */
  group: string | null
  /** Leaf ("alimento_humedo", "snacks", "arenas", "antipulgas", …). */
  sub: string | null
}

export type LineClassInput = {
  odooCategory: string | null
  masterCategory?: string | null
  masterClass?: string | null
  masterSubclass?: string | null
  productName?: string | null
}

/** Lower-case, no accents, spaces and punctuation as "_". */
export function slugify(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return s || null
}

function speciesOf(text: string | null | undefined): Species | null {
  const s = slugify(text)
  if (!s) return null
  if (/(^|_)(perro|perros|dog|dogs|canino)(_|$)/.test(s)) return "perro"
  if (/(^|_)(gato|gatos|cat|cats|felino)(_|$)/.test(s)) return "gato"
  return null
}

/** "All / Vendibles / Gatos / Alimento / Alimento humedo" → { gato, alimento, alimento_humedo }. */
export function classifyOdooCategory(path: string | null | undefined): ProductClass {
  if (!path) return { species: null, group: null, sub: null }
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && !/^(all|vendibles|todos|productos)$/i.test(p))
  const speciesIdx = parts.findIndex((p) => speciesOf(p))
  if (speciesIdx < 0) {
    // No species segment: keep the deepest two levels as group/sub.
    const sub = slugify(parts[parts.length - 1])
    const group = parts.length > 1 ? slugify(parts[parts.length - 2]) : sub
    return { species: null, group, sub }
  }
  const species = speciesOf(parts[speciesIdx])
  const group = slugify(parts[speciesIdx + 1]) ?? null
  const sub = slugify(parts[speciesIdx + 2]) ?? group
  return { species, group, sub }
}

/** Master first (category = species or group, class = group, subclass = leaf), then the Odoo path. */
export function classifyLine(line: LineClassInput): ProductClass {
  const hasMaster = Boolean(line.masterCategory || line.masterClass || line.masterSubclass)
  if (hasMaster) {
    const species =
      speciesOf(line.masterCategory) ?? speciesOf(line.masterClass) ?? speciesOf(line.odooCategory)
    const group = speciesOf(line.masterCategory)
      ? slugify(line.masterClass)
      : (slugify(line.masterCategory) ?? slugify(line.masterClass))
    const sub = slugify(line.masterSubclass) ?? slugify(line.masterClass) ?? group
    if (group || sub) return { species, group, sub }
  }
  return classifyOdooCategory(line.odooCategory)
}

/** "gato:alimento_humedo"; null when nothing usable. Species-less keys are ":snacks". */
export function categoryKey(c: ProductClass): string | null {
  const leaf = c.sub ?? c.group
  if (!leaf) return null
  return `${c.species ?? ""}:${leaf}`
}

export function speciesOfKey(key: string): Species | null {
  const s = key.split(":")[0]
  return s === "perro" || s === "gato" ? s : null
}

export function leafOfKey(key: string): string {
  return key.slice(key.indexOf(":") + 1)
}

/** Families the audiences reason about, matched on the leaf of the key. */
export const LEAF = {
  dry: /^alimento_seco|seco$|^seco_/,
  wet: /humedo|^latas?$|^lata_|pouch/,
  snacks: /snack|premio|galleta|topping/,
  litter: /arena/,
  fleas: /antipulga|antiparasit|garrapat|desparasit/,
  /** Any food, dry or wet, regular or prescription. */
  food: /alimento|seco|humedo|lata|pouch|croqueta/,
} as const

export function leafIs(key: string, family: keyof typeof LEAF): boolean {
  return LEAF[family].test(leafOfKey(key))
}

/**
 * Brand from the product name as Odoo at Mascota Veloz writes it:
 * "Monge Fresh Lata 100 g (MONGE)" → "Monge". Falls back to null.
 */
export function brandOf(productName: string | null | undefined): string | null {
  if (!productName) return null
  const m = productName.match(/\(([^()]{2,40})\)\s*$/)
  if (!m) return null
  const raw = m[1].trim()
  // Skip sizes and variants in parentheses: "(10 LT)", "(3 KG)", "(x12)".
  if (/^\d|^x\s?\d|kg$|gr?$|lt$|ml$|oz$|un$/i.test(raw)) return null
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ")
    .replace(/'S\b/g, "'s")
}
