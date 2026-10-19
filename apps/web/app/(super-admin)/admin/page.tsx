import { redirect } from "next/navigation"

/** "/admin" has no screen of its own: the breadcrumbs' "Inicio" lands on Tenants. */
export default function AdminHome() {
  redirect("/admin/tenants")
}
