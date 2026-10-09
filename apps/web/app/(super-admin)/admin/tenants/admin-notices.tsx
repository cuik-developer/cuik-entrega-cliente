"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Notice } from "@/components/admin/enterprise"
import {
  type AdminAlert,
  ALERT_SECTION_TITLE,
  type AlertKind,
} from "@/lib/admin/admin-alerts-types"

const TONE: Record<AdminAlert["severity"], "bad" | "warn" | "info"> = {
  critical: "bad",
  warning: "warn",
  info: "info",
}
const ORDER: AlertKind[] = ["cert", "billing", "cold", "demo", "campaign"]

/** Strip above the tenant table: the same alerts the daily email carries, live. */
export function AdminNotices() {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) setAlerts(json.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!alerts || alerts.length === 0) return null

  const grouped = ORDER.map(
    (kind) => [kind, alerts.filter((a) => a.kind === kind)] as const,
  ).filter(([, list]) => list.length > 0)
  const MAX = 4
  const total = alerts.length
  let shown = 0

  return (
    <div className="space-y-2">
      {grouped.map(([kind, list]) =>
        list.map((a) => {
          if (!showAll && shown >= MAX) return null
          shown += 1
          const path = a.href.replace(/^https?:\/\/[^/]+/, "")
          return (
            <Notice
              key={a.key}
              tone={TONE[a.severity]}
              action={
                <Link href={path} className="text-[12px] text-ent-accent hover:underline">
                  Abrir
                </Link>
              }
            >
              <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 mr-2">
                {ALERT_SECTION_TITLE[kind]}
              </span>
              <Link href={path} className="font-semibold text-ent-fg hover:underline">
                {a.who}
              </Link>{" "}
              {a.text}
            </Notice>
          )
        }),
      )}
      {total > MAX && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="text-[12px] text-ent-accent hover:underline"
        >
          {showAll ? "Ver menos" : `Ver los ${total} avisos`}
        </button>
      )}
    </div>
  )
}
