import { parseUbl, type UblDocument, UblError } from "./ubl"
import { at, childrenOf, parseXml, textAt, type XmlElement } from "./xml-lite"

/**
 * Everything a printed invoice needs from a SUNAT UBL 2.1 XML, on top of the
 * totals `parseUbl` reads for Finanzas: the lines, both addresses, the
 * payment terms (cash, or credit with its installments), the amount in words
 * (legend 1000), free-text notes and the digest the QR carries. Verified
 * against the XML SUNAT's SEE-SOL portal returns (E001-…, ISO-8859-1).
 */
export type UblInvoice = UblDocument & {
  supplierAddress: string | null
  customerAddress: string | null
  lines: UblLine[]
  /** "contado" | "credito" from the FormaPago term; null when the XML has none. */
  paymentForm: "contado" | "credito" | null
  installments: { amount: number; dueDate: string | null }[]
  dueDate: string | null
  /** Legend 1000 without the leading "SON:" ("DOSCIENTOS CINCUENTA Y 00/100 SOLES"). */
  amountInWords: string | null
  /** Notes without a legend code (the observations typed in SEE-SOL). */
  observations: string[]
  /** Other coded legends (2006 detracción, …) as written. */
  legends: string[]
  /** ds:DigestValue of the signature (the "valor resumen"). */
  digest: string | null
  /** Credit / debit notes: SUNAT reason code and its description. */
  noteReason: { code: string | null; description: string | null } | null
}

export type UblLine = {
  quantity: number
  unitCode: string | null
  description: string
  code: string | null
  /** Unit value without IGV (up to 6 decimals, as SEE-SOL writes it). */
  unitValue: number
  /** Unit price with taxes (PriceTypeCode 01), when present. */
  unitPrice: number | null
  /** Line value without IGV. */
  amount: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** An ISO date ("2026-12-16") or null: anything else never reaches the page. */
function isoDate(t: string | null): string | null {
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

function num(t: string | null): number {
  const n = t === null ? Number.NaN : Number(t)
  return Number.isFinite(n) ? n : 0
}

/** Collapses the runs of spaces SEE-SOL leaves inside CDATA. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim()

/** "Line, District, City" from a RegistrationAddress / PostalAddress; "-" parts dropped. */
function addressOf(addr: XmlElement | null): string | null {
  if (!addr) return null
  const parts = [
    textAt(addr, "AddressLine", "Line"),
    textAt(addr, "District"),
    textAt(addr, "CityName"),
  ]
    .map((p) => (p ? clean(p) : ""))
    .filter((p) => p && p !== "-")
  const unique = parts.filter(
    (p, i) => parts.findIndex((q) => q.toUpperCase() === p.toUpperCase()) === i,
  )
  return unique.length ? unique.join(", ") : null
}

const LINE_TAGS = {
  Invoice: ["InvoiceLine", "InvoicedQuantity"],
  CreditNote: ["CreditNoteLine", "CreditedQuantity"],
  DebitNote: ["DebitNoteLine", "DebitedQuantity"],
} as const

function linesOf(root: XmlElement): UblLine[] {
  const tags = LINE_TAGS[root.local as keyof typeof LINE_TAGS]
  if (!tags) return []
  const [lineTag, qtyTag] = tags
  return childrenOf(root, lineTag).map((line) => {
    const qty = at(line, qtyTag)
    const descriptions = childrenOf(at(line, "Item"), "Description")
      .map((d) => clean(d.text))
      .filter(Boolean)
    const alt = childrenOf(at(line, "PricingReference"), "AlternativeConditionPrice").find(
      (p) => textAt(p, "PriceTypeCode") === "01",
    )
    return {
      quantity: num(qty?.text.trim() ?? null),
      unitCode: qty?.attrs.unitCode ?? null,
      description: descriptions.join(" · "),
      code: textAt(line, "Item", "SellersItemIdentification", "ID"),
      unitValue: round6(num(textAt(line, "Price", "PriceAmount"))),
      unitPrice: alt ? round2(num(textAt(alt, "PriceAmount"))) : null,
      amount: round2(num(textAt(line, "LineExtensionAmount"))),
    }
  })
}

function paymentOf(root: XmlElement) {
  let form: UblInvoice["paymentForm"] = null
  const installments: UblInvoice["installments"] = []
  for (const t of childrenOf(root, "PaymentTerms")) {
    if (textAt(t, "ID")?.toLowerCase() !== "formapago") continue
    const means = textAt(t, "PaymentMeansID")?.toLowerCase() ?? ""
    if (means === "contado") form = "contado"
    else if (means === "credito") form = "credito"
    else if (means.startsWith("cuota")) {
      installments.push({
        amount: round2(num(textAt(t, "Amount"))),
        dueDate: isoDate(textAt(t, "PaymentDueDate")),
      })
    }
  }
  return { form, installments }
}

function notesOf(root: XmlElement) {
  let words: string | null = null
  const observations: string[] = []
  const legends: string[] = []
  for (const n of childrenOf(root, "Note")) {
    const text = clean(n.text)
    if (!text) continue
    const code = n.attrs.languageLocaleID
    if (code === "1000") words = text.replace(/^SON\s*:?\s*/i, "")
    else if (code) legends.push(text)
    else observations.push(text)
  }
  return { words, observations, legends }
}

/** The signature's DigestValue, wherever the extensions put it. */
function digestOf(root: XmlElement): string | null {
  for (const ext of childrenOf(at(root, "UBLExtensions"), "UBLExtension")) {
    const d = textAt(ext, "ExtensionContent", "Signature", "SignedInfo", "Reference", "DigestValue")
    if (d) return d
  }
  return null
}

/** Credit / debit notes: why they modify the document (DiscrepancyResponse). */
function noteReasonOf(root: XmlElement): UblInvoice["noteReason"] {
  const d = at(root, "DiscrepancyResponse")
  if (!d) return null
  const code = textAt(d, "ResponseCode")
  const description = textAt(d, "Description")
  return code || description ? { code, description: description ? clean(description) : null } : null
}

/** Reads a SUNAT XML for printing. Throws UblError (Spanish message) when it cannot. */
export function parseUblInvoice(xml: string): UblInvoice {
  const base = parseUbl(xml) // validates type, number, date, currency and totals
  const root = parseXml(xml)
  const supplierLegal = at(root, "AccountingSupplierParty", "Party", "PartyLegalEntity")
  const customerParty = at(root, "AccountingCustomerParty", "Party")
  const lines = linesOf(root)
  if (lines.length === 0) throw new UblError("El XML no trae ítems")
  const { form, installments } = paymentOf(root)
  const notes = notesOf(root)
  const lastInstallment =
    installments
      .map((i) => i.dueDate)
      .filter(Boolean)
      .sort()
      .pop() ?? null
  return {
    ...base,
    supplierAddress: addressOf(at(supplierLegal, "RegistrationAddress")),
    customerAddress:
      addressOf(at(customerParty, "PartyLegalEntity", "RegistrationAddress")) ??
      addressOf(at(customerParty, "PostalAddress")),
    lines,
    paymentForm: form,
    installments,
    dueDate: isoDate(textAt(root, "DueDate")) ?? lastInstallment,
    amountInWords: notes.words,
    observations: notes.observations,
    legends: notes.legends,
    digest: digestOf(root),
    noteReason: noteReasonOf(root),
  }
}

/**
 * Text of the SUNAT QR of a printed electronic invoice:
 * RUC | tipo | serie | número | IGV | total | fecha | tipo doc. adquirente | doc. adquirente | valor resumen |
 */
export function sunatQrText(inv: UblInvoice): string {
  return [
    inv.supplier.doc ?? "",
    inv.docType,
    inv.serie,
    inv.numero,
    inv.igv.toFixed(2),
    inv.total.toFixed(2),
    inv.issueDate,
    inv.customer.docType ?? "",
    inv.customer.doc ?? "",
    inv.digest ?? "",
    "",
  ].join("|")
}
