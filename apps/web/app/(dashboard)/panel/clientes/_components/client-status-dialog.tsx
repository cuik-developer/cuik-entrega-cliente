"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"

export type StatusTarget = "blocked" | "active"

type Props = {
  target: StatusTarget | null
  reason: string
  saving: boolean
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}

/** Confirmation for blocking / unblocking a client, with an optional reason that is stored as a note. */
export function ClientStatusDialog({
  target,
  reason,
  saving,
  onReasonChange,
  onConfirm,
  onClose,
}: Props) {
  const blocking = target === "blocked"
  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocking ? "Bloquear cliente" : "Desbloquear cliente"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocking
              ? "No podrá registrar visitas ni recibirá campañas mientras esté bloqueado. Queda una nota con quién lo hizo y el motivo."
              : "Vuelve a poder registrar visitas y recibir campañas. Queda una nota con quién lo hizo."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Motivo (opcional)"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          maxLength={500}
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={saving}
            className={blocking ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {saving ? "Guardando…" : blocking ? "Bloquear" : "Desbloquear"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
