import {
  type AutomationsConfig,
  automationsConfigSchema,
  type CardCompleteAutomation,
  DEFAULT_CARD_COMPLETE_AUTOMATION,
} from "@cuik/shared/validators"

/** Apple Wallet truncates lock-screen notices past this. */
const MAX_PASS_MESSAGE = 150

export function getCardCompleteConfig(raw: unknown): CardCompleteAutomation {
  const parsed = automationsConfigSchema.safeParse(raw ?? {})
  const cfg: AutomationsConfig = parsed.success ? parsed.data : {}
  return { ...DEFAULT_CARD_COMPLETE_AUTOMATION, ...(cfg.cardComplete ?? {}) }
}

export type CardCompleteContext = {
  clientName: string
  tenantName: string
  /** The promotion's reward text ("Un café gratis"); empty when not set. */
  reward: string | null | undefined
}

/**
 * Fills the merchant's template: {{client.name}}, {{tenant.name}}, {{premio}}
 * (also {{reward}}). Unknown placeholders are removed. Whitespace is collapsed
 * and the result cut to the pass limit.
 */
export function renderCardCompleteMessage(template: string, ctx: CardCompleteContext): string {
  const values: Record<string, string> = {
    "client.name": ctx.clientName.trim(),
    "tenant.name": ctx.tenantName.trim(),
    premio: (ctx.reward ?? "").trim() || "tu premio",
    reward: (ctx.reward ?? "").trim() || "tu premio",
  }
  const out = template
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key] ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim()
  return out.length > MAX_PASS_MESSAGE ? `${out.slice(0, MAX_PASS_MESSAGE - 1)}…` : out
}

/**
 * The notice for a visit that just filled the last stamp, or null when the
 * automation is off. Used by the visits route in place of a milestone notice.
 */
export function cardCompleteNotice(automations: unknown, ctx: CardCompleteContext): string | null {
  const cfg = getCardCompleteConfig(automations)
  if (!cfg.enabled) return null
  const text = renderCardCompleteMessage(cfg.message, ctx)
  return text.length > 0 ? text : null
}

/**
 * True when `text` was produced by this merchant's card-complete template (for
 * any client name or reward), so a later visit can drop it from the pass the
 * way stale milestone notices are dropped.
 *
 * Strict on purpose: a false positive erases a real campaign message. The
 * template must carry real wording (a template made only of placeholders
 * would match anything), and the whole text must match, or, when the notice
 * was cut at the pass limit, its first wording must open the text.
 */
export function isCardCompleteMessage(text: string, automations: unknown): boolean {
  const cfg = getCardCompleteConfig(automations)
  const literals = cfg.message
    .trim()
    .replace(/\s+/g, " ")
    .split(/\{\{\s*[\w.]+\s*\}\}/)
  if (wordingLength(literals.join("")) < MIN_TEMPLATE_WORDING) return false

  const t = text.replace(/\s+/g, " ").trim()
  const pattern = literals
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*"))
    .join("[\\s\\S]*?")
  if (new RegExp(`^${pattern}$`).test(t)) return true

  // Cut at the 150-character limit with "…": compare the opening wording only.
  const opening = literals[0]?.trim() ?? ""
  return (
    t.endsWith("…") &&
    t.length >= MAX_PASS_MESSAGE &&
    wordingLength(opening) >= MIN_TEMPLATE_WORDING &&
    t.startsWith(opening)
  )
}

/** Letters/digits a template needs before its text can be recognised on a pass. */
const MIN_TEMPLATE_WORDING = 6

/** Letters and digits only (spaces, punctuation and emoji do not count). */
function wordingLength(s: string): number {
  return s.replace(/[^\p{L}\p{N}]/gu, "").length
}
