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

export type StatusTarget = "blocked" | "active" | "archived"

type Props = {
  target: StatusTarget | null
  /** Current status of the client, to phrase "restore" vs "unblock". */
  currentStatus?: string
  reason: string
  saving: boolean
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}

/** Confirmation for blocking / unblocking a client, with an optional reason that is stored as a note. */
const COPY: Record<
  "block" | "unblock" | "archive" | "restore",
  { title: string; body: string; cta: string; danger: boolean }
> = {
  block: {
    title: "Bloquear cliente",
    body: "No podrá registrar visitas ni canjear, y no recibirá campañas mientras esté bloqueado. Queda una nota con quién lo hizo y el motivo.",
    cta: "Bloquear",
    danger: true,
  },
  unblock: {
    title: "Desbloquear cliente",
    body: "Vuelve a poder registrar visitas y recibir campañas. Queda una nota con quién lo hizo.",
    cta: "Desbloquear",
    danger: false,
  },
  archive: {
    title: "Archivar cliente",
    body: "Desaparece de tus listas, campañas y métricas, y su pase deja de funcionar. Podrás restaurarlo durante 30 días; después se eliminan sus datos personales de forma definitiva (las visitas quedan como historial anónimo).",
    cta: "Archivar",
    danger: true,
  },
  restore: {
    title: "Restaurar cliente",
    body: "Vuelve a estar activo: aparece en tus listas, recibe campañas y su pase funciona de nuevo. Queda una nota con quién lo hizo.",
    cta: "Restaurar",
    danger: false,
  },
}

export function ClientStatusDialog({
  target,
  currentStatus,
  reason,
  saving,
  onReasonChange,
  onConfirm,
  onClose,
}: Props) {
  const kind =
    target === "blocked"
      ? "block"
      : target === "archived"
        ? "archive"
        : currentStatus === "archived"
          ? "restore"
          : "unblock"
  const copy = COPY[kind]
  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
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
            className={copy.danger ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {saving ? "Guardando…" : copy.cta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
