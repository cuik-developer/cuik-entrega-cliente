import ExcelJS from "exceljs"

import { SEGMENT_LABELS } from "@/lib/loyalty/client-segments"
import { KIND_LABEL } from "./labels"
import type { CampaignClientsView } from "./store"

/** The client-by-client list of one campaign, as the screen shows it. */
export async function buildCampaignClientsExcel(view: CampaignClientsView): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const ws = wb.addWorksheet("Clientes")
  ws.columns = [
    { header: "Cliente", key: "name", width: 30 },
    { header: "Segmento al enviar", key: "segmentAtSend", width: 20 },
    { header: "Días sin venir ese día", key: "silence", width: 22 },
    { header: "Compras hasta ese día", key: "visitsAtSend", width: 22 },
    { header: "Volvió el", key: "returnedOn", width: 14 },
    { header: "Compras en el plazo", key: "purchases", width: 20 },
    { header: "Venta en el plazo", key: "sales", width: 18, style: { numFmt: '"S/" #,##0.00' } },
    { header: "Segmento al cierre", key: "segmentAtClose", width: 20 },
    { header: "Pasó a un mensaje posterior", key: "handedOver", width: 28 },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
  head.height = 24
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
  ws.views = [{ state: "frozen", ySplit: 1 }]

  for (const r of view.rows) {
    ws.addRow({
      name: r.name,
      segmentAtSend: SEGMENT_LABELS[r.segmentAtSend],
      silence: r.silenceDays === null ? "Nunca había comprado" : r.silenceDays,
      visitsAtSend: r.purchasesAtSend,
      returnedOn: r.returnedOn ?? "No volvió",
      purchases: r.purchases,
      sales: r.sales,
      segmentAtClose:
        r.segmentAtClose === null ? "Plazo en curso" : SEGMENT_LABELS[r.segmentAtClose],
      handedOver: r.handedOver ? "Sí" : "No",
    })
  }

  const info = wb.addWorksheet("Campaña")
  info.columns = [{ width: 26 }, { width: 50 }]
  info.addRows([
    ["Comercio", view.tenantName],
    ["Campaña", view.campaign.name],
    ["Tipo", KIND_LABEL[view.campaign.kind]],
    ["Enviada el", view.campaign.sentOn],
    ["Plazo para volver", `${view.windowDays} días`],
    ["Clientes alcanzados", view.rows.length],
    [
      "Cómo leerlo",
      "El segmento y los días sin venir son los del día del envío, no los de hoy. Solo cuentan las compras registradas con sello en Cuik.",
    ],
  ])
  info.getColumn(1).font = { bold: true }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
