import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface MensajePersonalizadoProps {
  /** Preview line (inbox snippet). */
  preview: string
  /** Optional headline above the paragraphs. */
  heading?: string
  /** Body paragraphs, already rendered (no {{vars}} left). Line breaks inside a paragraph are kept. */
  paragraphs: string[]
  /** Credentials box (approval mails). */
  credentials?: { email: string; password: string }
  /** Call to action button. */
  cta?: { label: string; url: string }
}

/**
 * Generic transactional email whose text the super-admin edits in
 * Configuracion → Correos de solicitudes. Keeps the Cuik layout, so editing
 * the copy never breaks the design.
 */
export function MensajePersonalizado({
  preview,
  heading,
  paragraphs,
  credentials,
  cta,
}: MensajePersonalizadoProps) {
  return (
    <EmailLayout preview={preview}>
      {heading && <Text style={headingStyle}>{heading}</Text>}
      {paragraphs.map((p, i) => (
        <Text key={`${i}-${p.slice(0, 12)}`} style={paragraph}>
          {p.split("\n").map((line, j) => (
            <span key={`${j}-${line.slice(0, 8)}`}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </Text>
      ))}

      {credentials && (
        <Section style={credentialsBox}>
          <Text style={credentialsTitle}>Tus credenciales de acceso</Text>
          <Text style={credentialLabel}>Email</Text>
          <Text style={credentialValue}>{credentials.email}</Text>
          <Text style={credentialLabel}>Contraseña temporal</Text>
          <Text style={credentialValue}>{credentials.password}</Text>
        </Section>
      )}

      {cta && (
        <Section style={ctaSection}>
          <Link href={cta.url} style={ctaButton}>
            {cta.label}
          </Link>
        </Section>
      )}
    </EmailLayout>
  )
}

MensajePersonalizado.PreviewProps = {
  preview: "Tu cuenta está lista",
  heading: "¡Bienvenido a Cuik!",
  paragraphs: ["Hola María, tu cuenta para Café del Centro ya está activa."],
  credentials: { email: "maria@cafedelcentro.pe", password: "cuik-a1b2c3d4" },
  cta: { label: "Ingresar al panel", url: "https://cuik.org/login" },
} satisfies MensajePersonalizadoProps

const headingStyle = {
  fontSize: "24px",
  fontWeight: "700" as const,
  color: "#0f172a",
  margin: "0 0 16px",
}

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#334155",
  margin: "0 0 16px",
}

const credentialsBox = {
  backgroundColor: "#f1f5f9",
  borderRadius: "12px",
  padding: "16px 20px",
  margin: "8px 0 16px",
}

const credentialsTitle = {
  fontSize: "13px",
  fontWeight: "700" as const,
  color: "#0f172a",
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
}

const credentialLabel = {
  fontSize: "12px",
  color: "#64748b",
  margin: "0 0 2px",
}

const credentialValue = {
  fontSize: "15px",
  fontWeight: "600" as const,
  color: "#0f172a",
  margin: "0 0 10px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
}

const ctaSection = {
  textAlign: "center" as const,
  margin: "8px 0 16px",
}

const ctaButton = {
  display: "inline-block",
  backgroundColor: "#0e70db",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600" as const,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "10px",
}
