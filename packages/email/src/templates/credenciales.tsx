import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface CredencialesProps {
  businessName: string
  adminName: string
  email: string
  password: string
  loginUrl: string
}

export function Credenciales({
  businessName,
  adminName,
  email,
  password,
  loginUrl,
}: CredencialesProps) {
  return (
    <EmailLayout preview={`Tus credenciales de acceso para ${businessName}`}>
      <Text style={heading}>Tus credenciales de acceso</Text>
      <Text style={paragraph}>
        Hola {adminName}, estas son tus credenciales actualizadas para acceder al panel de{" "}
        <strong>{businessName}</strong> en Cuik.
      </Text>

      <Section style={credentialsBox}>
        <Text style={credentialLabel}>Email</Text>
        <Text style={credentialValue}>{email}</Text>
        <Text style={credentialLabel}>Contraseña</Text>
        <Text style={credentialValue}>{password}</Text>
      </Section>

      <Text style={warningText}>Te recomendamos cambiar tu contraseña después de ingresar.</Text>

      <Section style={ctaSection}>
        <Link href={loginUrl} style={ctaButton}>
          Ingresar al panel
        </Link>
      </Section>
    </EmailLayout>
  )
}

Credenciales.PreviewProps = {
  businessName: "Café del Centro",
  adminName: "María",
  email: "maria@cafedelcentro.com",
  password: "tmp-Kx9mPq2r",
  loginUrl: "https://app.cuik.org/login",
} satisfies CredencialesProps

export default Credenciales

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

const credentialsBox: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 16px 0",
}

const credentialLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "8px 0 2px 0",
}

const credentialValue: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#18181b",
  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
  margin: "0 0 4px 0",
}

const warningText: React.CSSProperties = {
  fontSize: "13px",
  color: "#a16207",
  backgroundColor: "#fefce8",
  border: "1px solid #fde68a",
  borderRadius: "6px",
  padding: "10px 16px",
  margin: "0 0 24px 0",
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
