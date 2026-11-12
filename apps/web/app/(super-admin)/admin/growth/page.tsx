import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { GrowthClient } from "./growth-client"

export const dynamic = "force-dynamic"

/**
 * Growth › Comercios: who has POS data, what was sent, what sale was
 * attributed and what Cuik bills, per tenant. Owner-only (client data and
 * terms of every tenant).
 */
export default async function GrowthAdminPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")
  return <GrowthClient />
}
