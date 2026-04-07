import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface CambioPaseSolicitadoProps {
  tenantName: string
  tenantSlug: string
  requestedByName: string
  requestedByEmail: string
  type: "color" | "texto" | "imagen" | "reglas" | "otro"
  message: string
  requestId: string
}

const TYPE_LABELS: Record<CambioPaseSolicitadoProps["type"], string> = {
  color: "Colores",
  texto: "Textos",
  imagen: "Imágenes",
  reglas: "Reglas",
  otro: "Otro",
}

export function CambioPaseSolicitado({
  tenantName,
  tenantSlug,
  requestedByName,
  requestedByEmail,
  type,
  message,
  requestId,
}: CambioPaseSolicitadoProps) {
  const adminUrl = `${process.env.BETTER_AUTH_URL ?? "https://app.cuik.org"}/admin/cambios-de-pase`

  return (
    <EmailLayout preview={`${tenantName} solicita cambios en su pase`}>
      <Text style={heading}>Nueva solicitud de cambios</Text>
      <Text style={paragraph}>
        Un comercio solicitó modificaciones a su tarjeta de fidelización.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailLabel}>Comercio</Text>
        <Text style={detailValue}>
          {tenantName} <span style={slugBadge}>/{tenantSlug}</span>
        </Text>

        <Text style={detailLabel}>Solicitado por</Text>
        <Text style={detailValue}>
          {requestedByName} &middot; {requestedByEmail}
        </Text>

        <Text style={detailLabel}>Tipo de cambio</Text>
        <Text style={detailValue}>{TYPE_LABELS[type]}</Text>

        <Text style={detailLabel}>Mensaje</Text>
        <Text style={messageValue}>{message}</Text>

        <Text style={detailLabel}>ID</Text>
        <Text style={mono}>{requestId}</Text>
      </Section>

      <Section style={ctaSection}>
        <Link href={adminUrl} style={ctaButton}>
          Ver en el panel
        </Link>
      </Section>
    </EmailLayout>
  )
}

CambioPaseSolicitado.PreviewProps = {
  tenantName: "Café del Centro",
  tenantSlug: "cafe-del-centro",
  requestedByName: "María García",
  requestedByEmail: "maria@cafedelcentro.com",
  type: "color",
  message:
    "Necesitamos cambiar el color principal del pase a un azul más oscuro y actualizar el logo a la nueva versión.",
  requestId: "5d3a1f2e-9c8b-4a7f-b1e2-0c4d5e6f7a8b",
} satisfies CambioPaseSolicitadoProps

export default CambioPaseSolicitado

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

const messageValue: React.CSSProperties = {
  fontSize: "15px",
  color: "#18181b",
  margin: "0 0 4px 0",
  whiteSpace: "pre-wrap" as const,
  lineHeight: "22px",
}

const slugBadge: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  marginLeft: "6px",
}

const mono: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
