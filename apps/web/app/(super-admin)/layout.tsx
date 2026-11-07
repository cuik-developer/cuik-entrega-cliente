import { redirect } from "next/navigation"
import { currentAdminAccess } from "@/lib/admin-access"
import { TWO_FACTOR_SETUP_PATH, twoFactorPending } from "@/lib/two-factor"
import { SuperAdminShell } from "./super-admin-shell"

/**
 * Super-admin area: the owner (super_admin) or Equipo Cuik staff. The access
 * (role + permissions, read from the DB) feeds the menu and the per-page
 * "No tienes acceso" guard; APIs and server actions check it again.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { session, access } = await currentAdminAccess()
  if (!session) redirect("/login")
  if (access.kind === "none") redirect("/")
  // The team signs in with an authenticator app: nobody uses the admin without it.
  if (twoFactorPending(session.user)) redirect(TWO_FACTOR_SETUP_PATH)
  return <SuperAdminShell access={access}>{children}</SuperAdminShell>
}
