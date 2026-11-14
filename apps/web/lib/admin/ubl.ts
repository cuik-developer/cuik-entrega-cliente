import { at, childrenOf, parseXml, textAt, type XmlElement, XmlError } from "./xml-lite"

/**
 * What a SUNAT electronic invoice (UBL 2.1 XML: Invoice, CreditNote or
 * DebitNote) says, in the terms of Finanzas › Compras / Ventas: type,
 * serie-número, date, currency, who issued it and to whom, and the amounts
 * split as base gravada + no gravada + IGV = total.
 */
export type UblDocument = {
  docType: "01" | "03" | "07" | "08"
  serie: string
  numero: string
  issueDate: string
  currency: "PEN" | "USD"
  supplier: UblParty
  customer: UblParty
  baseGravada: number
  /** Exonerated, unaffected, export, ISC, ICBPER and other charges: total − base − IGV. */
  baseNoGravada: number
  igv: number
  total: number
  /** Detracción percentage (12 means 12 %), when the invoice carries one. */
  detraccionPct: number | null
  /** Credit and debit notes: the document they modify ("F001-12"). */
  reference: string | null
  /** Things worth a look before saving (in Spanish, for the form). */
  warnings: string[]
}

export type UblParty = {
  /** SUNAT identity type: "6" RUC, "1" DNI, "0"/"4"/"7"/"A" others. */
  docType: string | null
  doc: string | null
  name: string
}

export class UblError extends Error {}

const ROOT_TYPE: Record<string, UblDocument["docType"] | undefined> = {
  CreditNote: "07",
  DebitNote: "08",
}

/** IGV and IVAP (rice) go to the taxable base and the IGV. */
const IGV_SCHEMES = new Set(["1000", "1016"])

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function amount(el: XmlElement | null, ...path: string[]): number {
  const t = textAt(el, ...path)
  const n = t === null ? 0 : Number(t)
  return Number.isFinite(n) ? n : 0
}

function party(root: XmlElement, role: "AccountingSupplierParty" | "AccountingCustomerParty") {
  const p = at(root, role, "Party")
  const id = at(p, "PartyIdentification", "ID")
  const legacyId = at(root, role, "CustomerAssignedAccountID") // UBL 2.0
  return {
    docType: id?.attrs.schemeID ?? null,
    doc: id?.text.trim() || legacyId?.text.trim() || null,
    name: textAt(p, "PartyLegalEntity", "RegistrationName") ?? textAt(p, "PartyName", "Name") ?? "",
  } satisfies UblParty
}

/** Document type from the root element and the invoice type code. */
function docTypeOf(root: XmlElement): UblDocument["docType"] {
  const fromRoot = ROOT_TYPE[root.local]
  if (fromRoot) return fromRoot
  if (root.local !== "Invoice") {
    throw new UblError("El XML no es una factura, boleta ni nota electrónica de SUNAT")
  }
  const code = textAt(root, "InvoiceTypeCode")
  if (code === "03") return "03"
  if (code === null || code === "01") return "01"
  throw new UblError(`Tipo de comprobante ${code} no soportado`)
}

/** Base gravada and IGV from the document-level tax totals (not the lines). */
function taxes(root: XmlElement) {
  let base = 0
  let igv = 0
  let taxTotal = 0
  for (const total of childrenOf(root, "TaxTotal")) {
    taxTotal += amount(total, "TaxAmount")
    for (const sub of childrenOf(total, "TaxSubtotal")) {
      const scheme = textAt(sub, "TaxCategory", "TaxScheme", "ID")
      if (scheme && IGV_SCHEMES.has(scheme)) {
        base += amount(sub, "TaxableAmount")
        igv += amount(sub, "TaxAmount")
      }
    }
  }
  return { base: round2(base), igv: round2(igv), taxTotal: round2(taxTotal) }
}

/** Detracción percentage from the payment terms ("Detraccion" + PaymentPercent). */
function detraccion(root: XmlElement): number | null {
  for (const t of childrenOf(root, "PaymentTerms")) {
    const id = textAt(t, "ID")?.toLowerCase() ?? ""
    const pct = textAt(t, "PaymentPercent")
    if (id.startsWith("detrac") && pct !== null && Number(pct) > 0) return Number(pct)
  }
  return null
}

/** Document currency; when the code is missing, the one on the amounts. */
function currencyOf(root: XmlElement): UblDocument["currency"] {
  const declared =
    textAt(root, "DocumentCurrencyCode") ??
    at(root, "LegalMonetaryTotal", "PayableAmount")?.attrs.currencyID ??
    at(root, "RequestedMonetaryTotal", "PayableAmount")?.attrs.currencyID ??
    "PEN"
  const code = declared.trim().toUpperCase()
  if (code !== "PEN" && code !== "USD") {
    throw new UblError(`Moneda ${code} no soportada (solo soles o dólares)`)
  }
  return code
}

/**
 * Base, no gravado, IGV and total that add up. The total is the payable
 * amount; when advances or discounts take it below base + IGV, the invoice
 * value (TaxInclusiveAmount) or base + IGV is used instead. An old UBL 2.0
 * XML without taxable amounts takes total − IGV as the base.
 */
function amountsOf(root: XmlElement, warnings: string[]) {
  const monetary = at(root, "LegalMonetaryTotal") ?? at(root, "RequestedMonetaryTotal")
  const t = taxes(root)
  let base = t.base
  let total = round2(amount(monetary, "PayableAmount"))
  if (base === 0 && t.igv > 0) {
    base = round2(total - t.igv)
    warnings.push("El XML no detalla la base gravada: se tomó el total menos el IGV.")
  }
  if (total < base + t.igv - 0.005) {
    const inclusive = round2(amount(monetary, "TaxInclusiveAmount"))
    total = inclusive >= base + t.igv - 0.005 ? inclusive : round2(base + t.igv)
    warnings.push(
      "El total a pagar es menor que base + IGV (anticipos o descuentos): se registró el valor de la factura; revisa los montos.",
    )
  }
  if (t.taxTotal - t.igv > 0.005) {
    warnings.push("Trae otros tributos además del IGV (ISC o ICBPER): van como no gravado.")
  }
  return { base, igv: t.igv, total, noGravada: Math.max(0, round2(total - base - t.igv)) }
}

/** Reads a SUNAT UBL XML. Throws UblError (Spanish message) when it cannot. */
export function parseUbl(xml: string): UblDocument {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (e) {
    throw new UblError(e instanceof XmlError ? `XML dañado: ${e.message}` : "XML dañado")
  }
  const docType = docTypeOf(root)
  const id = textAt(root, "ID")
  const m = id?.match(/^([A-Z0-9]{1,4})-0*(\d{1,10})$/i)
  if (!m) throw new UblError(`Número de comprobante no reconocido: ${id ?? "vacío"}`)
  const issueDate = textAt(root, "IssueDate")
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new UblError("El XML no trae la fecha de emisión")
  }
  const currency = currencyOf(root)
  const warnings: string[] = []
  const a = amountsOf(root, warnings)
  return {
    docType,
    serie: (m[1] as string).toUpperCase(),
    numero: m[2] as string,
    issueDate,
    currency,
    supplier: party(root, "AccountingSupplierParty"),
    customer: party(root, "AccountingCustomerParty"),
    baseGravada: a.base,
    baseNoGravada: a.noGravada,
    igv: a.igv,
    total: a.total,
    detraccionPct: detraccion(root),
    reference: textAt(root, "BillingReference", "InvoiceDocumentReference", "ID"),
    warnings,
  }
}

/**
 * The text of an XML file in the encoding its declaration names (SUNAT
 * issuers often write ISO-8859-1, which read as UTF-8 garbles Ñ and
 * accents); UTF-8 when it names none or an unknown one.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200))
  const declared = head.match(/<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/i)?.[1]
  if (declared && !/^utf-?8$/i.test(declared)) {
    try {
      return new TextDecoder(declared.toLowerCase()).decode(bytes)
    } catch {
      // Unknown label: UTF-8 below.
    }
  }
  return new TextDecoder("utf-8").decode(bytes)
}
