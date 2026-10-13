"use client"

import { ArrowRight, Megaphone, Search, User } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useTenant } from "@/hooks/use-tenant"
import { prepare, type SearchEntry, searchEntries } from "@/lib/search/match"
import index from "@/lib/search/panel-index.json"

type ClientHit = {
  id: string
  name: string
  lastName: string | null
  phone: string | null
  dni: string | null
  email: string | null
}
type CampaignHit = { id: string; name: string; status: string; message: string }

const PREPARED = prepare(index as SearchEntry[])
/** Shown before typing: the four things merchants ask for most. */
const SHORTCUTS = ["campana-nueva", "clientes", "cumpleanos", "exportar"]

/**
 * Fired (on `window`) when a search result points to the page the user is
 * already on, with the query-string params as `detail` (e.g. `{ nueva: "1" }`
 * or `{ abrir: "<id>" }`). Pages that understand deep links listen to it.
 */
export const PANEL_DEEP_LINK_EVENT = "cuik:panel-deep-link"

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  sending: "Enviando",
  sent: "Enviada",
  cancelled: "Cancelada",
}

/**
 * Panel search (Ctrl+K / Cmd+K): features from `panel-index.json` plus live
 * clients and campaigns of the business. Functions are matched locally; data
 * is fetched after a short pause from 2 characters on.
 */
export function CommandSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const { tenantSlug, promotionType } = useTenant()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [clients, setClients] = useState<ClientHit[]>([])
  const [campaigns, setCampaigns] = useState<CampaignHit[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (e.repeat) return
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setClients([])
      setCampaigns([])
    }
  }, [open])

  const features = useMemo(() => {
    if (query.trim().length === 0) {
      return SHORTCUTS.map((id) => PREPARED.find((p) => p.entry.id === id)?.entry).filter(
        (e): e is SearchEntry =>
          !!e && (!e.program || !promotionType || e.program === promotionType),
      )
    }
    return searchEntries(PREPARED, query, { program: promotionType, limit: 7 }).map((h) => h.entry)
  }, [query, promotionType])

  // Live data: clients by name/phone/DNI/email and campaigns by name.
  useEffect(() => {
    const q = query.trim()
    if (!open || !tenantSlug || q.length < 2) {
      // Invalidate any in-flight request so its rows never land on a shorter query or a closed dialog.
      seq.current++
      setClients([])
      setCampaigns([])
      setLoading(false)
      return
    }
    const mine = ++seq.current
    // Drop the previous query's rows at once so they never show under the new one.
    setClients([])
    setCampaigns([])
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const qs = encodeURIComponent(q)
        const [c, k] = await Promise.all([
          fetch(`/api/${tenantSlug}/clients?search=${qs}&limit=5`).then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch(`/api/${tenantSlug}/campaigns?search=${qs}&limit=5`).then((r) =>
            r.ok ? r.json() : null,
          ),
        ])
        if (mine !== seq.current) return
        setClients(Array.isArray(c?.data?.data) ? c.data.data : [])
        setCampaigns(Array.isArray(k?.data?.data) ? k.data.data : [])
      } catch {
        if (mine === seq.current) {
          setClients([])
          setCampaigns([])
        }
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [query, open, tenantSlug])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      if (/^https?:\/\//.test(href)) {
        window.open(href, "_blank", "noopener")
        return
      }
      const [path, qs = ""] = href.split("?")
      // Already on the target page: a push with only a new query string does not
      // remount it, so the page is told directly (see PANEL_DEEP_LINK_EVENT listeners).
      if (path === pathname && qs) {
        window.dispatchEvent(
          new CustomEvent(PANEL_DEEP_LINK_EVENT, {
            detail: Object.fromEntries(new URLSearchParams(qs)),
          }),
        )
        return
      }
      router.push(href)
    },
    [router, pathname],
  )

  const nothing =
    query.trim().length > 0 &&
    features.length === 0 &&
    clients.length === 0 &&
    campaigns.length === 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-7 px-2 rounded-[4px] border border-[#3a4756] text-[12px] text-[#b6c0cc] hover:bg-white/10 hover:text-white min-w-[200px]"
        aria-label="Buscar en el panel"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="text-[10px] border border-[#3a4756] rounded px-1 leading-4">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden p-1.5 rounded-[4px] text-[#b6c0cc] hover:bg-white/10 hover:text-white"
        aria-label="Buscar en el panel"
      >
        <Search className="w-4 h-4" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar en el panel"
        description="Funciones, clientes y campañas"
        showCloseButton={false}
        shouldFilter={false}
        className="sm:max-w-[640px]"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="¿Qué quieres hacer? Ej: push, cumpleaños, exportar, un cliente…"
        />
        <CommandList className="max-h-[420px]">
          {nothing && !loading && (
            <CommandEmpty>
              Nada con “{query.trim()}”. Prueba con otra palabra: push, clientes, premio, excel.
            </CommandEmpty>
          )}
          {features.length > 0 && (
            <CommandGroup heading={query.trim() ? "Funciones" : "Atajos"}>
              {features.map((e) => (
                <CommandItem key={e.id} value={e.id} onSelect={() => go(e.href)} className="gap-3">
                  <ArrowRight className="w-4 h-4 text-ent-fg-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{e.title}</div>
                    <div className="text-[12px] text-ent-fg-3 truncate">{e.description}</div>
                  </div>
                  <span className="ml-auto text-[11px] text-ent-fg-3 shrink-0">{e.group}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {clients.length > 0 && (
            <CommandGroup heading="Clientes">
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client-${c.id}`}
                  onSelect={() => go(`/panel/clientes/${c.id}`)}
                  className="gap-3"
                >
                  <User className="w-4 h-4 text-ent-fg-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">
                      {c.name} {c.lastName ?? ""}
                    </div>
                    <div className="text-[12px] text-ent-fg-3 truncate">
                      {[c.phone, c.dni, c.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {campaigns.length > 0 && (
            <CommandGroup heading="Campañas">
              {campaigns.map((k) => (
                <CommandItem
                  key={k.id}
                  value={`campaign-${k.id}`}
                  onSelect={() => go(`/panel/campanas?abrir=${k.id}`)}
                  className="gap-3"
                >
                  <Megaphone className="w-4 h-4 text-ent-fg-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{k.name}</div>
                    <div className="text-[12px] text-ent-fg-3 truncate">{k.message}</div>
                  </div>
                  <span className="ml-auto text-[11px] text-ent-fg-3 shrink-0">
                    {STATUS_LABEL[k.status] ?? k.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {loading && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-[12px] text-ent-fg-3">Buscando clientes y campañas…</div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
