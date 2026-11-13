import ExcelJS from "exceljs"

import type { CandidateSale, LinksReview, UnlinkedVisit } from "./links-review"
import { sourceLabel } from "./sources"

/**
 * "Registros sin venta" as an Excel the merchant can answer: one row per
 * stamp with the closest free sale, a Decisión dropdown (Enlazar / Revisar /
 * No) and the ids the import needs. Importing it back applies the "Enlazar"
 * rows.
 */

const SUGGESTION = { link: "Enlazar", review: "Revisar", none: "No" } as const

function when(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const yesNo = (b: boolean) => (b ? "Sí" : "No")

/** The columns of the closest free sale; blanks when the stamp has none nearby. */
function candidateCells(c: CandidateSale | undefined, tz: string) {
  if (!c) {
    return {
      orderRef: "",
      saleSource: "",
      saleWhen: "",
      minutes: null,
      saleStore: "",
      saleDni: "",
      saleName: "",
      saleAmount: null,
      sameAmount: "",
      sameStore: "",
      saleId: "",
    }
  }
  return {
    orderRef: c.orderRef ?? "",
    saleSource: sourceLabel(c.source),
    saleWhen: when(c.soldAt, tz),
    minutes: c.minutes,
    saleStore: c.store ?? "",
    saleDni: c.dni ?? "invitado",
    saleName: c.customerName ?? "",
    saleAmount: c.amount,
    sameAmount: yesNo(c.sameAmount),
    sameStore: yesNo(c.sameStore),
    saleId: c.saleId,
  }
}

export async function buildLinksExcel(review: LinksReview, tenantName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const ws = wb.addWorksheet("Registros sin venta", { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "Registro (hora local)", key: "when", width: 18 },
    { header: "Local", key: "location", width: 16 },
    { header: "Cliente Cuik", key: "client", width: 28 },
    { header: "Doc. cliente", key: "dni", width: 12 },
    { header: "Celular", key: "phone", width: 12 },
    { header: "Monto sello", key: "amount", width: 12 },
    { header: "Cajero", key: "cashier", width: 14 },
    { header: "Venta más cercana", key: "orderRef", width: 26 },
    { header: "Canal venta", key: "saleSource", width: 14 },
    { header: "Hora venta", key: "saleWhen", width: 18 },
    { header: "Minutos", key: "minutes", width: 9 },
    { header: "Tienda venta", key: "saleStore", width: 18 },
    { header: "Doc. en venta", key: "saleDni", width: 12 },
    { header: "Nombre en venta", key: "saleName", width: 26 },
    { header: "Monto venta", key: "saleAmount", width: 12 },
    { header: "Mismo monto", key: "sameAmount", width: 11 },
    { header: "Misma tienda", key: "sameStore", width: 11 },
    { header: "Otras ventas cerca", key: "others", width: 16 },
    { header: "Sugerencia", key: "suggestion", width: 11 },
    { header: "Decisión", key: "decision", width: 12 },
    { header: "Comentario", key: "comment", width: 24 },
    { header: "visita_id", key: "visitId", width: 38 },
    { header: "venta_id", key: "saleId", width: 38 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } }

  const tz = review.timezone
  review.unlinked.forEach((v: UnlinkedVisit, i) => {
    const c = v.candidates[0]
    const row = ws.addRow({
      n: i + 1,
      when: when(v.createdAt, tz),
      location: v.location ?? "",
      client: v.clientName,
      dni: v.dni ?? "",
      phone: v.phone ?? "",
      amount: v.amount,
      cashier: v.registeredBy ?? "",
      ...candidateCells(c, tz),
      others: v.candidates.length > 1 ? v.candidates.length - 1 : "",
      suggestion: SUGGESTION[v.suggestion],
      decision: v.suggestion === "link" ? "Enlazar" : "",
      comment: "",
      visitId: v.visitId,
    })
    row.getCell("decision").dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Enlazar,Revisar,No"'],
    }
    if (v.suggestion === "link") row.getCell("suggestion").font = { bold: true }
  })
  for (const key of ["amount", "saleAmount"]) ws.getColumn(key).numFmt = "#,##0.00"
  ws.autoFilter = { from: "A1", to: `X${Math.max(2, review.unlinked.length + 1)}` }

  const s = review.summary
  const resumen = wb.addWorksheet("Resumen")
  resumen.columns = [
    { header: "Concepto", key: "k", width: 44 },
    { header: "Valor", key: "v", width: 16 },
  ]
  resumen.getRow(1).font = { bold: true }
  const rows: [string, string | number][] = [
    ["Comercio", tenantName],
    ["Periodo", review.month === "all" ? `Todo (hasta ${review.to})` : review.month],
    ["Registros (sin bonos)", s.visits],
    ["Con venta enlazada", s.withSale],
    ["Sin venta", s.withoutSale],
    ["Registros con venta (%)", s.rate ?? ""],
    ["Enlaces por DNI", s.byKind.dni],
    ["Enlaces inferidos", s.byKind.inferredAmount + s.byKind.inferredTime],
    ["Enlaces a mano", s.byKind.manual],
    ["Sugerencia Enlazar", s.suggestions.link],
    ["Sugerencia Revisar", s.suggestions.review],
    ["Sin venta cerca", s.suggestions.none],
    ["Ventas de invitado sin enlazar", s.guestUnlinked],
    ["Compras de clientes Cuik sin sello", s.clientNoVisit],
    ["", ""],
    [
      "Cómo responder",
      "Marca Decisión = Enlazar en las filas correctas y sube este archivo en Comercios › Validación de enlaces › Importar decisiones.",
    ],
  ]
  for (const [k, v] of rows) resumen.addRow({ k, v })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}
