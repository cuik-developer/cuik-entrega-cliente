import { Section, Text } from "@react-email/components"

import { EmailLayout } from "../components/layout"

export interface RewardCanjeadoProps {
  clientName: string
  businessName: string
  rewardDescription: string
  redeemDate: string
}

export function RewardCanjeado({
  clientName,
  businessName,
  rewardDescription,
  redeemDate,
}: RewardCanjeadoProps) {
  return (
    <EmailLayout preview={`¡Canjeaste tu premio en ${businessName}!`}>
      <Text style={heading}>¡Felicitaciones, {clientName}!</Text>
      <Text style={paragraph}>
        Canjeaste un premio en <strong>{businessName}</strong>. Acá están los detalles:
      </Text>

      <Section style={rewardBox}>
        <Text style={rewardIcon}>🎉</Text>
        <Text style={rewardTitle}>{rewardDescription}</Text>
        <Text style={rewardDate}>Canjeado el {redeemDate}</Text>
      </Section>

      <Section style={messageBox}>
        <Text style={messageText}>
          ¡Seguí acumulando sellos para desbloquear más premios! Cada visita te acerca a tu próxima
          recompensa.
        </Text>
      </Section>
    </EmailLayout>
  )
}

RewardCanjeado.PreviewProps = {
  clientName: "Juan",
  businessName: "Café del Centro",
  rewardDescription: "Café con leche gratis",
  redeemDate: "13 de marzo de 2026",
} satisfies RewardCanjeadoProps

export default RewardCanjeado

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

const rewardBox: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: "8px",
  padding: "24px",
  margin: "0 0 24px 0",
  textAlign: "center" as const,
}

const rewardIcon: React.CSSProperties = {
  fontSize: "40px",
  margin: "0 0 8px 0",
}

const rewardTitle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#c2410c",
  margin: "0 0 8px 0",
}

const rewardDate: React.CSSProperties = {
  fontSize: "13px",
  color: "#9a3412",
  margin: 0,
}

const messageBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "16px 20px",
}

const messageText: React.CSSProperties = {
  fontSize: "14px",
  color: "#52525b",
  lineHeight: "22px",
  margin: 0,
}
