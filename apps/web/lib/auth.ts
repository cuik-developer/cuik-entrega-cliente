import {
  account,
  db,
  eq,
  invitation,
  member,
  organization as organizationTable,
  session,
  user,
  verification,
} from "@cuik/db"
import { InvitacionCajero, ResetPassword, sendEmail } from "@cuik/email"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import { admin, organization } from "better-auth/plugins"
import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access"
import {
  decideOrganizationRequest,
  decideSignUp,
  type GuardDecision,
  INVITATION_HEADER,
  isInvitedHttpSignUp,
  needsRoleForOrganizationPath,
  SIGN_UP_PATH,
  updatesOrganizationSlug,
} from "./auth-guards"

const trustedOrigins = process.env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()) ?? []

// Better Auth admin plugin roles: only "super_admin" gets the platform
// statements (list/ban/impersonate users); "admin" (merchant) and "user" get none.
const adminAccess = createAccessControl(defaultStatements)
const platformAdminRole = adminAccess.newRole(adminAc.statements)
const plainUserRole = adminAccess.newRole(userAc.statements)

function enforce(decision: GuardDecision) {
  if (!decision.allow) {
    throw new APIError(decision.status, { code: decision.code, message: decision.message })
  }
}

async function findInvitation(id: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(eq(invitation.id, id))
    .limit(1)
  return row ?? null
}

/**
 * Guard for HTTP calls to /api/auth/*. Only requests that came through the
 * router carry `ctx.request`; server-side `auth.api.*` calls from our own code
 * (solicitud approval, Equipo Cuik, cajeros/actions) skip it and apply their
 * own rules. Decisions live in lib/auth-guards.ts (unit-tested).
 */
const httpGuard = createAuthMiddleware(async (ctx) => {
  if (!ctx.request) return

  if (ctx.path === SIGN_UP_PATH) {
    const invitationId = ctx.headers?.get(INVITATION_HEADER)?.trim().slice(0, 128) || null
    const found = invitationId ? await findInvitation(invitationId) : null
    enforce(
      decideSignUp({
        email: (ctx.body as { email?: unknown } | undefined)?.email,
        invitationId,
        invitation: found,
        now: new Date(),
      }),
    )
    return
  }

  if (needsRoleForOrganizationPath(ctx.path)) {
    const current = await getSessionFromCtx(ctx)
    const role = (current?.user as { role?: string | null } | undefined)?.role
    enforce(decideOrganizationRequest(ctx.path, role))
  }
})

export const auth = betterAuth({
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
      organization: organizationTable,
      member,
      invitation,
    },
  }),
  hooks: { before: httpGuard },
  databaseHooks: {
    user: {
      create: {
        // A public sign-up only gets here with a matching invitation (httpGuard):
        // opening the invite link proved access to the inbox.
        async before(newUser, ctx) {
          if (isInvitedHttpSignUp(ctx)) return { data: { ...newUser, emailVerified: true } }
        },
      },
    },
  },
  emailAndPassword: {
    // A reset proves the inbox: end every other session of that account, so a
    // session opened by whoever registered the address first does not survive.
    revokeSessionsOnPasswordReset: true,
    enabled: true,
    // The reset link went to that inbox: the address is proven.
    async onPasswordReset({ user: resetUser }) {
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, resetUser.id))
    },
    async sendResetPassword({ user, url }) {
      // Fire-and-forget: don't await to prevent timing attacks
      void sendEmail({
        to: user.email,
        subject: "Restablecer contraseña — Cuik",
        template: ResetPassword({
          resetLink: url,
          userName: user.name,
        }),
      })
        .then((result) => {
          if ("error" in result) {
            console.error("[sendResetPassword] Failed:", result.error)
          }
        })
        .catch((err) => {
          console.error("[sendResetPassword] Error:", err)
        })
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  plugins: [
    organization({
      // Only super-admins create organizations (tenants come from Solicitudes);
      // otherwise any user could create one and become "owner" of something.
      allowUserToCreateOrganization: async (u) => u.role === "super_admin",
      // Tenants and organizations are linked by slug: deleting an organization
      // or changing its slug through Better Auth would orphan the tenant.
      // Slug changes go through PATCH /api/admin/tenants/[id] instead.
      disableOrganizationDeletion: true,
      // Only verified emails accept invitations (an invited sign-up and a
      // password reset verify the address).
      requireEmailVerificationOnInvitation: true,
      organizationHooks: {
        async beforeUpdateOrganization({ organization: data }) {
          if (updatesOrganizationSlug(data as Record<string, unknown>)) {
            throw new APIError("FORBIDDEN", {
              code: "ORGANIZATION_SLUG_LOCKED",
              message: "El slug se cambia desde el comercio en el panel de Cuik.",
            })
          }
        },
      },
      async sendInvitationEmail(data) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        const inviteLink = `${baseUrl}/accept-invitation/${data.id}`
        const expiresDate = data.invitation.expiresAt ? new Date(data.invitation.expiresAt) : null
        const expiresAt =
          expiresDate && !Number.isNaN(expiresDate.getTime())
            ? expiresDate.toLocaleDateString("es-AR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : undefined

        // Fire-and-forget: don't await to prevent timing attacks
        void sendEmail({
          to: data.email,
          subject: `Te invitaron a unirte a ${data.organization.name} — Cuik`,
          template: InvitacionCajero({
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            inviterEmail: data.inviter.user.email,
            inviteLink,
            expiresAt,
            role: data.invitation.role === "admin" ? "admin" : "member",
          }),
        })
          .then((result) => {
            if ("error" in result) {
              console.error("[sendInvitationEmail] Failed:", result.error)
            }
          })
          .catch((err) => {
            console.error("[sendInvitationEmail] Unexpected error:", err)
          })
      },
    }),
    // Platform admin API (/api/auth/admin/*) is for super-admins only; merchant
    // admins carry user.role "admin" but must not manage other users.
    admin({
      ac: adminAccess,
      roles: { super_admin: platformAdminRole, admin: plainUserRole, user: plainUserRole },
      adminRoles: ["super_admin"],
    }),
  ],
})

export type Session = typeof auth.$Infer.Session
