"use client"

import { Wallet } from "lucide-react"

import { formatPercent, formatSoles } from "@/lib/loyalty/cashback"

/** Cashback figures as the visit and status endpoints return them. */
export type CashbackView = {
  /** What this purchase earned (0 when no visit was registered). */
  earned?: number
  /** Accumulated on the current card. */
  balance: number
  /** Completed cards waiting to be paid at the till. */
  pending: number
  percent: number
  /** Set when the visit completed the card. */
  rewardAmount?: number | null
}

/**
 * The cashback of a stamps card at the till, the same in Escanear and Buscar:
 * what the purchase just earned, what the card holds, and what is waiting to
 * be discounted. The cashier reads the numbers out loud to the client.
 */
export function CashbackSummary({ cashback }: { cashback: CashbackView }) {
  const earned = cashback.earned ?? 0
  const completed = cashback.rewardAmount != null && cashback.rewardAmount > 0
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-sky-800 text-xs font-semibold uppercase tracking-wide">
        <Wallet className="w-4 h-4" />
        Cashback {formatPercent(cashback.percent)}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-sm">
        {earned > 0 && (
          <div>
            <div className="text-sky-700 text-xs">Esta compra</div>
            <div className="font-bold text-sky-900">+ {formatSoles(earned)}</div>
          </div>
        )}
        <div>
          <div className="text-sky-700 text-xs">
            {completed ? "Tarjeta completa" : "Acumulado en la tarjeta"}
          </div>
          <div className="font-bold text-sky-900">
            {completed ? formatSoles(cashback.rewardAmount) : formatSoles(cashback.balance)}
          </div>
        </div>
        {cashback.pending > 0 && (
          <div>
            <div className="text-sky-700 text-xs">Para descontar en caja</div>
            <div className="font-bold text-sky-900">{formatSoles(cashback.pending)}</div>
          </div>
        )}
      </div>
      {completed && (
        <p className="mt-1.5 text-xs text-sky-700">
          Al canjear, descuenta {formatSoles(cashback.rewardAmount)} de la compra. La tarjeta vuelve
          a empezar en S/ 0.00.
        </p>
      )}
    </div>
  )
}
