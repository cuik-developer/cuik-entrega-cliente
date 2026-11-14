import { describe, expect, it } from "vitest"
import { decodeXmlBytes, parseUbl, UblError } from "./ubl"
import { parseXml, textAt, XmlError } from "./xml-lite"

const NS = `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`

/** A SUNAT 2.1 factura: signature, CDATA names, a line with its own tax total, detracción. */
const FACTURA = `﻿<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice ${NS}>
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent>
    <ds:Signature Id="SignSUNAT"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>abc=</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature>
  </ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>E001-0000452</cbc:ID>
  <cbc:IssueDate>2026-11-10</cbc:IssueDate>
  <cbc:IssueTime>10:15:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="1001" listAgencyName="PE:SUNAT">01</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[MIL CUATROCIENTOS CINCUENTA Y 00/100 SOLES]]></cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha">PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">20100070970</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name><![CDATA[ESTUDIO]]></cbc:Name></cac:PartyName>
      <cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[ESTUDIO CONTABLE & ASOCIADOS S.A.C.]]></cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">20606652055</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>CUIK E.I.R.L.</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>
  <cac:PaymentTerms><cbc:ID>Detraccion</cbc:ID><cbc:PaymentMeansID>037</cbc:PaymentMeansID><cbc:PaymentPercent>12.00</cbc:PaymentPercent><cbc:Amount currencyID="PEN">174.00</cbc:Amount></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">221.19</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">1228.81</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">221.19</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">1228.81</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">1450.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">1450.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="ZZ">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">1228.81</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">221.19</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">1228.81</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">221.19</cbc:TaxAmount>
        <cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID></cac:TaxScheme></cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Description><![CDATA[Servicio contable noviembre]]></cbc:Description></cac:Item>
  </cac:InvoiceLine>
</Invoice>`

describe("parseXml", () => {
  it("reads namespaces, attributes, CDATA and entities", () => {
    const root = parseXml(
      `<a:r x="1"><a:b y='2'>uno &amp; dos &#241;</a:b><c><![CDATA[<tres>]]></c><d/></a:r>`,
    )
    expect(root.local).toBe("r")
    expect(root.attrs.x).toBe("1")
    expect(textAt(root, "b")).toBe("uno & dos ñ")
    expect(textAt(root, "c")).toBe("<tres>")
    expect(root.children.map((c) => c.local)).toEqual(["b", "c", "d"])
  })

  it("rejects malformed XML", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(XmlError)
    expect(() => parseXml("<a>")).toThrow(XmlError)
    expect(() => parseXml("hola")).toThrow(XmlError)
  })
})

describe("parseUbl", () => {
  it("reads a factura with detracción, ignoring the line taxes", () => {
    const d = parseUbl(FACTURA)
    expect(d).toMatchObject({
      docType: "01",
      serie: "E001",
      numero: "452",
      issueDate: "2026-11-10",
      currency: "PEN",
      baseGravada: 1228.81,
      baseNoGravada: 0,
      igv: 221.19,
      total: 1450,
      detraccionPct: 12,
      reference: null,
      warnings: [],
    })
    expect(d.supplier).toEqual({
      docType: "6",
      doc: "20100070970",
      name: "ESTUDIO CONTABLE & ASOCIADOS S.A.C.",
    })
    expect(d.customer.doc).toBe("20606652055")
  })

  it("puts exonerated amounts and ICBPER in no gravado", () => {
    const xml = FACTURA.replace(
      `<cbc:TaxAmount currencyID="PEN">221.19</cbc:TaxAmount>
    <cac:TaxSubtotal>`,
      `<cbc:TaxAmount currencyID="PEN">221.69</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">50.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>9997</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
    <cac:TaxSubtotal><cbc:TaxAmount currencyID="PEN">0.50</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>7152</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
    <cac:TaxSubtotal>`,
    ).replace(
      `<cbc:PayableAmount currencyID="PEN">1450.00</cbc:PayableAmount>`,
      `<cbc:PayableAmount currencyID="PEN">1500.50</cbc:PayableAmount>`,
    )
    const d = parseUbl(xml)
    expect(d.baseGravada).toBe(1228.81)
    expect(d.igv).toBe(221.19)
    expect(d.baseNoGravada).toBe(50.5)
    expect(d.baseGravada + d.baseNoGravada + d.igv).toBeCloseTo(d.total, 2)
    expect(d.warnings).toHaveLength(1)
  })

  it("reads a credit note in dollars with its reference", () => {
    const xml = `<?xml version="1.0"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FC01-00000007</cbc:ID>
  <cbc:IssueDate>2026-11-20</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>F001-00000123</cbc:ID><cbc:DocumentTypeCode>01</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">20512345678</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="USD">18.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="USD">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="USD">18.00</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="USD">118.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</CreditNote>`
    const d = parseUbl(xml)
    expect(d).toMatchObject({
      docType: "07",
      serie: "FC01",
      numero: "7",
      currency: "USD",
      baseGravada: 100,
      igv: 18,
      total: 118,
      reference: "F001-00000123",
    })
    expect(d.customer).toEqual({ docType: null, doc: null, name: "" })
  })

  it("reads a debit note total from RequestedMonetaryTotal and a boleta type", () => {
    const debit = `<DebitNote><cbc:ID>F001-9</cbc:ID><cbc:IssueDate>2026-11-02</cbc:IssueDate><cac:RequestedMonetaryTotal><cbc:PayableAmount>59</cbc:PayableAmount></cac:RequestedMonetaryTotal><cac:TaxTotal><cac:TaxSubtotal><cbc:TaxableAmount>50</cbc:TaxableAmount><cbc:TaxAmount>9</cbc:TaxAmount><cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal></DebitNote>`
    expect(parseUbl(debit)).toMatchObject({ docType: "08", total: 59, baseGravada: 50, igv: 9 })
    const boleta = FACTURA.replace(
      `listAgencyName="PE:SUNAT">01</cbc:InvoiceTypeCode>`,
      `listAgencyName="PE:SUNAT">03</cbc:InvoiceTypeCode>`,
    ).replace("E001-0000452", "B001-77")
    expect(parseUbl(boleta)).toMatchObject({ docType: "03", serie: "B001", numero: "77" })
  })

  it("warns when the payable amount is below base + IGV (advances)", () => {
    const xml = FACTURA.replace(
      `<cbc:PayableAmount currencyID="PEN">1450.00</cbc:PayableAmount>`,
      `<cbc:PrepaidAmount currencyID="PEN">450.00</cbc:PrepaidAmount><cbc:PayableAmount currencyID="PEN">1000.00</cbc:PayableAmount>`,
    )
    const d = parseUbl(xml)
    // The invoice value (TaxInclusiveAmount), so base + IGV = total and it can be saved.
    expect(d.total).toBe(1450)
    expect(d.baseNoGravada).toBe(0)
    expect(d.warnings[0]).toMatch(/anticipos/)
    const noInclusive = xml.replace(
      /<cbc:TaxInclusiveAmount[^>]*>[^<]*<\/cbc:TaxInclusiveAmount>/,
      "",
    )
    expect(parseUbl(noInclusive).total).toBe(1450)
  })

  it("takes the currency from the amounts when the code is missing", () => {
    const xml = FACTURA.replace(
      /<cbc:DocumentCurrencyCode[^>]*>PEN<\/cbc:DocumentCurrencyCode>/,
      "",
    )
      .split('currencyID="PEN"')
      .join('currencyID="USD"')
    expect(parseUbl(xml).currency).toBe("USD")
  })

  it("takes total − IGV as the base when the XML has no taxable amounts (UBL 2.0)", () => {
    const xml = FACTURA.split(
      '<cbc:TaxableAmount currencyID="PEN">1228.81</cbc:TaxableAmount>',
    ).join("")
    const d = parseUbl(xml)
    expect(d.baseGravada).toBe(1228.81)
    expect(d.baseNoGravada).toBe(0)
    expect(d.warnings[0]).toMatch(/base gravada/)
  })

  it("decodes an ISO-8859-1 XML as declared", () => {
    const text = '<?xml version="1.0" encoding="ISO-8859-1"?><a>COMPAÑÍA</a>'
    const latin1 = Uint8Array.from([...text].map((c) => c.charCodeAt(0)))
    expect(decodeXmlBytes(latin1)).toBe(text)
    const utf8 = new TextEncoder().encode('<?xml version="1.0"?><a>COMPAÑÍA</a>')
    expect(decodeXmlBytes(utf8)).toContain("COMPAÑÍA")
  })

  it("refuses what is not a SUNAT document", () => {
    expect(() => parseUbl("<html><body>hola</body></html>")).toThrow(UblError)
    expect(() => parseUbl("no es xml")).toThrow(/XML dañado/)
    expect(() => parseUbl(FACTURA.replace("<cbc:ID>E001-0000452</cbc:ID>", ""))).toThrow(
      /Número de comprobante/,
    )
    expect(() =>
      parseUbl(
        FACTURA.replace(/>PEN</, ">EUR<").replace('ISO 4217 Alpha">PEN', 'ISO 4217 Alpha">EUR'),
      ),
    ).toThrow(/Moneda EUR/)
  })
})
