"use client"

import { Gift } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatSoles } from "@/lib/loyalty/cashback"
import type { NextReward } from "@/lib/loyalty/next-reward"

/** What the cashier hands over, in words: "descontar S/ 22.90" or the gift's name. */
export function nextRewardPhrase(reward: NextReward | null): string {
  if (reward?.cashbackAmount) return `descontar ${formatSoles(reward.cashbackAmount)}`
  return reward?.label ? `entregar ${reward.label}` : "entregar el premio"
}

export type NextRewardState = "idle" | "loading" | "ready" | "error"

/** The line under "N premio(s) pendiente(s)". */
export function panelHint(
  state: NextRewardState,
  next: NextReward | null,
  confirming: boolean,
): string | null {
  if (state === "loading") return "Revisando el premio…"
  // Pending but none redeemable now: the reward expired (the redeem would refuse it).
  if (state === "ready" && !next)
    return "No tiene un premio vigente para canjear: puede haber vencido."
  if (state === "error") return "No se pudo leer el premio: confirma con el cliente qué se entrega."
  if (confirming) {
    return `¿Canjear ahora? Debes ${nextRewardPhrase(next)}${next?.cashbackAmount ? " de esta compra" : ""}.`
  }
  if (next?.cashbackAmount)
    return `Al canjear: descuenta ${formatSoles(next.cashbackAmount)} de la compra`
  return next?.label ? `Al canjear: ${next.label}` : null
}

function buttonLabel(busy: boolean, confirming: boolean, next: NextReward | null): string {
  if (busy) return "Canjeando…"
  if (!confirming) return "Canjear"
  return next?.cashbackAmount ? `Sí, descontar ${formatSoles(next.cashbackAmount)}` : "Sí, canjear"
}

/**
 * The reward the next redeem hands over, reloaded whenever the pending count
 * changes (after a redeem, a visit or an undo). "error" when it could not be
 * read: the screen may still redeem, the server decides.
 */
export function useNextReward(tenantSlug: string, qrCode: string | null, count: number) {
  const [next, setNext] = useState<NextReward | null>(null)
  const [state, setState] = useState<NextRewardState>("idle")

  useEffect(() => {
    setNext(null)
    if (!qrCode || count <= 0) {
      setState("idle")
      return
    }
    setState("loading")
    let cancelled = false
    fetch(`/api/${tenantSlug}/redeem?qrCode=${encodeURIComponent(qrCode)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (json?.success) {
          setNext((json.data?.nextReward as NextReward) ?? null)
          setState("ready")
        } else {
          setState("error")
        }
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [tenantSlug, qrCode, count])

  return { next, state }
}

/**
 * Pending stamps rewards at the till, the same in Escanear and Buscar: it says
 * what the next "Canjear" hands over (a gift, or how much to discount) and asks
 * for a second tap before redeeming, like the early cash-out. The redeem itself
 * stays with the screen (`onRedeem`), which refreshes its own data and message.
 */
export function PendingRewards({
  tenantSlug,
  qrCode,
  count,
  onRedeem,
  busy: screenBusy = false,
}: {
  tenantSlug: string
  qrCode: string | null
  count: number
  /** Runs the redeem; the screen shows the result and reloads the client. */
  onRedeem: () => Promise<unknown>
  busy?: boolean
}) {
  const { next, state } = useNextReward(tenantSlug, qrCode, count)
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const busy = screenBusy || working
  // "Sí, canjear" appears where "Canjear" was: a double tap must not confirm in the same gesture.
  const confirmShownAt = useRef(0)

  // A new count means a new "next reward": ask again before redeeming it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on purpose when the count changes
  useEffect(() => setConfirming(false), [count])

  if (count <= 0) return null

  const noneValid = state === "ready" && next === null

  async function redeem() {
    if (busy || state === "loading" || noneValid) return
    if (!confirming) {
      setConfirming(true)
      confirmShownAt.current = Date.now()
      return
    }
    if (Date.now() - confirmShownAt.current < 400) return
    setWorking(true)
    try {
      await onRedeem()
    } finally {
      setWorking(false)
      setConfirming(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2 text-left">
      <div className="flex items-start gap-2.5">
        <Gift className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-amber-800 text-sm">{count} premio(s) pendiente(s)</div>
          <div className="text-amber-700 text-xs">{panelHint(state, next, confirming)}</div>
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        {confirming && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-gray-500"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          className={`${confirming ? "bg-amber-600" : "bg-amber-500"} text-white text-xs h-8`}
          onClick={redeem}
          disabled={busy || state === "loading" || noneValid}
        >
          {buttonLabel(busy, confirming, next)}
        </Button>
      </div>
    </div>
  )
}
