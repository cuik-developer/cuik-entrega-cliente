import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface InvitacionCajeroProps {
  organizationName: string
  inviterName: string
  inviterEmail: string
  inviteLink: string
  expiresAt?: string
}

export function InvitacionCajero({
  organizationName,
  inviterName,
  inviterEmail,
  inviteLink,
  expiresAt,
}: InvitacionCajeroProps) {
  return (
    <EmailLayout preview={`Fuiste invitado/a a ${organizationName} como cajero/a en Cuik`}>
      <Text style={heading}>Te invitaron a unirte a {organizationName}</Text>
      <Text style={paragraph}>
        <strong>{inviterName}</strong> ({inviterEmail}) te invitó a unirte a{" "}
        <strong>{organizationName}</strong> como cajero/a en Cuik.
      </Text>

      <Section style={infoBox}>
        <Text style={infoText}>
          Como cajero/a vas a poder registrar visitas y canjear premios para los clientes del
          comercio directamente desde tu celular.
        </Text>
      </Section>

      <Section style={ctaSection}>
        <Link href={inviteLink} style={ctaButton}>
          Aceptar invitación
        </Link>
      </Section>

      {expiresAt && (
        <Text style={expiresText}>
          Esta invitación vence el <strong>{expiresAt}</strong>. Después de esa fecha vas a
          necesitar una nueva invitación.
        </Text>
      )}

      <Text style={disclaimerText}>
        Si no esperabas esta invitación, puedes ignorar este email.
      </Text>
    </EmailLayout>
  )
}

InvitacionCajero.PreviewProps = {
  organizationName: "Café del Centro",
  inviterName: "María López",
  inviterEmail: "maria@cafedelcentro.com",
  inviteLink: "https://app.cuik.org/invitacion/abc123",
  expiresAt: "20 de marzo de 2026",
} satisfies InvitacionCajeroProps

export default InvitacionCajero

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
