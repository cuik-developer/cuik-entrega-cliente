"use client"

import { Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { BLOCK_REASONS } from "@/lib/growth/labels"

/** "No contactar": the reason (pet died, asked not to, wrong number, other) and an optional note. */
export function NoContactDialog({
  open,
  onOpenChange,
  clientName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientName: string
  onConfirm: (reason: string, note: string | null) => Promise<void>
}) {
  const [reason, setReason] = useState("pet_died")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    try {
      await onConfirm(reason, note.trim() || null)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>No contactar a {clientName}</DialogTitle>
          <DialogDescription>
            No volverá a salir en ninguna lista de Growth. Se puede revertir desde su ficha.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
          {BLOCK_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem value={r.value} id={`nc-${r.value}`} />
              <Label htmlFor={`nc-${r.value}`} className="text-[12.5px] font-normal">
                {r.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-1">
          <Label className="text-[12px]">Nota (opcional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void confirm()} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Marcar “No contactar”
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
