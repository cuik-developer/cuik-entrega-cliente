"use client"

import { ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"

export type TopClientRow = {
  id: string
  name: string
  visitCount: number
}

type Props = {
  clients: TopClientRow[]
}

/** Lifetime top 10 by visits (not scoped to the period — see computeAnalyticsSummary). */
export function TopClientsTable({ clients }: Props) {
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...clients]
    .sort((a, b) => (sortAsc ? a.visitCount - b.visitCount : b.visitCount - a.visitCount))
    .slice(0, 10)

  return (
    <Panel>
      <PanelHeader
        title="Top 10 clientes"
        actions={<span className="text-[11.5px] text-ent-fg-3">Histórico</span>}
      />
      {sorted.length === 0 ? (
        <PanelMessage>Sin datos de clientes disponibles.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th className="w-10">#</Th>
              <Th>Nombre</Th>
              <Th align="right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-ent-fg"
                  onClick={() => setSortAsc(!sortAsc)}
                >
                  Visitas
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                </button>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((client, index) => (
              <Tr key={client.id}>
                <Td className="text-ent-fg-3 tabular-nums">{index + 1}</Td>
                <Td className="text-ent-fg">
                  <Link
                    href={`/panel/clientes/${client.id}`}
                    className="hover:text-ent-accent hover:underline"
                  >
                    {client.name}
                  </Link>
                </Td>
                <Td align="right" className="font-semibold text-ent-fg">
                  {client.visitCount}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}
