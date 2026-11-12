import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { ConectoresClient } from "./conectores-client"

export const dynamic = "force-dynamic"

/** Growth › Conectores POS: every tenant's point-of-sale connection and product master. Owner-only. */
export default async function ConectoresPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")
  return <ConectoresClient />
}
