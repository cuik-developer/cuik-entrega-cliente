import ExcelJS from "exceljs"
import { docSign, IGV_TREATMENT_LABEL, type IgvTreatment, RENTA_LABEL, toPen } from "./documents"
import type { DocumentsPage } from "./documents-data"
import { monthShort } from "./issuers"

type Doc = DocumentsPage["docs"][number]

/** Sales: collection state of the linked Facturación invoice, or paid when it has a date. */
function collectionLabel(d: Doc): string {
  if (d.invoice) {
    if (d.invoice.status === "paid") return "Pagada"
    return d.invoice.status === "void" ? "Anulada" : "Pendiente"
  }
  return d.paidOn ? "Pagada" : ""
}

/**
 * Registro de ventas or de compras of one month as a workbook, for the
 * accountant: one row per document (void ones marked, credit notes in
 * negative) with amounts in the document currency and in soles, and the
 * month's totals at the bottom.
 */
export async function buildDocumentsExcel(page: DocumentsPage): Promise<ArrayBuffer> {
  const sale = page.direction === "sale"
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const ws = wb.addWorksheet(sale ? "Registro de ventas" : "Registro de compras")
  const money = "#,##0.00;[Red]-#,##0.00"
  ws.columns = [
    { header: "FECHA", key: "date", width: 12 },
    { header: "TIPO", key: "type", width: 7 },
    { header: "COMPROBANTE", key: "doc", width: 22 },
    { header: "SERIE", key: "serie", width: 8 },
    { header: "NUMERO", key: "numero", width: 10 },
    { header: sale ? "RUC/DNI CLIENTE" : "RUC/DOC PROVEEDOR", key: "party", width: 16 },
    { header: sale ? "CLIENTE" : "PROVEEDOR", key: "name", width: 34 },
    { header: "MONEDA", key: "currency", width: 8 },
    { header: "TC", key: "fx", width: 8 },
    { header: "BASE", key: "base", width: 12, style: { numFmt: money } },
    { header: "NO GRAVADO", key: "noGravado", width: 12, style: { numFmt: money } },
    { header: "IGV", key: "igv", width: 11, style: { numFmt: money } },
    { header: "TOTAL", key: "total", width: 12, style: { numFmt: money } },
    { header: "TOTAL S/", key: "totalPen", width: 12, style: { numFmt: money } },
    ...(sale
      ? [{ header: "COBRANZA", key: "collection", width: 12 }]
      : [
          { header: "IGV", key: "treatment", width: 22 },
          { header: "RENTA", key: "renta", width: 18 },
          { header: "CATEGORIA", key: "category", width: 18 },
        ]),
    { header: "ESTADO", key: "status", width: 10 },
    { header: "NOTAS", key: "notes", width: 30 },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: "FFFFFFFF" } }
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }

  for (const d of page.docs) {
    const k = docSign(d.docType)
    ws.addRow({
      date: d.issueDate,
      type: d.docType,
      doc: d.docTypeLabel,
      serie: d.serie,
      numero: d.numero,
      party: d.counterpartyDoc ?? "",
      name: d.counterpartyName,
      currency: d.currency,
      fx: d.fxRate ?? "",
      base: k * d.baseGravada,
      noGravado: k * d.baseNoGravada,
      igv: k * d.igv,
      total: k * d.total,
      totalPen: k * toPen(d.total, d.currency, d.fxRate),
      collection: collectionLabel(d),
      treatment: d.igvTreatment ? IGV_TREATMENT_LABEL[d.igvTreatment as IgvTreatment] : "",
      renta: d.rentaDeductible ? RENTA_LABEL[d.rentaDeductible] : "",
      category: d.category ?? "",
      status: d.status === "void" ? "Anulado" : "Registrado",
      notes: d.notes ?? "",
    })
  }
  const t = page.totals
  ws.addRow({})
  const total = ws.addRow({
    name: `Total ${monthShort(page.month)} en soles (sin anulados)`,
    base: t.baseGravada,
    noGravado: t.baseNoGravada,
    igv: t.igv,
    totalPen: t.total,
  })
  total.font = { bold: true }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
