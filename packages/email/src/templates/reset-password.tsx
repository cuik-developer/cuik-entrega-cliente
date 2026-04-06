import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface ResetPasswordProps {
  resetLink: string
  userName?: string
}

export function ResetPassword({ resetLink, userName }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Restablecer tu contraseña — Cuik">
      <Text style={heading}>Restablecer contraseña</Text>
      <Text style={paragraph}>
        {userName ? `Hola ${userName}, r` : "R"}ecibimos una solicitud para restablecer tu
        contraseña. Hacé click en el botón de abajo para crear una nueva.
      </Text>

      <Section style={ctaSection}>
        <Link href={resetLink} style={ctaButton}>
          Restablecer contraseña
        </Link>
      </Section>

      <Section style={expiryBox}>
        <Text style={expiryText}>
          Este enlace expira en 1 hora. Si no solicitaste esto, puedes ignorar este email. Tu
          contraseña no cambiará.
        </Text>
      </Section>
    </EmailLayout>
  )
}

ResetPassword.PreviewProps = {
  resetLink: "https://app.cuik.org/reset-password?token=abc123",
  userName: "María",
} satisfies ResetPasswordProps

export default ResetPassword

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

const expiryBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "16px 20px",
}

const expiryText: React.CSSProperties = {
  fontSize: "14px",
  color: "#52525b",
  lineHeight: "22px",
  margin: 0,
}
