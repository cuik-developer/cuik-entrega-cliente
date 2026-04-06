"use client"

import { Loader2, Plus, StickyNote } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type Note = {
  id: string
  content: string
  createdAt: string
  createdBy: string | null
  createdByName: string | null
}

type ClientNotesProps = {
  clientId: string
  tenantSlug: string
}

export function ClientNotes({ clientId, tenantSlug }: ClientNotesProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/notes`)
      const json = await res.json()
      if (json.success) {
        setNotes(json.data ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      })
      const json = await res.json()
      if (json.success) {
        setContent("")
        await fetchNotes()
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Textarea
          placeholder="Escribir una nota sobre este cliente..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-20 resize-none"
          maxLength={2000}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/2000</span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Agregar nota
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <StickyNote className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No hay notas para este cliente</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} className="border border-border">
              <CardContent className="p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(note.createdAt)}</span>
                  {note.createdByName && (
                    <>
                      <span>&middot;</span>
                      <span>{note.createdByName}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
