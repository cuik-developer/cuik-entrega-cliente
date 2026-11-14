import {
  and,
  asc,
  db,
  desc,
  documents,
  eq,
  financeEntries,
  fxRates,
  issuers,
  recurringItems,
  suppliers,
  taxProfiles,
  tenantBilling,
  tenantInvoices,
  tenants,
} from "@cuik/db"
import type { DocumentInput } from "@cuik/shared/validators"
import { currentMonthLima, loadIssuers } from "./company-data"
import { DocumentError } from "./document-error"
import {
  DOC_TYPE_LABEL,
  type DocType,
  documentTotals,
  formatSerieNumero,
  parseSerieNumero,
  saleAmountsFromInvoice,
} from "./documents"
import { fxFor } from "./finance"
import { issuerForMonth, profileForMonth } from "./issuers"
import { assertPeriodOpen, isPeriodClosed } from "./period-lock"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = Tx | typeof db

export { DocumentError }

/** True when a write hit one of the "number exists once" unique indexes. */
export function isDocumentNumberConflict(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; constraint?: string } } | null)?.cause
  return (
    cause?.code === "23505" &&
    (cause.constraint === "finance_documents_sale_number_uidx" ||
      cause.constraint === "finance_documents_purchase_number_uidx")
  )
}

/** USD→PEN of a month: the typed one, else the latest earlier, else the default. */
export async function fxForMonth(conn: Conn, month: string): Promise<number> {
  const rows = await conn.select({ month: fxRates.month, usdPen: fxRates.usdPen }).from(fxRates)
  const rates: Record<string, number> = {}
  for (const r of rows) rates[r.month] = Number(r.usdPen)
  return fxFor(month, rates).rate
}

/**
 * The issuer that invoices in `month` when it has a tax regime in force then
 * (CUIK E.I.R.L. from Nov 2026). Null for Making Brands months: those
 * invoices stay as collection records only, outside Cuik's books.
 */
export async function fiscalIssuerFor(conn: Conn, month: string) {
  const all = await conn.select().from(issuers)
  const issuer = issuerForMonth(all, month)
  if (!issuer) return null
  const profiles = await conn
    .select({
      issuerId: taxProfiles.issuerId,
      fromMonth: taxProfiles.fromMonth,
      igvRate: taxProfiles.igvRate,
    })
    .from(taxProfiles)
    .where(eq(taxProfiles.issuerId, issuer.id))
  const profile = profileForMonth(profiles, issuer.id, month)
  if (!profile) return null
  return { issuer, igvRate: Number(profile.igvRate) }
}

type InvoiceRow = typeof tenantInvoices.$inferSelect

/**
 * The invoice no longer is a sale of Cuik (Making Brands month or merchant):
 * void its document and unlink it, so it can be deleted from Ventas and its
 * number freed.
 */
/**
 * The merchant now invoices through another razón social: releases its CUIK
 * sales of open months right away (voided and unlinked). Sales of closed
 * months stay as declared; their numbers are returned so the user knows a
 * credit note is due.
 */
export async function releaseSalesOfTenant(tx: Tx, tenantId: string, userId: string) {
  const linked = await tx
    .select({ invoice: tenantInvoices, doc: documents })
    .from(tenantInvoices)
    .innerJoin(documents, eq(documents.id, tenantInvoices.documentId))
    .where(eq(tenantInvoices.tenantId, tenantId))
  const keptClosed: string[] = []
  for (const { invoice, doc } of linked) {
    if (await isPeriodClosed(tx, doc.issuerId, doc.taxPeriod)) {
      keptClosed.push(formatSerieNumero(doc.serie, doc.numero))
      continue
    }
    await releaseSale(tx, invoice, doc, userId)
  }
  return { released: linked.length - keptClosed.length, keptClosed }
}

async function releaseSale(
  tx: Tx,
  invoice: InvoiceRow,
  existing: DocRow | undefined,
  userId: string,
) {
  if (!invoice.documentId) return
  if (existing) await assertPeriodOpen(tx, existing.issuerId, existing.taxPeriod)
  await tx
    .update(documents)
    .set({ status: "void", updatedBy: userId, updatedAt: new Date() })
    .where(eq(documents.id, invoice.documentId))
  await tx.update(tenantInvoices).set({ documentId: null }).where(eq(tenantInvoices.id, invoice.id))
}

/**
 * A closed month only lets the paid date of its sale move: a new sale, a new
 * amount, number, date or void status would change books already declared.
 */
async function assertSyncAllowed(
  tx: Tx,
  existing: DocRow | undefined,
  next: { serie: string; numero: string; issueDate: string; status: "registered" | "void" },
  amountChanged: boolean,
  issuerId: string,
  month: string,
) {
  const changesBooks =
    !existing ||
    amountChanged ||
    existing.serie !== next.serie ||
    existing.numero !== next.numero ||
    existing.issueDate !== next.issueDate ||
    existing.status !== next.status
  if (!changesBooks) return
  if (existing) await assertPeriodOpen(tx, existing.issuerId, existing.taxPeriod)
  await assertPeriodOpen(tx, issuerId, month)
}

/**
 * Creates or updates the sale document of a merchant invoice registered in
 * Facturación, inside the caller's transaction. Only for months whose issuer
 * has a regime (Cuik); returns the document id or null when it does not
 * apply.
 *
 * - `strict`: the number must read "F001-123" (on create, and when the
 *   number or date is edited). Marking an older invoice paid never blocks.
 * - `amountChanged`: only then is the base/IGV split recomputed. Type,
 *   counterparty and split stay as issued even if the merchant's billing
 *   data changes later.
 */
export async function syncSaleFromInvoice(
  tx: Tx,
  invoice: InvoiceRow,
  userId: string,
  { strict, amountChanged = true }: { strict: boolean; amountChanged?: boolean },
) {
  const month = invoice.issuedOn.slice(0, 7)
  const fiscal = await fiscalIssuerFor(tx, month)

  const [existing] = invoice.documentId
    ? await tx.select().from(documents).where(eq(documents.id, invoice.documentId)).limit(1)
    : []

  // A merchant invoiced by another razón social (Dfrios through Making Brands)
  // never becomes a sale of the month's issuer.
  const [override] = await tx
    .select({ issuerId: tenantBilling.issuerId })
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, invoice.tenantId))
    .limit(1)
  const otherIssuer = !!override?.issuerId && override.issuerId !== fiscal?.issuer.id

  if (
    otherIssuer &&
    existing &&
    (await isPeriodClosed(tx, existing.issuerId, existing.taxPeriod))
  ) {
    // A sale already declared in a closed month stays as it was declared (fix
    // it with a credit note); the invoice itself can still be marked paid.
    return invoice.documentId
  }
  if (!fiscal || otherIssuer) {
    await releaseSale(tx, invoice, existing, userId)
    return null
  }

  const parsed = invoice.number ? parseSerieNumero(invoice.number) : null
  if (!parsed) {
    if (!strict && !invoice.documentId) return null
    throw new DocumentError(
      `Desde ${fiscal.issuer.razonSocial} el número de la factura debe ir como serie-número (p. ej. F001-123)`,
    )
  }

  const common = {
    issuerId: fiscal.issuer.id,
    serie: parsed.serie,
    numero: parsed.numero,
    issueDate: invoice.issuedOn,
    taxPeriod: month,
    status: (invoice.status === "void" ? "void" : "registered") as "registered" | "void",
    paidOn: invoice.status === "paid" ? invoice.paidOn : null,
    updatedBy: userId,
    updatedAt: new Date(),
  }
  // An older invoice of a closed month with no sale yet: marking it paid or
  // void must not try to create a sale in declared books.
  if (!existing && !strict && (await isPeriodClosed(tx, fiscal.issuer.id, month))) return null
  await assertSyncAllowed(tx, existing, common, amountChanged, fiscal.issuer.id, month)
  if (invoice.documentId && !amountChanged) {
    await tx.update(documents).set(common).where(eq(documents.id, invoice.documentId))
    return invoice.documentId
  }

  const [billing] = await tx
    .select({
      ruc: tenantBilling.ruc,
      razonSocial: tenantBilling.razonSocial,
      amountIncludesIgv: tenantBilling.amountIncludesIgv,
    })
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, invoice.tenantId))
    .limit(1)
  const amounts = saleAmountsFromInvoice(
    Number(invoice.amount),
    billing?.amountIncludesIgv ?? true,
    fiscal.igvRate,
  )
  const money = {
    currency: invoice.currency,
    fxRate: invoice.currency === "USD" ? String(await fxForMonth(tx, month)) : null,
    baseGravada: String(amounts.baseGravada),
    baseNoGravada: "0",
    igv: String(amounts.igv),
    total: String(amounts.total),
  }
  if (invoice.documentId) {
    await tx
      .update(documents)
      .set({ ...common, ...money })
      .where(eq(documents.id, invoice.documentId))
    return invoice.documentId
  }

  const [tenant] = await tx
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, invoice.tenantId))
    .limit(1)
  const values = {
    ...common,
    ...money,
    // Factura to a RUC, boleta otherwise; the counterparty is frozen at issue.
    docType: (billing?.ruc ? "01" : "03") as DocType,
    tenantId: invoice.tenantId,
    counterpartyDoc: billing?.ruc ?? null,
    counterpartyName: billing?.razonSocial ?? tenant?.name ?? "Comercio",
  }
  const [doc] = await tx
    .insert(documents)
    .values({ direction: "sale", ...values, createdBy: userId })
    .returning({ id: documents.id })
  if (!doc) throw new Error("document insert returned nothing")
  await tx
    .update(tenantInvoices)
    .set({ documentId: doc.id })
    .where(eq(tenantInvoices.id, invoice.id))
  return doc.id
}

/* ───────────────────────── Reads ───────────────────────── */

export async function loadSuppliers() {
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name))
  return rows.map((s) => ({
    id: s.id,
    docType: s.docType,
    docNumber: s.docNumber,
    name: s.name,
    country: s.country,
    domiciled: s.domiciled,
    defaultCategory: s.defaultCategory,
    defaultIgvTreatment: s.defaultIgvTreatment,
    notes: s.notes,
  }))
}

/**
 * Finanzas › Ventas / Compras: the documents of one tax period with their
 * counterparty, linked collection record (sales) and files, plus totals in
 * soles and what the forms need (tenants or suppliers, current issuer).
 */
export async function loadDocumentsPage(direction: "sale" | "purchase", month: string) {
  const rows = await db
    .select({
      d: documents,
      issuerName: issuers.razonSocial,
      tenantName: tenants.name,
      supplierName: suppliers.name,
      supplierDomiciled: suppliers.domiciled,
      invoiceId: tenantInvoices.id,
      invoiceStatus: tenantInvoices.status,
      invoicePeriod: tenantInvoices.period,
      invoiceFileKey: tenantInvoices.invoiceFileKey,
      recurringName: recurringItems.name,
    })
    .from(documents)
    .innerJoin(issuers, eq(issuers.id, documents.issuerId))
    .leftJoin(tenants, eq(tenants.id, documents.tenantId))
    .leftJoin(suppliers, eq(suppliers.id, documents.supplierId))
    .leftJoin(tenantInvoices, eq(tenantInvoices.documentId, documents.id))
    .leftJoin(recurringItems, eq(recurringItems.id, documents.recurringItemId))
    .where(and(eq(documents.direction, direction), eq(documents.taxPeriod, month)))
    .orderBy(desc(documents.issueDate), desc(documents.createdAt))

  const docs = rows.map(({ d, ...r }) => ({
    id: d.id,
    docType: d.docType,
    docTypeLabel: DOC_TYPE_LABEL[d.docType],
    serie: d.serie,
    numero: d.numero,
    number: formatSerieNumero(d.serie, d.numero),
    issueDate: d.issueDate,
    taxPeriod: d.taxPeriod,
    issuerName: r.issuerName,
    tenantId: d.tenantId,
    tenantName: r.tenantName,
    supplierId: d.supplierId,
    supplierDomiciled: r.supplierDomiciled,
    counterpartyDoc: d.counterpartyDoc,
    counterpartyName: d.counterpartyName,
    currency: d.currency,
    fxRate: d.fxRate === null ? null : Number(d.fxRate),
    baseGravada: Number(d.baseGravada),
    baseNoGravada: Number(d.baseNoGravada),
    igv: Number(d.igv),
    total: Number(d.total),
    igvTreatment: d.igvTreatment,
    rentaDeductible: d.rentaDeductible,
    category: d.category,
    detraccionRate: d.detraccionRate === null ? null : Number(d.detraccionRate),
    detraccionConstancia: d.detraccionConstancia,
    relatedDocumentId: d.relatedDocumentId,
    status: d.status,
    paidOn: d.paidOn,
    notes: d.notes,
    entryId: d.entryId,
    /** Fixed cost of Costos e ingresos this purchase is the receipt of. */
    recurringItemId: d.recurringItemId,
    recurringName: r.recurringName,
    files: {
      pdf: d.pdfKey ? { name: d.pdfName ?? "comprobante" } : null,
      xml: d.xmlKey ? { name: d.xmlName ?? "xml" } : null,
      cdr: d.cdrKey ? { name: d.cdrName ?? "cdr" } : null,
    },
    /** Collection record in the tenant's Facturación (sales registered there). */
    invoice: r.invoiceId
      ? {
          id: r.invoiceId,
          status: r.invoiceStatus,
          period: r.invoicePeriod,
          hasFile: !!r.invoiceFileKey,
        }
      : null,
  }))

  const [issuerRows, supplierRows, tenantRows, recurringRows] = await Promise.all([
    loadIssuers(),
    direction === "purchase" ? loadSuppliers() : Promise.resolve([]),
    direction === "sale"
      ? db
          .select({
            id: tenants.id,
            name: tenants.name,
            ruc: tenantBilling.ruc,
            razonSocial: tenantBilling.razonSocial,
          })
          .from(tenants)
          .leftJoin(tenantBilling, eq(tenantBilling.tenantId, tenants.id))
          .orderBy(asc(tenants.name))
      : Promise.resolve([]),
    direction === "purchase"
      ? db
          .select({
            id: recurringItems.id,
            name: recurringItems.name,
            amount: recurringItems.amount,
            currency: recurringItems.currency,
            category: recurringItems.category,
          })
          .from(recurringItems)
          .where(and(eq(recurringItems.type, "cost"), eq(recurringItems.active, true)))
          .orderBy(asc(recurringItems.name))
      : Promise.resolve([]),
  ])
  const issuer = issuerForMonth(issuerRows, month)
  const fiscal = await fiscalIssuerFor(db, month)
  const closed = fiscal ? await isPeriodClosed(db, fiscal.issuer.id, month) : false
  // A closed month takes no new sales: nothing to offer.
  const pendingInvoices = direction === "sale" && !closed ? await invoicesWithoutSale(month) : []

  return {
    direction,
    month,
    today: currentMonthLima(),
    issuer: issuer ? { id: issuer.id, razonSocial: issuer.razonSocial, ruc: issuer.ruc } : null,
    /** IGV rate of the regime in force that month (suggests the split in the form); null before Cuik. */
    igvRate: fiscal?.igvRate ?? null,
    /** The tax month is closed: its documents are read-only (files can still be added). */
    closed,
    docs,
    /** Facturación invoices of this Cuik month still without their sale. */
    pendingInvoices,
    totals: documentTotals(docs),
    suppliers: supplierRows,
    /** Active fixed costs a purchase can be the receipt of (purchases only). */
    recurringCosts: recurringRows.map((r) => ({
      id: r.id,
      name: r.name,
      amount: Number(r.amount),
      currency: r.currency,
      category: r.category,
    })),
    tenants: tenantRows,
  }
}

export type DocumentsPage = Awaited<ReturnType<typeof loadDocumentsPage>>

/* ───────────────────────── Writes ───────────────────────── */

type DocRow = typeof documents.$inferSelect

export async function getDocument(id: string): Promise<DocRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  return row ?? null
}

/** Whether a merchant invoice in Facturación owns this document. */
export async function linkedInvoice(conn: Conn, documentId: string) {
  const [row] = await conn
    .select({ id: tenantInvoices.id, tenantId: tenantInvoices.tenantId })
    .from(tenantInvoices)
    .where(eq(tenantInvoices.documentId, documentId))
    .limit(1)
  return row ?? null
}

/** Counterparty snapshot: the supplier (purchases), the tenant's billing identity or what was typed (sales). */
async function resolveCounterparty(conn: Conn, v: DocumentInput) {
  if (v.direction === "purchase") {
    const [s] = await conn
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, v.supplierId ?? ""))
      .limit(1)
    if (!s) throw new DocumentError("Proveedor no encontrado", 404)
    return { counterpartyDoc: s.docNumber, counterpartyName: s.name }
  }
  if (!v.tenantId) {
    return {
      counterpartyDoc: v.counterpartyDoc ?? null,
      counterpartyName: v.counterpartyName ?? null,
    }
  }
  const [t] = await conn
    .select({ name: tenants.name, ruc: tenantBilling.ruc, razonSocial: tenantBilling.razonSocial })
    .from(tenants)
    .leftJoin(tenantBilling, eq(tenantBilling.tenantId, tenants.id))
    .where(eq(tenants.id, v.tenantId))
    .limit(1)
  if (!t) throw new DocumentError("Comercio no encontrado", 404)
  return { counterpartyDoc: t.ruc, counterpartyName: t.razonSocial ?? t.name }
}

/** Columns from the validated input: counterparty snapshot and issuer by the issue month. */
async function documentValues(conn: Conn, v: DocumentInput, userId: string) {
  const issueMonth = v.issueDate.slice(0, 7)
  const issuer = issuerForMonth(await conn.select().from(issuers), issueMonth)
  if (!issuer) throw new DocumentError("Ningún emisor cubre la fecha del comprobante")
  await assertPeriodOpen(conn, issuer.id, v.taxPeriod)

  const { counterpartyDoc, counterpartyName } = await resolveCounterparty(conn, v)
  if (v.recurringItemId) {
    const [r] = await conn
      .select({ type: recurringItems.type })
      .from(recurringItems)
      .where(eq(recurringItems.id, v.recurringItemId))
      .limit(1)
    if (!r || r.type !== "cost") throw new DocumentError("Costo fijo no encontrado", 404)
  }

  return {
    direction: v.direction,
    issuerId: issuer.id,
    docType: v.docType,
    serie: v.serie,
    numero: String(Number(v.numero)),
    issueDate: v.issueDate,
    taxPeriod: v.taxPeriod,
    tenantId: v.direction === "sale" ? (v.tenantId ?? null) : null,
    supplierId: v.direction === "purchase" ? (v.supplierId ?? null) : null,
    counterpartyDoc,
    counterpartyName: counterpartyName ?? "",
    currency: v.currency,
    fxRate: v.currency === "USD" && v.fxRate ? String(v.fxRate) : null,
    baseGravada: String(v.baseGravada),
    baseNoGravada: String(v.baseNoGravada),
    igv: String(v.igv),
    total: String(v.total),
    igvTreatment: v.direction === "purchase" ? (v.igvTreatment ?? null) : null,
    rentaDeductible: v.direction === "purchase" ? (v.rentaDeductible ?? null) : null,
    category: v.category ?? null,
    detraccionRate: v.detraccionRate == null ? null : String(v.detraccionRate),
    detraccionConstancia: v.detraccionConstancia ?? null,
    // Omitted = keep the current link (the form does not edit it).
    ...(v.relatedDocumentId !== undefined ? { relatedDocumentId: v.relatedDocumentId } : {}),
    // Purchases only: the fixed cost this is the receipt of. Omitted = unchanged.
    ...(v.direction === "purchase" && v.recurringItemId !== undefined
      ? { recurringItemId: v.recurringItemId }
      : {}),
    paidOn: v.paidOn ?? null,
    notes: v.notes ?? null,
    updatedBy: userId,
    updatedAt: new Date(),
  }
}

/**
 * The cost a purchase creates in Costos e ingresos. Not for credit notes (a
 * refund is not a cost); a debit note adds cost like an invoice.
 */
function costEntryValues(
  v: DocumentInput,
  values: { counterpartyName: string; serie: string; numero: string },
) {
  return {
    category: v.category ?? "Otros",
    name: `${values.counterpartyName} ${formatSerieNumero(values.serie, values.numero)}`.slice(
      0,
      200,
    ),
    amount: String(v.total),
    currency: v.currency,
    month: v.issueDate.slice(0, 7),
  }
}

/** Register a document; for purchases, optionally the matching cost in Costos e ingresos. */
export async function createDocument(v: DocumentInput, userId: string) {
  return db.transaction(async (tx) => {
    const values = await documentValues(tx, v, userId)
    let entryId: string | null = null
    // The receipt of a fixed cost already in Costos e ingresos creates no new cost.
    if (
      v.direction === "purchase" &&
      v.createCostEntry &&
      v.docType !== "07" &&
      !v.recurringItemId
    ) {
      const [entry] = await tx
        .insert(financeEntries)
        .values({
          type: "cost",
          ...costEntryValues(v, values),
          months: 1,
          recognition: "cash",
          notes: "Creado al registrar el comprobante en Compras",
          createdBy: userId,
        })
        .returning({ id: financeEntries.id })
      entryId = entry?.id ?? null
    }
    const [doc] = await tx
      .insert(documents)
      .values({ ...values, entryId, createdBy: userId })
      .returning({ id: documents.id })
    return doc?.id ?? null
  })
}

/**
 * Replace a document (not one owned by a merchant invoice: that one is edited
 * in Facturación). The cost it created follows the new amount, date and
 * category.
 */
export async function updateDocument(id: string, v: DocumentInput, userId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1)
    if (!row) throw new DocumentError("Comprobante no encontrado", 404)
    if (row.direction !== v.direction)
      throw new DocumentError("No se puede cambiar de venta a compra")
    if (await linkedInvoice(tx, id)) {
      throw new DocumentError("Este comprobante se edita desde Facturación del comercio", 409)
    }
    await assertPeriodOpen(tx, row.issuerId, row.taxPeriod)
    const values = await documentValues(tx, v, userId)
    await tx.update(documents).set(values).where(eq(documents.id, id))
    if (row.entryId) {
      if (v.docType === "07" || v.recurringItemId) {
        // A credit note is no cost, and the receipt of a fixed cost must not
        // add a second one: the cost this document created goes.
        // Turned into a credit note: it no longer is a cost.
        await tx.update(documents).set({ entryId: null }).where(eq(documents.id, id))
        await tx.delete(financeEntries).where(eq(financeEntries.id, row.entryId))
      } else {
        await tx
          .update(financeEntries)
          .set(costEntryValues(v, values))
          .where(eq(financeEntries.id, row.entryId))
      }
    }
  })
}

/** Void or reactivate a document not owned by a merchant invoice. */
export async function setDocumentStatus(id: string, status: "registered" | "void", userId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: documents.id, issuerId: documents.issuerId, taxPeriod: documents.taxPeriod })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1)
    if (!row) throw new DocumentError("Comprobante no encontrado", 404)
    if (await linkedInvoice(tx, id)) {
      throw new DocumentError("Anúlalo desde Facturación del comercio", 409)
    }
    await assertPeriodOpen(tx, row.issuerId, row.taxPeriod)
    await tx
      .update(documents)
      .set({ status, updatedBy: userId, updatedAt: new Date() })
      .where(eq(documents.id, id))
  })
}

/**
 * Deletes a document row inside the caller's transaction: releases credit
 * notes pointing at it and removes the cost it created. Returns its file keys
 * so the caller removes them from storage after the commit.
 */
export async function deleteDocumentRow(tx: Tx, id: string): Promise<string[]> {
  const [row] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1)
  if (!row) return []
  await assertPeriodOpen(tx, row.issuerId, row.taxPeriod)
  await tx
    .update(documents)
    .set({ relatedDocumentId: null })
    .where(eq(documents.relatedDocumentId, id))
  await tx.delete(documents).where(eq(documents.id, id))
  if (row.entryId) await tx.delete(financeEntries).where(eq(financeEntries.id, row.entryId))
  return [row.pdfKey, row.xmlKey, row.cdrKey].filter((k): k is string => !!k)
}

/**
 * Delete a document registered by mistake (never one owned by a merchant
 * invoice: delete the invoice in Facturación instead), with the cost it
 * created. Returns the file keys to remove.
 */
export async function deleteDocument(id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1)
    if (!row) throw new DocumentError("Comprobante no encontrado", 404)
    if (await linkedInvoice(tx, id)) {
      throw new DocumentError("Este comprobante pertenece a una factura de Facturación", 409)
    }
    return deleteDocumentRow(tx, id)
  })
}

/**
 * Creates the missing sale of a Facturación invoice in a Cuik month (one
 * registered before Ventas existed). Its number must read serie-número.
 */
export async function createSaleForInvoice(invoiceId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(tenantInvoices)
      .where(eq(tenantInvoices.id, invoiceId))
      .limit(1)
    if (!inv) throw new DocumentError("Factura no encontrada", 404)
    if (inv.documentId) return inv.documentId
    const id = await syncSaleFromInvoice(tx, inv, userId, { strict: true })
    if (!id) throw new DocumentError("Esa factura es de un mes de Making Brands")
    return id
  })
}

/**
 * Facturación invoices of a Cuik month still without a sale document (live
 * ones only): Ventas lists them so none is left out of the books.
 */
export async function invoicesWithoutSale(month: string) {
  const fiscal = await fiscalIssuerFor(db, month)
  if (!fiscal) return []
  const rows = await db
    .select({
      id: tenantInvoices.id,
      tenantName: tenants.name,
      number: tenantInvoices.number,
      issuedOn: tenantInvoices.issuedOn,
      amount: tenantInvoices.amount,
      currency: tenantInvoices.currency,
      status: tenantInvoices.status,
      documentId: tenantInvoices.documentId,
      issuerOverride: tenantBilling.issuerId,
    })
    .from(tenantInvoices)
    .innerJoin(tenants, eq(tenants.id, tenantInvoices.tenantId))
    .leftJoin(tenantBilling, eq(tenantBilling.tenantId, tenantInvoices.tenantId))
  return (
    rows
      .filter((r) => !r.documentId && r.status !== "void" && r.issuedOn.slice(0, 7) === month)
      // Merchants invoiced by another razón social never become sales of this issuer.
      .filter((r) => !r.issuerOverride || r.issuerOverride === fiscal.issuer.id)
      .map((r) => ({
        id: r.id,
        tenantName: r.tenantName,
        number: r.number,
        issuedOn: r.issuedOn,
        amount: Number(r.amount),
        currency: r.currency,
        numberOk: !!r.number && !!parseSerieNumero(r.number),
      }))
  )
}
