import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { ReglasClient } from "./reglas-client"

export const dynamic = "force-dynamic"

/** Growth › Reglas por comercio: what decides whom to suggest, when, how a sale is attributed and what is billed. Owner-only. */
export default async function ReglasPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")
  return <ReglasClient />
}
