import { ROLE_REDIRECTS, type Role } from "@cuik/shared"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { SA_VIEW_COOKIE } from "@/lib/sa-view"

export const config = {
  runtime: "nodejs",
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, sitemap.xml, robots.txt (SEO/browser files)
     * - api/auth/* (Better Auth handles its own routes)
     * - Static file extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/" ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/contacto") ||
    pathname.startsWith("/accept-invitation")
  )
}

function isAuthPage(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  )
}

function isKnownRoutePrefix(pathname: string): boolean {
  return (
    isAuthPage(pathname) ||
    pathname.startsWith("/panel") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/cajero")
  )
}

function roleRedirect(role: Role, baseUrl: string): NextResponse {
  const redirectTo = ROLE_REDIRECTS[role] ?? "/cajero/escanear"
  return NextResponse.redirect(new URL(redirectTo, baseUrl))
}

function loginRedirect(baseUrl: string): NextResponse {
  return NextResponse.redirect(new URL("/login", baseUrl))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // "Ver como el comercio" is read-only: while the super-admin view cookie is
  // present, any non-GET call to a tenant API and any Server Action of the
  // tenant panel are refused. Super-admin routes (/api/admin, /admin), auth
  // and /api/me stay untouched. Only costs a session lookup when the cookie exists.
  const isTenantApiWrite =
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/me/")
  // Server Actions arrive as POST with a `next-action` header. They can be
  // posted to any path, so the path must not exempt them: while the view is
  // active every action is refused, super-admin ones included (exit the view,
  // through /api/admin/sa-view, to edit).
  const isServerAction = Boolean(request.headers.get("next-action"))
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    (isTenantApiWrite || isServerAction) &&
    request.cookies.get(SA_VIEW_COOKIE)
  ) {
    const saSession = await auth.api.getSession({ headers: request.headers })
    const saRole = (saSession?.user as { role?: string } | undefined)?.role
    if (saRole === "super_admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Modo solo lectura: estás viendo este comercio como super-admin.",
        },
        { status: 403 },
      )
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Tenant slugs: single-segment paths that don't match known route groups
  if (!isKnownRoutePrefix(pathname)) {
    return NextResponse.next()
  }

  const session = await auth.api.getSession({ headers: request.headers })
  const userRole = ((session?.user as { role?: string } | undefined)?.role ?? "user") as Role

  // Auth pages: redirect to dashboard if already authenticated
  if (isAuthPage(pathname)) {
    return session ? roleRedirect(userRole, request.url) : NextResponse.next()
  }

  // All remaining routes require authentication
  if (!session) {
    return loginRedirect(request.url)
  }

  // /panel/* → admin or super_admin
  if (pathname.startsWith("/panel") && userRole !== "admin" && userRole !== "super_admin") {
    return roleRedirect(userRole, request.url)
  }

  // /admin/* → super_admin, or Equipo Cuik staff: each page and API checks the
  // staff member's permissions itself (default deny), the middleware only
  // keeps everyone else out.
  if (pathname.startsWith("/admin") && userRole !== "super_admin" && userRole !== "staff") {
    return roleRedirect(userRole, request.url)
  }

  return NextResponse.next()
}
