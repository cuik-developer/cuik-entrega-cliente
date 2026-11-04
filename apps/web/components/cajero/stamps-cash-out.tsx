"use client"

import { Gift, Undo2 } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CONNECTION_ERROR,
  cashOutRejectionMessage,
  voidRejectionMessage,
} from "@/lib/loyalty/cashier-messages"

export type CashOutOfferView = {
  at: number
  label: string
  stamps: number
  stampsAfter: number
}

/** A stamps redemption that can still be undone (just made, or from the client status). */
export type UndoableRedemption = {
  id: string
  kind: "final" | "milestone"
  label: string | null
}

export type CashOutDone = {
  rewardId: string
  label: string
  stampsAfter: number
}

/**
 * Early cash-out at the till ("escalera canjeable"): the client may take the
 * intermediate reward now (the card drops by the milestone's stamps) or keep
 * going to the full card. Same panel, same two-step confirmation and the same
 * messages in Escanear and Buscar.
 */
export function CashOutOffer({
  tenantSlug,
  qrCode,
  offer,
  maxVisits,
  finalReward,
  onCashedOut,
}: {
  tenantSlug: string
  qrCode: string
  offer: CashOutOfferView
  maxVisits: number
  /** Reward of the full card, for "o seguir hasta …". */
  finalReward: string | null
  onCashedOut: (done: CashOutDone) => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // "Confirmar" appears where "Cobrar" was: a double tap must not confirm in the same gesture.
  const confirmShownAt = useRef(0)

  const missing = Math.max(0, maxVisits - offer.stamps)

  async function cashOut() {
    if (busy) return
    if (!confirming) {
      setConfirming(true)
      confirmShownAt.current = Date.now()
      setMessage(null)
      return
    }
    if (Date.now() - confirmShownAt.current < 400) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/redeem-milestone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode }),
      })
      const json = await res.json()
      const data = json.data as
        | { code?: string; reward?: { id: string; label: string }; stamps?: { current: number } }
        | undefined
      if (data?.code === "OK" && data.reward) {
        setConfirming(false)
        await onCashedOut({
          rewardId: data.reward.id,
          label: data.reward.label,
          stampsAfter: data.stamps?.current ?? offer.stampsAfter,
        })
      } else {
        setMessage(cashOutRejectionMessage(data?.code, json.error))
      }
    } catch {
      setMessage(CONNECTION_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 space-y-2 text-left">
      <div className="flex items-start gap-2.5">
        <Gift className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-emerald-800 text-sm">
            Puede cobrar ahora: {offer.label}
          </div>
          <div className="text-emerald-700 text-xs">
            {confirming
              ? `¿Cobrar ${offer.label} ahora? La tarjeta baja de ${offer.stamps} a ${offer.stampsAfter} ${offer.stampsAfter === 1 ? "sello" : "sellos"}.`
              : missing > 0
                ? `O seguir acumulando: le faltan ${missing} ${missing === 1 ? "sello" : "sellos"}${finalReward ? ` para ${finalReward}` : ""}.`
                : "O seguir acumulando hasta completar la tarjeta."}
          </div>
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
            No, seguir acumulando
          </Button>
        )}
        <Button
          size="sm"
          className={`${confirming ? "bg-emerald-700" : "bg-emerald-600"} text-white text-xs h-8`}
          onClick={cashOut}
          disabled={busy}
        >
          {busy ? "Cobrando…" : confirming ? `Sí, cobrar ${offer.label}` : `Cobrar ${offer.label}`}
        </Button>
      </div>
      {message && <div className="text-xs text-red-600">{message}</div>}
    </div>
  )
}

/**
 * "Anular canje" right after a stamps redemption made by mistake. Asks for a
 * reason; the server checks the window, the visits since and who may undo it.
 */
export function UndoRedemption({
  tenantSlug,
  redemption,
  onUndone,
}: {
  tenantSlug: string
  redemption: UndoableRedemption
  onUndone: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const what = redemption.kind === "milestone" ? "cobro anticipado" : "canje"

  async function undo() {
    if (busy) return
    if (reason.trim().length < 3) {
      setMessage("Indica el motivo")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/redeem/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: redemption.id, reason: reason.trim() }),
      })
      const json = await res.json()
      if (json.data?.code === "OK") {
        setOpen(false)
        setReason("")
        await onUndone()
      } else {
        setMessage(voidRejectionMessage(json.data?.code, json.error))
      }
    } catch {
      setMessage(CONNECTION_ERROR)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex justify-center">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-8 text-gray-500 gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Undo2 className="w-3.5 h-3.5" />
          Anular {what}
          {redemption.label ? `: ${redemption.label}` : ""}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2 text-left">
      <div className="text-sm font-medium text-gray-900">
        Anular {what}
        {redemption.label ? `: ${redemption.label}` : ""}
      </div>
      <div className="text-xs text-gray-500">
        {redemption.kind === "milestone"
          ? "El cliente recupera los sellos que usó."
          : "El premio vuelve a quedar pendiente."}{" "}
        Solo se puede dentro de los 15 minutos y si no registró otra visita.
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (por ejemplo: cliente equivocado)"
        maxLength={200}
        className="h-9 text-sm"
      />
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-8 text-gray-500"
          onClick={() => {
            setOpen(false)
            setMessage(null)
          }}
          disabled={busy}
        >
          Volver
        </Button>
        <Button
          size="sm"
          className="bg-gray-900 text-white text-xs h-8"
          onClick={undo}
          disabled={busy}
        >
          {busy ? "Anulando…" : "Confirmar anulación"}
        </Button>
      </div>
      {message && <div className="text-xs text-red-600">{message}</div>}
    </div>
  )
}
