import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface SolicitudRecibidaProps {
  businessName: string
  contactName: string
  contactEmail: string
  phone: string
  message: string
}

export function SolicitudRecibida({
  businessName,
  contactName,
  contactEmail,
  phone,
  message,
}: SolicitudRecibidaProps) {
  const adminUrl = `${process.env.BETTER_AUTH_URL ?? "https://app.cuik.org"}/admin/solicitudes`

  return (
    <EmailLayout preview={`Nueva solicitud de ${businessName}`}>
      <Text style={heading}>Nueva solicitud recibida</Text>
      <Text style={paragraph}>Se recibió una nueva solicitud de registro en la plataforma.</Text>

      <Section style={detailsBox}>
        <Text style={detailLabel}>Negocio</Text>
        <Text style={detailValue}>{businessName}</Text>

        <Text style={detailLabel}>Contacto</Text>
        <Text style={detailValue}>{contactName}</Text>

        <Text style={detailLabel}>Email</Text>
        <Text style={detailValue}>{contactEmail}</Text>

        <Text style={detailLabel}>Teléfono</Text>
        <Text style={detailValue}>{phone}</Text>

        {message && (
          <>
            <Text style={detailLabel}>Mensaje</Text>
            <Text style={detailValue}>{message}</Text>
          </>
        )}
      </Section>

      <Section style={ctaSection}>
        <Link href={adminUrl} style={ctaButton}>
          Revisar solicitud
        </Link>
      </Section>
    </EmailLayout>
  )
}

SolicitudRecibida.PreviewProps = {
  businessName: "Café del Centro",
  contactName: "María García",
  contactEmail: "maria@cafedelcentro.com",
  phone: "+54 11 1234-5678",
  message: "Nos gustaría implementar un sistema de fidelización para nuestros clientes.",
} satisfies SolicitudRecibidaProps

export default SolicitudRecibida

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

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 24px 0",
}

const detailLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "12px 0 2px 0",
}

const detailValue: React.CSSProperties = {
  fontSize: "15px",
  color: "#18181b",
  margin: "0 0 4px 0",
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "8px 0 0 0",
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
