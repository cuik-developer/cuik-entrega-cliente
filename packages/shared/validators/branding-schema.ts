import { z } from "zod"

// ── Hex color validator ──────────────────────────────────────────────
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (#RRGGBB)")

// ── Tenant branding schema ──────────────────────────────────────────
export const tenantBrandingSchema = z.object({
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoUrl: z.string().min(1).nullable().default(null),
  /** Square mark (isotipo) for small spots such as the panel top bar; the logo is used when absent. */
  iconUrl: z.string().min(1).nullable().default(null),
})

export type TenantBranding = z.infer<typeof tenantBrandingSchema>
