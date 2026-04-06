import {
  account,
  db,
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
import { admin, organization } from "better-auth/plugins"

const trustedOrigins = process.env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()) ?? []

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
  emailAndPassword: {
    enabled: true,
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
    admin(),
  ],
})

export type Session = typeof auth.$Infer.Session
