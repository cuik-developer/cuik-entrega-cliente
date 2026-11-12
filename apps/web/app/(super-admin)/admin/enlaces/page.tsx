import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { EnlacesClient } from "./enlaces-client"

export const dynamic = "force-dynamic"

/**
 * Loyalty › Operación › Validación de enlaces: before each month's close,
 * the stamps without a POS sale and the inferred links, to fix by hand so
 * the registration rate of the corte is honest. Owner-only.
 */
export default async function EnlacesPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")
  return <EnlacesClient />
}
