"use client"

import {
  DataTable,
  Panel,
  PanelFooter,
  PanelHeader,
  PanelMessage,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { formatDateTime } from "@/lib/format-date"

type Transaction = {
  id: string
  visitNum: number
  cycleNumber: number
  createdAt: string
  clientName: string
  clientLastName: string | null
  /** Points granted by the visit (points programs). */
  points?: number | null
  /** Purchase amount, when the till recorded one. */
  amount?: string | null
  /** Name of the location (sucursal) where the visit was registered. */
  locationName?: string | null
}

/**
 * Last visits, one per row: when, and `Cliente · detalle | Sucursal`. The
 * location is only printed when the visit recorded one.
 */
export function TransactionsTable({
  data,
  timezone = "America/Lima",
  mode = "stamps",
}: {
  data: Transaction[]
  timezone?: string
  mode?: "stamps" | "points"
}) {
  const hasLocations = data.some((tx) => !!tx.locationName)

  return (
    <Panel>
      <PanelHeader title="Transacciones recientes" />
      {data.length === 0 ? (
        <PanelMessage>Sin transacciones recientes</PanelMessage>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th className="w-[170px]">Fecha</Th>
                <Th>Detalle</Th>
                {hasLocations && <Th className="w-[180px]">Sucursal</Th>}
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <Tr key={tx.id}>
                  <Td className="text-ent-fg-3 tabular-nums">
                    {formatDateTime(tx.createdAt, timezone)}
                  </Td>
                  <Td className="whitespace-normal">
                    <span className="font-medium text-ent-fg">
                      {tx.clientName}
                      {tx.clientLastName ? ` ${tx.clientLastName}` : ""}
                    </span>
                    <span className="text-ent-fg-2">
                      {" · "}
                      {mode === "points" ? (
                        <>
                          <span className="font-medium text-ent-ok tabular-nums">
                            +{tx.points ?? 0} pts
                          </span>
                          {tx.amount ? ` · S/ ${Number(tx.amount).toFixed(2)}` : ""}
                        </>
                      ) : (
                        <>
                          Sello {tx.visitNum} (ciclo {tx.cycleNumber})
                        </>
                      )}
                    </span>
                  </Td>
                  {hasLocations && (
                    <Td className="text-ent-fg-2 whitespace-normal">{tx.locationName ?? "—"}</Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </DataTable>
          <PanelFooter>
            <span>
              {data.length === 1 ? "1 transacción" : `${data.length} transacciones`} · las últimas
              registradas
            </span>
          </PanelFooter>
        </>
      )}
    </Panel>
  )
}
