"use client"

import { Check, Edit2, Loader2, Plus, Tag } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type TagItem = {
  id: string
  name: string
  color: string | null
}

type ClientTagsProps = {
  clientId: string
  tenantSlug: string
}

const DEFAULT_TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
]

export function ClientTags({ clientId, tenantSlug }: ClientTagsProps) {
  const [assignedTags, setAssignedTags] = useState<TagItem[]>([])
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0])
  const [creatingTag, setCreatingTag] = useState(false)

  const fetchAssignedTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/tags`)
      const json = await res.json()
      if (json.success) {
        const tags: TagItem[] = json.data ?? []
        setAssignedTags(tags)
        setSelectedIds(new Set(tags.map((t) => t.id)))
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  const fetchAllTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/tags`)
      const json = await res.json()
      if (json.success) {
        setAllTags(json.data ?? [])
      }
    } catch {
      // silent
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchAssignedTags()
  }, [fetchAssignedTags])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      fetchAllTags()
    }
  }

  const toggleTag = (tagId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
      return next
    })
  }

  const handleSave = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: ids }),
      })
      const json = await res.json()
      if (json.success) {
        await fetchAssignedTags()
        setOpen(false)
      }
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim()
    if (!trimmed || creatingTag) return

    setCreatingTag(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        const created: TagItem = json.data
        setAllTags((prev) => [...prev, created])
        setSelectedIds((prev) => new Set([...prev, created.id]))
        setNewTagName("")
      }
    } catch {
      // silent
    } finally {
      setCreatingTag(false)
    }
  }

  const getTagStyle = (color: string | null) => {
    if (!color) return {}
    return {
      backgroundColor: `${color}20`,
      color,
      borderColor: `${color}40`,
    }
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Tags asignados</h3>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />
              Editar tags
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">Seleccionar tags</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Marca los tags que aplican a este cliente
              </p>
            </div>

            <div className="max-h-48 overflow-y-auto p-2">
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No hay tags creados
                </p>
              ) : (
                <div className="space-y-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      htmlFor={`tag-${tag.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={selectedIds.has(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <Badge variant="outline" className="text-xs" style={getTagStyle(tag.color)}>
                        {tag.name}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Crear nuevo tag</p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nombre del tag"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="h-8 text-sm flex-1"
                  maxLength={50}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-md border border-border shrink-0"
                      style={{ backgroundColor: newTagColor }}
                      title="Elegir color"
                    >
                      <span className="sr-only">Elegir color</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="end">
                    <div className="grid grid-cols-4 gap-1.5">
                      {DEFAULT_TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors"
                          style={{
                            backgroundColor: c,
                            borderColor: c === newTagColor ? "white" : "transparent",
                            boxShadow: c === newTagColor ? `0 0 0 2px ${c}` : "none",
                          }}
                          onClick={() => setNewTagColor(c)}
                        >
                          {c === newTagColor && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || creatingTag}
                >
                  {creatingTag ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="border-t border-border p-3">
              <Button size="sm" className="w-full gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Guardar tags
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {assignedTags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Tag className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No hay tags asignados a este cliente</p>
          <p className="text-xs mt-1">Usa "Editar tags" para asignar tags</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="text-sm px-3 py-1"
              style={getTagStyle(tag.color)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
