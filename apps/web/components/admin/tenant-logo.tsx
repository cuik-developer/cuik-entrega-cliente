import { cn } from "@/lib/utils"

export type TenantBranding = { logoUrl?: string | null; primaryColor?: string | null }

/** The tenant's logo from its branding, or its initial on the primary color. */
export function TenantLogo({
  branding,
  name,
  className = "w-9 h-9 text-[13px]",
}: {
  branding: unknown
  name: string
  /** Size and font size, e.g. "w-6 h-6 text-[11px]". */
  className?: string
}) {
  const b = (branding ?? {}) as TenantBranding
  const bg = b.primaryColor && /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : "#0b5fc0"
  // Only https or same-origin paths: branding is stored as free text.
  const logo = b.logoUrl && /^(https:\/\/|\/(?!\/))/i.test(b.logoUrl) ? b.logoUrl : null
  if (logo) {
    return (
      // biome-ignore lint/performance/noImgElement: tenant-uploaded logo of unknown size, no Next image domain config
      <img
        src={logo}
        referrerPolicy="no-referrer"
        alt={`Logo de ${name}`}
        className={cn(
          "rounded-[3px] object-contain bg-ent-panel-2 border border-ent-line shrink-0",
          className,
        )}
      />
    )
  }
  return (
    <div
      className={cn(
        "rounded-[3px] flex items-center justify-center text-white font-semibold shrink-0",
        className,
      )}
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  )
}
