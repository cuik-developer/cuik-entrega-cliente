"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { TenantLogo } from "./tenant-logo"

type Suggestion = {
  id: string
  name: string
  slug: string
  status: string
  logoUrl?: string | null
  primaryColor?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  trial: "Demo",
  active: "Activo",
  expired: "Vencido",
  cancelled: "Cancelado",
  paused: "Pausado",
}

/**
 * Top-bar tenant search with suggestions: typing two or more characters
 * lists matching tenants (name or slug); a click or Enter opens the tenant,
 * Enter with nothing highlighted filters the tenant list by the text.
 */
export function TenantSearch({ className }: { className?: string }) {
  const router = useRouter()
  const listId = useId()
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Debounced lookup; a stale response never overwrites a newer query.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setItems([])
      setActive(-1)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/admin/tenants/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled) return
          const rows: Suggestion[] = Array.isArray(json?.data) ? json.data : []
          setItems(rows)
          setActive(rows.length ? 0 : -1)
          setOpen(true)
        })
        .catch(() => {
          if (!cancelled) setItems([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  // Click outside closes the list.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  function go(s: Suggestion) {
    setOpen(false)
    setQuery("")
    router.push(`/admin/tenants/${s.id}`)
  }

  /** Filter the tenant list by the typed text. */
  function goList() {
    const q = query.trim()
    setOpen(false)
    router.push(q ? `/admin/tenants?q=${encodeURIComponent(q)}` : "/admin/tenants")
  }

  function submit() {
    if (open && active >= 0 && items[active]) {
      go(items[active])
      return
    }
    goList()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      submit()
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showList = open && query.trim().length >= 2

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <label className="relative block">
        <Search
          className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#8f9bab]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar tenant…"
          aria-label="Buscar tenant por nombre o slug"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={
            showList && active >= 0 && items[active] ? `${listId}-${items[active].id}` : undefined
          }
          autoComplete="off"
          className="h-[26px] w-56 lg:w-72 pl-7 pr-2 rounded-[3px] border border-[#3a4756] bg-[#273340] text-[12px] text-[#e8edf3] placeholder:text-[#8f9bab] focus:outline-none focus:border-[#7fa6d9]"
        />
      </label>
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Tenants sugeridos"
          className="absolute left-0 right-0 top-[30px] z-50 bg-ent-panel text-ent-fg border border-ent-line-strong rounded-[4px] py-1 max-h-72 overflow-y-auto"
        >
          {items.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-ent-fg-3">
              Sin resultados para “{query.trim()}”
            </div>
          ) : (
            items.map((s, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled on the input (combobox pattern)
              <div
                key={s.id}
                id={`${listId}-${s.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s)}
                className={cn(
                  "px-3 py-1.5 cursor-pointer flex items-center justify-between gap-3",
                  i === active ? "bg-ent-accent-soft" : "hover:bg-ent-panel-2",
                )}
              >
                <span className="min-w-0 flex items-center gap-2">
                  <TenantLogo
                    branding={{ logoUrl: s.logoUrl, primaryColor: s.primaryColor }}
                    name={s.name}
                    className="w-6 h-6 text-[11px]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium truncate">{s.name}</span>
                    <span className="block text-[11px] text-ent-fg-3 truncate">{s.slug}</span>
                  </span>
                </span>
                <span className="text-[11px] text-ent-fg-3 shrink-0">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </div>
            ))
          )}
          <div className="border-t border-ent-line mt-1 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={goList}
              className="w-full text-left px-3 py-1.5 text-[12px] text-ent-accent hover:bg-ent-panel-2"
            >
              Ver todos los resultados de “{query.trim()}”
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
