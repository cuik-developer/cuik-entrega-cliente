"use client"

import { Lock } from "lucide-react"
import Link from "next/link"
import { createContext, useContext } from "react"
import { Panel, PanelMessage } from "@/components/admin/enterprise"
import {
  type AdminAccess,
  adminLandingHref,
  canAccess,
  type StaffPermission,
} from "@/lib/staff-permissions"

/**
 * Who is using the super-admin shell (owner or Equipo Cuik staff), provided
 * by the server layout. UI only: every API and server action checks again.
 * Defaults to "none" so a page rendered outside the shell shows nothing extra.
 */
const AdminAccessContext = createContext<AdminAccess>({ kind: "none" })

export function AdminAccessProvider({
  access,
  children,
}: {
  access: AdminAccess
  children: React.ReactNode
}) {
  return <AdminAccessContext.Provider value={access}>{children}</AdminAccessContext.Provider>
}

export function useAdminAccess(): AdminAccess {
  return useContext(AdminAccessContext)
}

/** Shorthand: may the current user use `permission` (owner always can)? */
export function useCan(permission?: StaffPermission | readonly StaffPermission[]): boolean {
  return canAccess(useAdminAccess(), permission ?? null)
}

/** Friendly page shown to staff on a section they were not granted. */
export function NoAccess({ access }: { access?: AdminAccess }) {
  const ctx = useAdminAccess()
  const landing = adminLandingHref(access ?? ctx)
  return (
    <Panel className="max-w-xl">
      <PanelMessage>
        <Lock className="w-5 h-5" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-ent-fg">
          No tienes acceso a esta sección
        </span>
        <span>
          Si la necesitas, pídele al dueño de Cuik que te dé el permiso desde Equipo Cuik.
        </span>
        {landing && (
          <Link href={landing} className="text-[12.5px] text-ent-accent hover:underline">
            Ir a mis secciones
          </Link>
        )}
      </PanelMessage>
    </Panel>
  )
}
