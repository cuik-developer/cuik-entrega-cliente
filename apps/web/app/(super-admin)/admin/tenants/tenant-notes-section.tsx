"use client"

import { CalendarClock, Loader2, StickyNote, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type TenantNote = {
  id: string
  content: string
  followUpAt: string | null
  createdAt: string
  author: { id: string | null; name: string | null }
  /** True when the current super-admin wrote it (only own notes can be deleted). */
  mine: boolean
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

/**
 * Internal log of the Cuik team about one tenant (calls, agreements,
 * incidents). Separate from client notes and from the request. Optional
 * follow-up date; overdue follow-ups are highlighted.
 */
export function TenantNotesSection({
  tenantId,
  onCountChange,
}: {
  tenantId: string
  onCountChange?: (n: number) => void
}) {
  const [notes, setNotes] = useState<TenantNote[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const [followUp, setFollowUp] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/notes`)
      const json = await res.json()
      if (!json.success) throw new Error()
      setNotes(json.data)
      onCountChange?.(json.data.length)
    } catch {
      toast.error("No se pudieron cargar las notas")
    } finally {
      setLoading(false)
    }
  }, [tenantId, onCountChange])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    if (!content.trim()) {
      toast.error("Escribí la nota")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), followUpAt: followUp || null }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setContent("")
      setFollowUp("")
      await load()
    } catch {
      toast.error("No se pudo guardar la nota")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/notes/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      await load()
    } catch {
      toast.error("No se pudo borrar la nota")
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-6 space-y-4">
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-slate-500" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Nueva nota interna
          </p>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="Llamada, acuerdo, incidencia… Solo la ve el equipo de Cuik."
          className="bg-white"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Seguimiento (opcional)</Label>
            <Input
              type="date"
              value={followUp}
              min={today}
              onChange={(e) => setFollowUp(e.target.value)}
              className="h-8 text-sm w-44 bg-white"
            />
          </div>
          <Button size="sm" onClick={add} disabled={saving || !content.trim()} className="ml-auto">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar nota"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          Todavía no hay notas sobre este comercio.
        </p>
      ) : (
        <ol className="space-y-2">
          {notes.map((n) => {
            const overdue = n.followUpAt !== null && n.followUpAt.slice(0, 10) <= today
            return (
              <li
                key={n.id}
                className={`rounded-xl border p-3 text-sm ${overdue ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap text-slate-800 flex-1">{n.content}</p>
                  {n.mine && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 shrink-0"
                      onClick={() => remove(n.id)}
                      aria-label="Borrar nota"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    {n.author.name ?? "Equipo Cuik"} · {fmt(n.createdAt)}
                  </span>
                  {n.followUpAt && (
                    <span
                      className={`inline-flex items-center gap-1 ${overdue ? "text-amber-700 font-medium" : ""}`}
                    >
                      <CalendarClock className="w-3 h-3" />
                      seguimiento {fmtDay(n.followUpAt)}
                      {overdue ? " (vencido)" : ""}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
