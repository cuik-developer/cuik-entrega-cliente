import type { Species } from "./categories"
import { WEEKDAY_NAMES } from "./dates"

/**
 * Message templates per audience and how they are resolved. Variables are
 * written as {nombre}; a sentence whose variable has no value is dropped
 * whole, so "a Sparky ya se le debe estar acabando su Hill's 7 kg" works for
 * clients with a pet name and "a tu perro…" for the rest.
 */

export type TemplateKey =
  | "recompra"
  | "en_riesgo"
  | "antipulgas"
  | "cross_arena"
  | "cross_snacks"
  | "cross_humedo"
  | "cross_seco"
  | "tarjeta"
  | "libre"

export type Template = { key: TemplateKey; name: string; text: string }

export const TEMPLATES: Template[] = [
  {
    key: "recompra",
    name: "Recompra: tu producto habitual",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. A {mascota} ya se le debe estar acabando su {producto}. Lo tenemos listo para este {dia_habitual}; si vienes te sumamos el sello. ¿Te lo separo?",
  },
  {
    key: "en_riesgo",
    name: "Te extrañamos (en riesgo)",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. Hace {dias} días no te vemos por acá y {mascota} ya debe estar terminando su {producto}. Lo tenemos en stock; si vienes esta semana te sumamos el sello de tu tarjeta. ¿Te lo separo?",
  },
  {
    key: "antipulgas",
    name: "Recordatorio antipulgas",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. A {mascota} ya le toca su dosis de {producto}. Lo tenemos listo; si pasas esta semana te sumamos el sello. ¿Te lo separo?",
  },
  {
    key: "cross_arena",
    name: "Cross-sell: arena para gatos",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. Para {mascota}, que come {marca}, tenemos {producto_sugerido} con precio especial esta semana. ¿Te lo separo junto con su comida?",
  },
  {
    key: "cross_snacks",
    name: "Cross-sell: snacks para perros",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. A {mascota} le encantarían los {producto_sugerido}; esta semana van con precio especial si los llevas con su {producto}. ¿Te los separo?",
  },
  {
    key: "cross_humedo",
    name: "Cross-sell: prueba el húmedo de su marca",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. Como {mascota} come {marca}, te proponemos probar su versión húmeda: {producto_sugerido}. ¿Te separo uno con su próxima compra?",
  },
  {
    key: "cross_seco",
    name: "Cross-sell: prueba el seco de su marca",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. Como {mascota} come {marca}, te proponemos probar su alimento seco: {producto_sugerido}. ¿Te separo uno con su próxima compra?",
  },
  {
    key: "tarjeta",
    name: "Tarjeta: te faltan sellos",
    text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. Te faltan {sellos_faltan} sellos para {premio}. Si vienes esta semana los completas. ¿Te esperamos?",
  },
  { key: "libre", name: "Libre", text: "Hola {nombre}, soy {cajero} de {comercio} {tienda}. " },
]

export const TEMPLATE_BY_KEY: ReadonlyMap<TemplateKey, Template> = new Map(
  TEMPLATES.map((t) => [t.key, t]),
)

export const TEMPLATE_VARIABLES = [
  "nombre",
  "cajero",
  "comercio",
  "tienda",
  "mascota",
  "producto",
  "marca",
  "dias",
  "dia_habitual",
  "producto_sugerido",
  "sellos_faltan",
  "premio",
  "precio_oferta",
] as const

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string | null>>

/**
 * "Sparky" when the client registered a pet name; otherwise "tu perro" /
 * "tu gato" by what they buy, or "tu mascota".
 */
export function petWord(petName: string | null | undefined, species: Species | null): string {
  const name = petName?.trim()
  if (name) return name
  if (species === "perro") return "tu perro"
  if (species === "gato") return "tu gato"
  return "tu mascota"
}

/** The client's pet name from the registration's strategic fields, when the merchant asks for it. */
export function petNameOf(
  customData: Record<string, unknown> | null | undefined,
  fields: { key: string; label: string }[] | null | undefined,
): string | null {
  if (!customData) return null
  const field = fields?.find((f) => /mascota|pet|engreid|peludo/i.test(`${f.key} ${f.label}`))
  const keys = field ? [field.key] : Object.keys(customData).filter((k) => /mascota|pet/i.test(k))
  for (const k of keys) {
    const v = customData[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

export function weekdayWord(weekday: number | null | undefined): string | null {
  return weekday === null || weekday === undefined ? null : WEEKDAY_NAMES[weekday]
}

const VAR = /\{([a-z_]+)\}/g
const HAS_VAR = /\{[a-z_]+\}/

/**
 * Resolves {variables}; every sentence that still has an unresolved variable
 * is dropped. Sentences end at ". ", "! ", "? " or the end of the text.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  const resolved = text.replace(VAR, (whole, key: string) => {
    const v = vars[key as keyof TemplateVars]
    return v === undefined || v === null || v === "" ? whole : v
  })
  const sentences = resolved.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [resolved]
  return sentences
    .filter((s) => !HAS_VAR.test(s))
    .map((s) => s.replace(/\s{2,}/g, " "))
    .join("")
    .trim()
}

/** Variables a template still needs after the ones the merchant can fill. */
export function unresolvedVariables(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(VAR)) out.add(m[1])
  return [...out]
}

/**
 * WhatsApp deep link with the message prefilled. Peruvian numbers: 9 digits
 * starting with 9 get the 51 country code; anything with 10 digits or more is
 * used as typed. Null when the phone is unusable.
 */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  let intl: string | null = null
  if (digits.length === 9 && digits.startsWith("9")) intl = `51${digits}`
  else if (digits.length === 11 && digits.startsWith("519")) intl = digits
  else if (digits.length >= 10 && digits.length <= 15) intl = digits
  if (!intl) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}
