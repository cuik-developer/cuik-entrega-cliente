import { NoAccess } from "@/components/admin/admin-access"
import { currentAdminAccess } from "@/lib/admin-access"
import { EquipoClient } from "./equipo-client"

export const dynamic = "force-dynamic"

/** Sistema › Equipo Cuik: owner only (staff never manage staff). */
export default async function EquipoPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") return <NoAccess access={access} />
  return <EquipoClient />
}
