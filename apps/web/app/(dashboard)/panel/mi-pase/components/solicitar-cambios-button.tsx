"use client"

import { Mail } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function SolicitarCambiosButton() {
  return (
    <Button
      variant="outline"
      className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
      onClick={() => toast.success("Tu solicitud fue enviada al equipo de Cuik")}
    >
      <Mail className="h-4 w-4" />
      Solicitar cambios
    </Button>
  )
}
