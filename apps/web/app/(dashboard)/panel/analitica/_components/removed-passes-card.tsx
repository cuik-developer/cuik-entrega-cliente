"use client"

import Link from "next/link"

import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { APPLE_REMOVAL_TRACKING_SINCE_LABEL } from "@/lib/wallet/pass-churn"

export type RemovedPassesData = {
  appleTrackingSince: string
  total: { apple: number; google: number }
  last30: { apple: number; google: number }
  clients: Array<{
    id: string
    name: string
    lastName: string | null
    phone: string | null
    email: string | null
    platform: "apple" | "google"
    removedAt: string
  }>
}

export const EMPTY_REMOVED_PASSES: RemovedPassesData = {
  appleTrackingSince: "",
  total: { apple: 0, google: 0 },
  last30: { apple: 0, google: 0 },
  clients: [],
}

const PLATFORM: Record<"apple" | "google", { label: string; cls: string }> = {
  apple: { label: "Apple", cls: "bg-ent-topbar text-white" },
  google: { label: "Google", cls: "bg-[#4285F4] text-white" },
}

function Stat({ label, apple, google }: { label: string; apple: number; google: number }) {
  return (
    <div>
      <p className="text-[11.5px] text-ent-fg-3">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ent-fg">{apple + google}</p>
      <p className="text-[11.5px] tabular-nums text-ent-fg-3">
        Apple {apple} · Google {google}
      </p>
    </div>
  )
}

/** Clients who removed their card from Apple or Google Wallet (and have none installed now). */
export function RemovedPassesCard({
  data,
  timezone,
}: {
  data: RemovedPassesData
  timezone: string
}) {
  const fmt = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  })
  return (
    <Panel>
      <PanelHeader
        title="Tarjetas eliminadas"
        actions={<span className="text-[11.5px] text-ent-fg-3">Hoy · todo el comercio</span>}
      />
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total" apple={data.total.apple} google={data.total.google} />
          <Stat label="Últimos 30 días" apple={data.last30.apple} google={data.last30.google} />
        </div>
        <p className="text-[11px] text-ent-fg-3">
          Apple: registradas desde el {APPLE_REMOVAL_TRACKING_SINCE_LABEL}. Incluye tarjetas
          eliminadas o con actualizaciones automáticas apagadas.
        </p>
      </div>
      {data.clients.length === 0 ? (
        <PanelMessage>Ningún cliente ha eliminado su tarjeta.</PanelMessage>
      ) : (
        <>
          <p className="px-3 pb-2 text-[12px] text-ent-fg-2">
            Escríbeles por WhatsApp para invitarlos a agregar su tarjeta de nuevo.
          </p>
          <div className="max-h-80 overflow-y-auto">
            <DataTable>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Teléfono</Th>
                  <Th>Wallet</Th>
                  <Th align="right">Eliminada</Th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => (
                  <Tr key={c.id}>
                    <Td className="text-ent-fg">
                      <Link
                        href={`/panel/clientes/${c.id}`}
                        className="hover:text-ent-accent hover:underline"
                      >
                        {[c.name, c.lastName].filter(Boolean).join(" ")}
                      </Link>
                    </Td>
                    <Td className="tabular-nums text-ent-fg-2">{c.phone || "—"}</Td>
                    <Td>
                      <span
                        className={`inline-block rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-medium ${PLATFORM[c.platform].cls}`}
                      >
                        {PLATFORM[c.platform].label}
                      </span>
                    </Td>
                    <Td align="right" className="tabular-nums text-ent-fg-2 whitespace-nowrap">
                      {fmt.format(new Date(c.removedAt))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </>
      )}
    </Panel>
  )
}
