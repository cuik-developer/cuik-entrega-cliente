"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Notice } from "@/components/admin/enterprise"
import { listDesignsAwaitingReview } from "../pases/actions"

type Pending = { id: string; name: string; tenantName: string; requestedByName: string | null }

/** Owner's home strip: drafts Equipo Cuik saved that are waiting to be published. */
export function DesignReviewNotice() {
  const [items, setItems] = useState<Pending[]>([])

  useEffect(() => {
    let cancelled = false
    listDesignsAwaitingReview()
      .then((r) => {
        if (!cancelled && r.success) setItems(r.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null
  const first = items[0]
  const who = first.requestedByName ? ` · último de ${first.requestedByName}` : ""

  return (
    <Notice
      tone="info"
      action={
        <Link href="/admin/pases" className="text-[12px] text-ent-accent hover:underline">
          Revisar
        </Link>
      }
    >
      <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 mr-2">Diseños</span>
      <span className="font-semibold text-ent-fg">
        {items.length === 1
          ? "1 diseño listo para publicar"
          : `${items.length} diseños listos para publicar`}
      </span>{" "}
      ({first.name} · {first.tenantName}
      {items.length > 1 ? ` y ${items.length - 1} más` : ""}
      {who})
    </Notice>
  )
}
