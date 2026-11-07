import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { requiresTwoFactor } from "@/lib/two-factor"
import { ActivarClient } from "./activar-client"

export const dynamic = "force-dynamic"

/**
 * First sign-in of a Cuik team member since 2FA became mandatory: link the
 * authenticator app. Merchants never land here; a member who already has it
 * goes straight to the admin.
 */
export default async function ActivarDosPasosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const u = session.user as { role?: string | null; twoFactorEnabled?: boolean | null }
  if (!requiresTwoFactor(u.role)) redirect("/")
  if (u.twoFactorEnabled) redirect("/admin")
  return <ActivarClient userName={session.user.name} />
}
