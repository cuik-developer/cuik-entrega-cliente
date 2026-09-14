import { Link, Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

/**
 * Weekly / monthly report to a business. Content-agnostic on purpose: the
 * server computes every number and sentence, this template only lays it out,
 * so the same component renders the weekly and the monthly (with its
 * all-time section) reports.
 */

export interface ReportKpiProps {
  label: string
  value: number
  /** "▲ 14 % · antes 37" */
  deltaText: string
  direction: "up" | "down" | "flat"
}

export interface ReportSectionProps {
  title: string
  items: string[]
  /** Optional link rendered after the list (e.g. "Crear campaña para clientes en riesgo"). */
  link?: { label: string; href: string }
}

export interface ReportePeriodicoProps {
  businessName: string
  /** "Tu semana en Mascota Veloz" / "Setiembre en Mascota Veloz" */
  heading: string
  /** "Lunes 7 al domingo 13 de setiembre de 2026 · comparado con la semana anterior" */
  periodLine: string
  preview: string
  kpis: ReportKpiProps[]
  sections: ReportSectionProps[]
  panelUrl: string
  attachmentName: string
  /** Where the recipient can change or turn off the report. */
  settingsHint: string
}

export function ReportePeriodico({
  heading,
  periodLine,
  preview,
  kpis,
  sections,
  panelUrl,
  attachmentName,
  settingsHint,
}: ReportePeriodicoProps) {
  return (
    <EmailLayout preview={preview}>
      <Text style={h1}>{heading}</Text>
      <Text style={period}>{periodLine}</Text>

      <Section style={kpiRow}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              {kpis.map((k) => (
                <td key={k.label} style={kpiCell}>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>{k.label}</div>
                    <div style={kpiValue}>{k.value}</div>
                    <div style={{ ...kpiDelta, ...deltaStyle(k.direction) }}>{k.deltaText}</div>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Section>

      {sections.map((s) => (
        <Section key={s.title} style={block}>
          <Text style={h2}>{s.title}</Text>
          {s.items.length === 0 ? (
            <Text style={muted}>Nada que reportar en este período.</Text>
          ) : (
            <ul style={list}>
              {s.items.map((item) => (
                <li key={item} style={listItem}>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {s.link && (
            <Link href={s.link.href} style={inlineLink}>
              {s.link.label} →
            </Link>
          )}
        </Section>
      ))}

      <Section style={{ margin: "20px 0 8px" }}>
        <Link href={panelUrl} style={ctaButton}>
          Ver el panel completo
        </Link>
      </Section>

      <Section style={attach}>
        <Text style={attachText}>
          📎 Adjunto: <strong>{attachmentName}</strong> — el detalle de todo lo de arriba, sin datos
          de contacto.
        </Text>
      </Section>

      <Text style={footnote}>{settingsHint}</Text>
    </EmailLayout>
  )
}

ReportePeriodico.PreviewProps = {
  businessName: "Mascota Veloz",
  heading: "Tu semana en Mascota Veloz",
  periodLine: "Lunes 7 al domingo 13 de setiembre de 2026 · comparado con la semana anterior",
  preview: "9 clientes nuevos, 4 premios canjeados y 2 cumpleaños esta semana",
  kpis: [
    { label: "Visitas", value: 42, deltaText: "▲ +14 % · antes 37", direction: "up" },
    { label: "Clientes nuevos", value: 9, deltaText: "▲ +3 · antes 6", direction: "up" },
    { label: "Premios canjeados", value: 4, deltaText: "▼ -20 % · antes 5", direction: "down" },
  ],
  sections: [
    {
      title: "Lo que pasó",
      items: [
        "El día más fuerte fue el sábado 12 con 11 visitas. El más flojo, el martes 8 con 2.",
        "31 clientes distintos te visitaron; 6 de ellos vinieron dos veces o más.",
      ],
    },
    {
      title: "Para actuar esta semana",
      items: [
        "6 clientes en riesgo: solían venir y llevan más de 30 días sin pasar. Recomendación: envíales una campaña push con un motivo para volver.",
      ],
      link: {
        label: "Crear campaña para clientes en riesgo",
        href: "https://cuik.org/panel/campanas",
      },
    },
  ],
  panelUrl: "https://cuik.org/panel",
  attachmentName: "mascota-veloz-semana-2026-09-07.xlsx",
  settingsHint:
    "Recibes este correo porque el reporte semanal está activado en Campañas → Automatizaciones. Podés cambiar el día, la hora o desactivarlo desde ahí.",
} satisfies ReportePeriodicoProps

export default ReportePeriodico

// --- Styles ---

function deltaStyle(direction: ReportKpiProps["direction"]): React.CSSProperties {
  if (direction === "up") return { color: "#047857", backgroundColor: "#ecfdf5" }
  if (direction === "down") return { color: "#b91c1c", backgroundColor: "#fef2f2" }
  return { color: "#52525b", backgroundColor: "#f4f4f5" }
}

const h1: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 800,
  color: "#18181b",
  margin: "0 0 4px 0",
}

const period: React.CSSProperties = {
  fontSize: "14px",
  color: "#71717a",
  margin: "0 0 18px 0",
}

const kpiRow: React.CSSProperties = { margin: "0 0 8px 0" }

const kpiCell: React.CSSProperties = { width: "33%", padding: "0 4px", verticalAlign: "top" }

const kpiBox: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: "10px",
  padding: "12px 12px 10px",
}

const kpiLabel: React.CSSProperties = { fontSize: "12px", color: "#a1a1aa", fontWeight: 600 }

const kpiValue: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: 800,
  color: "#18181b",
  lineHeight: "32px",
}

const kpiDelta: React.CSSProperties = {
  display: "inline-block",
  fontSize: "12px",
  fontWeight: 600,
  padding: "1px 7px",
  borderRadius: "999px",
  marginTop: "2px",
}

const block: React.CSSProperties = {
  borderTop: "1px solid #e4e4e7",
  padding: "14px 0 6px",
}

const h2: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#18181b",
  margin: "0 0 6px 0",
}

const list: React.CSSProperties = { margin: 0, paddingLeft: "18px" }

const listItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#3f3f46",
  margin: "2px 0",
}

const muted: React.CSSProperties = { fontSize: "14px", color: "#a1a1aa", margin: 0 }

const inlineLink: React.CSSProperties = {
  display: "inline-block",
  marginTop: "6px",
  fontSize: "14px",
  fontWeight: 600,
  color: "#0e70db",
  textDecoration: "none",
}

const ctaButton: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#0e70db",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700,
  padding: "12px 20px",
  borderRadius: "10px",
  textDecoration: "none",
}

const attach: React.CSSProperties = {
  border: "1px dashed #d4d4d8",
  borderRadius: "10px",
  padding: "10px 12px",
  margin: "12px 0 0",
}

const attachText: React.CSSProperties = { fontSize: "13px", color: "#52525b", margin: 0 }

const footnote: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  margin: "18px 0 0",
  lineHeight: "18px",
}
