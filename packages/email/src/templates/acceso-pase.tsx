import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface AccesoPaseProps {
  clientName: string
  organizationName: string
  accessLink: string
}

export function AccesoPase({ clientName, organizationName, accessLink }: AccesoPaseProps) {
  return (
    <EmailLayout preview={`Accedé a tu pase de ${organizationName}`}>
      <Text style={heading}>Tu pase de fidelización</Text>
      <Text style={paragraph}>
        Hola {clientName}, accedé a tu pase digital de <strong>{organizationName}</strong> haciendo
        click en el botón de abajo.
      </Text>

      <Section style={ctaSection}>
        <Link href={accessLink} style={ctaButton}>
          Ver mi pase
        </Link>
      </Section>

      <Section style={infoBox}>
        <Text style={infoText}>
          Desde ahí vas a poder agregarlo a tu Apple Wallet o Google Wallet.
        </Text>
      </Section>

      <Text style={footerNote}>
        Este enlace es válido por 24 horas. Si expiró, puedes solicitar uno nuevo desde la página de
        registro.
      </Text>

      <Text style={disclaimerText}>Si no solicitaste esto, puedes ignorar este email.</Text>
    </EmailLayout>
  )
}

AccesoPase.PreviewProps = {
  clientName: "Juan",
  organizationName: "Café del Centro",
  accessLink: "https://app.cuik.org/pase/abc123",
} satisfies AccesoPaseProps

export default AccesoPase

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

const footerNote: React.CSSProperties = {
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
