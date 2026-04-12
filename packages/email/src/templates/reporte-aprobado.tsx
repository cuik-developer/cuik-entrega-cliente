import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface ReporteAprobadoProps {
  taskTitle: string
  summary: string
  downloadUrl: string
  tenantName: string
}

export function ReporteAprobado({
  taskTitle,
  summary,
  downloadUrl,
  tenantName,
}: ReporteAprobadoProps) {
  return (
    <EmailLayout preview={`Reporte aprobado: ${taskTitle}`}>
      <Text style={heading}>Reporte aprobado</Text>
      <Text style={paragraph}>
        El reporte <strong>{taskTitle}</strong> para {tenantName} ha sido revisado y aprobado.
      </Text>

      {summary && (
        <Section style={summaryBox}>
          <Text style={summaryLabel}>Resumen del analisis</Text>
          <Text style={summaryText}>{summary}</Text>
        </Section>
      )}

      <Section style={ctaSection}>
        <Link href={downloadUrl} style={ctaButton}>
          Descargar Reporte
        </Link>
      </Section>

      <Text style={footerNote}>
        Este reporte fue generado automaticamente por el agente Data de Cuik Office.
      </Text>
    </EmailLayout>
  )
}

ReporteAprobado.PreviewProps = {
  taskTitle: "Reporte semanal de fidelizacion",
  summary:
    "El negocio muestra un crecimiento del 12% en visitas esta semana. La retencion se mantiene estable en 45%. Se detectaron 3 clientes inactivos que requieren atencion.",
  downloadUrl: "https://storage.cuik.org/office/reports/example.xlsx",
  tenantName: "Mascota Veloz",
} satisfies ReporteAprobadoProps

export default ReporteAprobado

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

const summaryBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 24px 0",
}

const summaryLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 8px 0",
}

const summaryText: React.CSSProperties = {
  fontSize: "14px",
  color: "#3f3f46",
  lineHeight: "22px",
  margin: 0,
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "8px 0 24px 0",
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
  fontSize: "12px",
  color: "#a1a1aa",
  textAlign: "center" as const,
  margin: "0",
}
