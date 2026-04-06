// ─── Asset Dimensions ───────────────────────────────────────────────

export const ASSET_DIMENSIONS = {
  strip: { width: 750, height: 246 },
  logo: { width: 256, height: 256 },
  stamp: { width: 128, height: 128 },
  icon: { width: 87, height: 87 },
} as const

export type AssetType = keyof typeof ASSET_DIMENSIONS

// ─── Prompt Context ────────────────────────────────────────────────

export interface PromptContext {
  businessName: string
  businessType?: string
  primaryColor?: string
  promotionType?: "stamps" | "points"
}

// ─── Stamps Prompt Templates ────────────────────────────────────────

const STAMPS_TEMPLATES: Record<AssetType, (ctx: PromptContext) => string> = {
  strip: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    const colorHint = ctx.primaryColor
      ? `Color palette: ${ctx.primaryColor}.`
      : "Use warm, professional tones matching the business industry."
    return [
      `Create a decorative horizontal background image for a ${typeHint} digital loyalty card.`,
      `Dimensions: 750x246 pixels (wide horizontal banner).`,
      `${colorHint}`,
      `Style: elegant gradient, subtle texture, or abstract decorative pattern related to the ${typeHint} industry.`,
      `Examples of good designs: smooth color gradients with subtle motifs, bokeh effects, abstract curves, or industry-themed patterns (coffee beans pattern for cafe, geometric patterns for barber, etc).`,
      `CRITICAL: This is ONLY a background image. Do NOT draw any grid, squares, rectangles, circles, placeholders, card slots, stamp slots, or any kind of organized layout.`,
      `Do NOT include any text, letters, numbers, or words.`,
      `Do NOT use green color.`,
      `The image should be a beautiful, continuous background — not a card template.`,
    ].join(" ")
  },

  logo: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create a clean, modern logo icon for a ${typeHint} called "${ctx.businessName}".`,
      `Style: minimalist, professional, flat design. Suitable for small sizes.`,
      `Use a single recognizable symbol for the ${typeHint} industry (examples: coffee cup for cafe, scissors for barber, paw for pet shop, fork for restaurant).`,
      `256x256 pixels. Single dominant color on transparent background.`,
      `Do NOT include text or letters. Do NOT use green color.`,
    ].join(" ")
  },

  stamp: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create a simple visit stamp icon for a ${typeHint} loyalty card.`,
      `This small icon marks a "completed visit" on a digital loyalty card.`,
      `Style: clean circular stamp impression, like a rubber stamp mark.`,
      `Use a single industry-appropriate symbol inside a circle (coffee cup, paw print, scissors, etc).`,
      `128x128 pixels. Transparent background. Single color.`,
      `Do NOT use green. Keep it very simple and recognizable at small sizes.`,
    ].join(" ")
  },

  icon: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create a minimal notification icon for "${ctx.businessName}" (${typeHint}).`,
      `Bold, simple: one recognizable symbol or the first letter "${ctx.businessName[0]}" of the business name.`,
      `87x87 pixels. Single bold color on transparent background.`,
      `No text besides optionally the first letter. No green.`,
    ].join(" ")
  },
}

// ─── Points Prompt Templates ────────────────────────────────────────

const POINTS_TEMPLATES: Record<AssetType, (ctx: PromptContext) => string> = {
  strip: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    const colorHint = ctx.primaryColor
      ? `Color palette: ${ctx.primaryColor}.`
      : "Use rich, premium tones (gold accents, deep colors)."
    return [
      `Create a premium horizontal banner image for a ${typeHint} VIP rewards membership card.`,
      `Dimensions: 750x246 pixels (wide horizontal banner).`,
      `${colorHint}`,
      `Style: luxury, premium feel. Think high-end membership card, hotel loyalty program, or airline frequent flyer card.`,
      `Examples of good designs: elegant gradients with gold or metallic accents, abstract luxury patterns, silk-like textures, premium bokeh with warm tones.`,
      `This is for a POINTS-BASED rewards program — the design should feel exclusive and aspirational, not like a stamp card.`,
      `CRITICAL: Do NOT draw any grid, squares, circles, stamp slots, or organized layout elements.`,
      `Do NOT include any text, letters, numbers, or words.`,
      `Do NOT use green color.`,
      `The image should be a beautiful, continuous premium background.`,
    ].join(" ")
  },

  logo: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create an elegant, premium logo icon for a ${typeHint} called "${ctx.businessName}".`,
      `This is for a VIP points rewards program — the logo should feel exclusive and premium.`,
      `Style: minimalist, elegant, sophisticated. Think luxury brand or premium membership.`,
      `Use a refined symbol representing the ${typeHint} industry.`,
      `256x256 pixels. Single premium color (gold, dark navy, or burgundy tones) on transparent background.`,
      `Do NOT include text or letters. Do NOT use green.`,
    ].join(" ")
  },

  stamp: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create a reward point coin icon for a ${typeHint} rewards program.`,
      `This icon represents a "reward point" or "loyalty token" — not a visit stamp.`,
      `Style: sleek coin or medal design, modern and premium.`,
      `Use gold, amber, or warm metallic tones as the primary color.`,
      `128x128 pixels. Transparent background.`,
      `Think: a polished reward coin, a star badge, or a premium token.`,
      `Do NOT use green. No text.`,
    ].join(" ")
  },

  icon: (ctx) => {
    const typeHint = ctx.businessType ?? "business"
    return [
      `Create a minimal premium notification icon for "${ctx.businessName}" (${typeHint}) rewards program.`,
      `Bold, elegant: one symbol or the letter "${ctx.businessName[0]}".`,
      `87x87 pixels. Premium color (gold or dark tone) on transparent background.`,
      `No text besides optionally the first letter. No green.`,
    ].join(" ")
  },
}

// ─── Public API ─────────────────────────────────────────────────────

export function buildPrompt(assetType: AssetType, context: PromptContext): string {
  const templates = context.promotionType === "points" ? POINTS_TEMPLATES : STAMPS_TEMPLATES
  const template = templates[assetType]
  return template(context)
}
