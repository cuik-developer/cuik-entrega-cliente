"use client"

import { Panel, PanelHeader } from "@/components/admin/enterprise"
import { formatPercent, formatSoles } from "@/lib/loyalty/cashback"

export type CashbackData =
  | { enabled: false }
  | {
      enabled: true
      percent: number
      maxVisits: number
      period: {
        earned: number
        earnedVisits: number
        avgPurchase: number | null
        paid: number
        paidRewards: number
      }
      now: {
        onCards: number
        clientsWithBalance: number
        pending: number
        pendingRewards: number
      }
    }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-ent-fg-3">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ent-fg">{value}</p>
      {hint && <p className="text-[11.5px] text-ent-fg-3">{hint}</p>}
    </div>
  )
}

/**
 * Cashback reward of a stamps program: what the stamps earned and what was
 * paid at the till in the period, and what the business owes right now
 * (balances on cards in progress plus completed cards not yet discounted).
 * Hidden when the reward is a gift.
 */
export function CashbackCard({ data }: { data: CashbackData }) {
  if (!data.enabled) return null
  const { period, now } = data
  const liability = now.onCards + now.pending
  return (
    <Panel>
      <PanelHeader
        title="Cashback"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            {formatPercent(data.percent)} por compra · tarjeta de {data.maxVisits}
          </span>
        }
      />
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Cashback generado"
            value={formatSoles(period.earned)}
            hint={`${period.earnedVisits} compras en el periodo${
              period.avgPurchase !== null ? ` · ticket ${formatSoles(period.avgPurchase)}` : ""
            }`}
          />
          <Stat
            label="Descontado en caja"
            value={formatSoles(period.paid)}
            hint={`${period.paidRewards} ${period.paidRewards === 1 ? "tarjeta canjeada" : "tarjetas canjeadas"}`}
          />
          <Stat
            label="En tarjetas en curso"
            value={formatSoles(now.onCards)}
            hint={`${now.clientsWithBalance} ${now.clientsWithBalance === 1 ? "cliente acumulando" : "clientes acumulando"}`}
          />
          <Stat
            label="Por descontar hoy"
            value={formatSoles(now.pending)}
            hint={`${now.pendingRewards} ${now.pendingRewards === 1 ? "tarjeta completa" : "tarjetas completas"} sin canjear`}
          />
        </div>
        <p className="text-[11px] text-ent-fg-3">
          "Generado" y "Descontado" cuentan el periodo elegido; lo demás es la foto de ahora. El
          compromiso total con los clientes hoy es {formatSoles(liability)}: lo que llevan en sus
          tarjetas más lo que ya pueden descontar. Cada compra registrada con cashback es una compra
          que, sin la tarjeta, se habría ido sin dejar rastro.
        </p>
      </div>
    </Panel>
  )
}
