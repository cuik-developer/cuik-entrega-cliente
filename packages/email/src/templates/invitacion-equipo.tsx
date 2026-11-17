import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface InvitacionEquipoProps {
  memberName: string
  inviteLink: string
  /** Areas the member can use, already in words ("Comercios", "Pases"...). */
  areas?: string[]
  /** Date the link stops working, already formatted ("24 de noviembre"). */
  expiresAt: string
}

/**
 * Invitation to Equipo Cuik (internal team). The link lets the person choose
 * their password; at the first sign-in they link an authenticator app.
 */
export function InvitacionEquipo({
  memberName,
  inviteLink,
  areas,
  expiresAt,
}: InvitacionEquipoProps) {
  return (
    <EmailLayout preview="Te invitaron al Equipo Cuik">
      <Text style={heading}>Hola {memberName}, te damos la bienvenida al Equipo Cuik</Text>
      <Text style={paragraph}>
        Te invitaron a trabajar en el panel interno de Cuik. Para entrar, crea tu contraseña con el
        botón de abajo.
      </Text>

      {areas && areas.length > 0 && (
        <Section style={infoBox}>
          <Text style={infoText}>
            Vas a tener acceso a: <strong>{areas.join(", ")}</strong>.
          </Text>
        </Section>
      )}

      <Section style={ctaSection}>
        <Link href={inviteLink} style={ctaButton}>
          Crear mi contraseña
        </Link>
      </Section>

      <Text style={paragraph}>
        La primera vez que entres te vamos a pedir vincular una app de autenticación (Google
        Authenticator, Microsoft Authenticator o similar) para proteger tu cuenta.
      </Text>

      <Text style={expiresText}>
        Este enlace vence el <strong>{expiresAt}</strong>. Si vence, pide que te reenvíen la
        invitación.
      </Text>

      <Text style={disclaimerText}>
        Si no esperabas esta invitación, puedes ignorar este email.
      </Text>
    </EmailLayout>
  )
}

InvitacionEquipo.PreviewProps = {
  memberName: "Diego",
  inviteLink: "https://cuik.org/api/auth/reset-password/abc123?callbackURL=%2Freset-password",
  areas: ["Pases", "Comercios"],
  expiresAt: "24 de noviembre",
} satisfies InvitacionEquipoProps

export default InvitacionEquipo

// --- Styles ---

const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#18181b",
  margin: "0 0 12px 0",
}

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  color: "#3f3f46",
  lineHeight: "24px",
  margin: "0 0 24px 0",
}

const infoBox: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px 0",
}

const infoText: React.CSSProperties = {
  fontSize: "14px",
  color: "#1e40af",
  lineHeight: "22px",
  margin: 0,
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "0 0 24px 0",
}

const ctaButton: React.CSSProperties = {
  backgroundColor: "#0e70db",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  borderRadius: "8px",
  padding: "12px 32px",
  display: "inline-block",
}

const expiresText: React.CSSProperties = {
  fontSize: "13px",
  color: "#71717a",
  lineHeight: "20px",
  margin: "0 0 16px 0",
}

const disclaimerText: React.CSSProperties = {
  fontSize: "13px",
  color: "#a1a1aa",
  lineHeight: "20px",
  margin: 0,
}
