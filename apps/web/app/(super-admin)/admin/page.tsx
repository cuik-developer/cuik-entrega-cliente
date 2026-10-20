import { redirect } from "next/navigation"
import { NoAccess } from "@/components/admin/admin-access"
import { currentAdminAccess } from "@/lib/admin-access"
import { adminLandingHref } from "@/lib/staff-permissions"

export const dynamic = "force-dynamic"

/**
 * "/admin" has no screen of its own: the owner lands on Tenants (the
 * breadcrumbs' "Inicio"), Equipo Cuik staff on the first section they hold.
 */
export default async function AdminHome() {
  const { access } = await currentAdminAccess()
  const landing = adminLandingHref(access)
  if (landing) redirect(landing)
  return <NoAccess access={access} />
}
