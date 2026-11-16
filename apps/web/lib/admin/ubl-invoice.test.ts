import { describe, expect, it } from "vitest"
import { dmy, esc, periodLabel, renderBrandedInvoice } from "./invoice-html"
import { UblError } from "./ubl"
import { parseUblInvoice, sunatQrText } from "./ubl-invoice"

/** Shaped like the XML SUNAT's SEE-SOL portal returns (E001-…), trimmed. */
const SEE_SOL = `<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?><?xml-stylesheet type="text/xsl" href="factura2.1.xsl"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension><ext:ExtensionContent><sac:AdditionalInformation>
    </sac:AdditionalInformation></ext:ExtensionContent></ext:UBLExtension>
    <ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="SignSUNAT"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>ooOloG9DZS3uj9p6J+fYM+xqsL0=</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature></ext:ExtensionContent></ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>E001-36</cbc:ID>
  <cbc:IssueDate>2026-11-16</cbc:IssueDate>
  <!-- COD 2106 : TIPO DE OPERACION TAXFREE  -->
  <cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[SON:  DOSCIENTOS CINCUENTA Y 00/100  SOLES]]></cbc:Note>
  <cbc:Note><![CDATA[SERVICIO CORRESPONDIENTE AL PERIODO OCTUBRE 2026. PAGO AL CONTADO.]]></cbc:Note>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">20606652055</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name/></cac:PartyName>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName><![CDATA[CUIK E.I.R.L.]]></cbc:RegistrationName>
      <cac:RegistrationAddress>
        <cbc:CitySubdivisionName>-</cbc:CitySubdivisionName>
        <cbc:CityName><![CDATA[LIMA]]></cbc:CityName>
        <cbc:District><![CDATA[SANTIAGO DE SURCO]]></cbc:District>
        <cac:AddressLine><cbc:Line><![CDATA[VELASCO ASTETE 1879 URB. LAS GARDENIAS DPTO. 201]]></cbc:Line></cac:AddressLine>
      </cac:RegistrationAddress>
    </cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">20123456789</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[COMERCIO DE PRUEBA S.A.C.]]></cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">38.14</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">211.86</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">38.14</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">211.86</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="PEN">250.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">1.00</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">211.8644068</cbc:LineExtensionAmount>
    <cac:PricingReference><cac:AlternativeConditionPrice>
      <cbc:PriceAmount currencyID="PEN">250.000000024</cbc:PriceAmount>
      <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
    </cac:AlternativeConditionPrice></cac:PricingReference>
    <cac:Item>
      <cbc:Description><![CDATA[SUSCRIPCIÓN PLAN PRO - PROGRAMA DE FIDELIZACIÓN CUIK - 10/2026]]></cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>PLAN PRO</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="PEN">211.8644068</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`

const CREDIT = SEE_SOL.replace(
  "<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>",
  `<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Credito</cbc:PaymentMeansID><cbc:Amount currencyID="PEN">250.00</cbc:Amount></cac:PaymentTerms>
   <cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID><cbc:Amount currencyID="PEN">250.00</cbc:Amount><cbc:PaymentDueDate>2026-12-16</cbc:PaymentDueDate></cac:PaymentTerms>`,
)

const render = (xml: string, extra: Partial<Parameters<typeof renderBrandedInvoice>[0]> = {}) =>
  renderBrandedInvoice({
    inv: parseUblInvoice(xml),
    issuer: {
      razonSocial: "CUIK E.I.R.L.",
      ruc: "20606652055",
      domicilioFiscal: null,
      paymentInfo: "BCP Soles · Cta. 123\nYape: 999 999 999",
      thanks: "Gracias por hacer que tus clientes vuelvan.",
    },
    customerAddressFallback: "Av. Siempre Viva 123, Lima",
    periodLabel: "octubre 2026",
    qrSvg: "<svg></svg>",
    logoUrl: "/firma/cuik-firma-isotipo.png",
    nonce: "abc",
    autoPrint: false,
    ...extra,
  })

describe("parseUblInvoice", () => {
  it("reads a SEE-SOL invoice: lines, addresses, payment, words, notes and digest", () => {
    const inv = parseUblInvoice(SEE_SOL)
    expect(inv.serie).toBe("E001")
    expect(inv.numero).toBe("36")
    expect(inv.total).toBe(250)
    expect(inv.lines).toEqual([
      {
        quantity: 1,
        unitCode: "NIU",
        description: "SUSCRIPCIÓN PLAN PRO - PROGRAMA DE FIDELIZACIÓN CUIK - 10/2026",
        code: "PLAN PRO",
        unitValue: 211.864407,
        unitPrice: 250,
        amount: 211.86,
      },
    ])
    expect(inv.supplierAddress).toBe(
      "VELASCO ASTETE 1879 URB. LAS GARDENIAS DPTO. 201, SANTIAGO DE SURCO, LIMA",
    )
    expect(inv.customerAddress).toBeNull()
    expect(inv.paymentForm).toBe("contado")
    expect(inv.installments).toEqual([])
    expect(inv.dueDate).toBeNull()
    expect(inv.amountInWords).toBe("DOSCIENTOS CINCUENTA Y 00/100 SOLES")
    expect(inv.observations).toEqual([
      "SERVICIO CORRESPONDIENTE AL PERIODO OCTUBRE 2026. PAGO AL CONTADO.",
    ])
    expect(inv.digest).toBe("ooOloG9DZS3uj9p6J+fYM+xqsL0=")
  })

  it("reads credit terms and takes the last installment as due date", () => {
    const inv = parseUblInvoice(CREDIT)
    expect(inv.paymentForm).toBe("credito")
    expect(inv.installments).toEqual([{ amount: 250, dueDate: "2026-12-16" }])
    expect(inv.dueDate).toBe("2026-12-16")
  })

  it("drops a due date that is not an ISO date", () => {
    const evil = CREDIT.replace(
      "<cbc:PaymentDueDate>2026-12-16</cbc:PaymentDueDate>",
      '<cbc:PaymentDueDate>&lt;meta http-equiv="refresh" content="0;url=//x"&gt;</cbc:PaymentDueDate>',
    )
    const inv = parseUblInvoice(evil)
    expect(inv.installments).toEqual([{ amount: 250, dueDate: null }])
    expect(inv.dueDate).toBeNull()
    expect(render(evil)).not.toContain("<meta http-equiv")
  })

  it("reads the reason of a credit note", () => {
    const note = SEE_SOL.replace(
      /<Invoice ([^>]*)>/,
      "<CreditNote $1><cac:DiscrepancyResponse><cbc:ReferenceID>E001-36</cbc:ReferenceID><cbc:ResponseCode>01</cbc:ResponseCode><cbc:Description><![CDATA[ANULACION DE LA OPERACION]]></cbc:Description></cac:DiscrepancyResponse><cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>E001-36</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>",
    )
      .replace("</Invoice>", "</CreditNote>")
      .replace(/<cbc:InvoiceTypeCode[^<]*<\/cbc:InvoiceTypeCode>/, "")
      .replace(/InvoiceLine>/g, "CreditNoteLine>")
      .replace(/InvoicedQuantity/g, "CreditedQuantity")
    const inv = parseUblInvoice(note)
    expect(inv.docType).toBe("07")
    expect(inv.noteReason).toEqual({ code: "01", description: "ANULACION DE LA OPERACION" })
    const html = render(note)
    expect(html).toContain("Nota de crédito electrónica")
    expect(html).toContain("<span>Motivo</span><span>ANULACION DE LA OPERACION</span>")
    expect(html).toContain("<span>Modifica a</span><span>E001-36</span>")
  })

  it("builds the SUNAT QR text", () => {
    expect(sunatQrText(parseUblInvoice(SEE_SOL))).toBe(
      "20606652055|01|E001|36|38.14|250.00|2026-11-16|6|20123456789|ooOloG9DZS3uj9p6J+fYM+xqsL0=|",
    )
  })

  it("refuses an XML without lines", () => {
    const noLines = SEE_SOL.replace(/<cac:InvoiceLine>[\s\S]*<\/cac:InvoiceLine>/, "")
    expect(() => parseUblInvoice(noLines)).toThrow(UblError)
  })
})

describe("renderBrandedInvoice", () => {
  it("prints the invoice data, the period and the fallback address", () => {
    const html = render(SEE_SOL)
    expect(html).toContain("E001-36")
    expect(html).toContain("Factura electrónica")
    expect(html).toContain("COMERCIO DE PRUEBA S.A.C.")
    expect(html).toContain("RUC 20123456789")
    expect(html).toContain("Av. Siempre Viva 123, Lima")
    expect(html).toContain("Periodo del servicio: <b>octubre 2026</b>")
    expect(html).toContain("S/ 250.00")
    expect(html).toContain('<td class="r">S/ 211.86</td>')
    expect(html).toContain("Contado")
    expect(html).toContain("Datos para pagar")
    expect(html).toContain("Valor resumen: ooOloG9DZS3uj9p6J+fYM+xqsL0=")
    expect(html).toContain('<script nonce="abc">')
  })

  it("shows the due date only on credit invoices", () => {
    expect(render(SEE_SOL)).not.toContain("Vencimiento")
    const credit = render(CREDIT)
    expect(credit).toContain("Vencimiento")
    expect(credit).toContain("16/12/2026")
    expect(credit).toContain("Cuota 1: S/ 250.00 · vence 16/12/2026")
  })

  it("escapes what comes from the XML and the database", () => {
    const evil = SEE_SOL.replace("COMERCIO DE PRUEBA S.A.C.", '<img src=x onerror="alert(1)">')
    const html = render(evil, {
      issuer: {
        razonSocial: "<b>x</b>",
        ruc: "20606652055",
        domicilioFiscal: null,
        paymentInfo: "<script>alert(1)</script>",
        thanks: null,
      },
    })
    expect(html).not.toContain('<img src=x onerror="alert(1)">')
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it("leaves out the payment block and the thanks line when empty", () => {
    const html = render(SEE_SOL, {
      issuer: {
        razonSocial: "CUIK E.I.R.L.",
        ruc: "20606652055",
        domicilioFiscal: null,
        paymentInfo: null,
        thanks: null,
      },
    })
    expect(html).not.toContain("Datos para pagar")
    expect(html).not.toContain('class="thanks"')
  })
})

describe("helpers", () => {
  it("formats periods, dates and escapes", () => {
    expect(periodLabel("2026-11", 1)).toBe("noviembre 2026")
    expect(periodLabel("2026-11", 3)).toBe("noviembre 2026 – enero 2027")
    expect(periodLabel("2026-13", 1)).toBeNull()
    expect(dmy("2026-11-16")).toBe("16/11/2026")
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })
})
