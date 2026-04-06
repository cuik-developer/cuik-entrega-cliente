import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components"
import type { ReactNode } from "react"

interface EmailLayoutProps {
  preview: string
  children: ReactNode
}

const fontFamily =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="es">
      <Head>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerLogo}>Cuik</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerTagline}>Cuik — Fidelización Digital</Text>
            <Text style={footerText}>
              Plataforma de fidelización wallet-native para comercios en LATAM.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// --- Styles ---

const body: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily,
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
}

const header: React.CSSProperties = {
  backgroundColor: "#0e70db",
  padding: "24px 32px",
  textAlign: "center" as const,
}

const headerLogo: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: 700,
  fontFamily,
  margin: 0,
  letterSpacing: "-0.5px",
}

const content: React.CSSProperties = {
  padding: "32px",
}

const divider: React.CSSProperties = {
  borderColor: "#e4e4e7",
  borderTop: "1px solid #e4e4e7",
  margin: "0",
}

const footer: React.CSSProperties = {
  padding: "24px 32px",
  textAlign: "center" as const,
}

const footerTagline: React.CSSProperties = {
  color: "#71717a",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily,
  margin: "0 0 4px 0",
}

const footerText: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "12px",
  fontFamily,
  margin: 0,
}
