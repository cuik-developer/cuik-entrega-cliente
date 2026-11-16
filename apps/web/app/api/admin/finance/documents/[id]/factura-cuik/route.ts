import { randomBytes } from "node:crypto"
import { db, documents, eq, issuers, tenantBilling, tenantInvoices } from "@cuik/db"
import QRCode from "qrcode"
import { periodLabel, renderBrandedInvoice } from "@/lib/admin/invoice-html"
import { requireSuperAdmin, UUID_RE } from "@/lib/admin/route-guard"
import { decodeXmlBytes, UblError } from "@/lib/admin/ubl"
import { parseUblInvoice, sunatQrText } from "@/lib/admin/ubl-invoice"
import { errorResponse } from "@/lib/api-utils"
import { LEGAL } from "@/lib/legal"
import { getAsset } from "@/lib/storage"

export const runtime = "nodejs"

const DEFAULT_THANKS = "Gracias por hacer que tus clientes vuelvan."
const MAX_XML_BYTES = 2 * 1024 * 1024

async function readAll(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const b = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
    size += b.length
    if (size > MAX_XML_BYTES) {
      // Release the storage connection before giving up.
      ;(stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
      throw new UblError("El XML es demasiado grande")
    }
    chunks.push(b)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

function htmlError(message: string, status: number) {
  return new Response(
    `<!DOCTYPE html><meta charset="utf-8"><title>Factura Cuik</title><p style="font-family:Arial,sans-serif;margin:40px">${message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</p>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'",
      },
    },
  )
}

/**
 * The Cuik-branded printed version of an issued invoice, built from the XML
 * SUNAT returned (attached to the sale in Finanzas › Ventas). An HTML page
 * the owner saves as PDF from the browser (`?print=1` opens the dialog).
 * Super-admin only, never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)

    const [doc] = await db
      .select({
        direction: documents.direction,
        status: documents.status,
        xmlKey: documents.xmlKey,
        issuerId: documents.issuerId,
        tenantId: documents.tenantId,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1)
    if (!doc || doc.direction !== "sale") return errorResponse("Not found", 404)
    if (doc.status === "void")
      return htmlError("Esta venta está anulada: no se genera su factura Cuik.", 409)
    if (!doc.xmlKey)
      return htmlError("Adjunta el XML de SUNAT a esta venta para generar la factura Cuik.", 409)

    const [[issuer], [billing], [invoice]] = await Promise.all([
      db.select().from(issuers).where(eq(issuers.id, doc.issuerId)).limit(1),
      doc.tenantId
        ? db
            .select({ direccionFiscal: tenantBilling.direccionFiscal })
            .from(tenantBilling)
            .where(eq(tenantBilling.tenantId, doc.tenantId))
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ period: tenantInvoices.period, months: tenantInvoices.months })
        .from(tenantInvoices)
        .where(eq(tenantInvoices.documentId, id))
        .limit(1),
    ])
    if (!issuer) return errorResponse("Not found", 404)
    // Cuik's brand only goes on Cuik's own invoices (not Making Brands history).
    if (issuer.ruc !== LEGAL.ruc) {
      return htmlError(`La factura Cuik es solo para comprobantes de ${LEGAL.razonSocial}.`, 409)
    }

    const { stream } = await getAsset(doc.xmlKey)
    let inv: ReturnType<typeof parseUblInvoice>
    try {
      inv = parseUblInvoice(decodeXmlBytes(await readAll(stream)))
    } catch (e) {
      if (e instanceof UblError) return htmlError(`No se pudo leer el XML: ${e.message}`, 422)
      throw e
    }
    if (inv.supplier.doc && inv.supplier.doc !== issuer.ruc) {
      return htmlError(
        `El XML es de otro emisor (RUC ${inv.supplier.doc}); esta venta es de ${issuer.razonSocial}.`,
        422,
      )
    }

    const qrSvg = await QRCode.toString(sunatQrText(inv), {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "Q",
      color: { dark: "#231F20", light: "#FFFFFF" },
    })
    const nonce = randomBytes(16).toString("base64")
    const html = renderBrandedInvoice({
      inv,
      issuer: {
        razonSocial: issuer.razonSocial,
        ruc: issuer.ruc,
        domicilioFiscal: issuer.domicilioFiscal,
        paymentInfo: issuer.invoicePaymentInfo,
        thanks: issuer.invoiceThanks ?? DEFAULT_THANKS,
      },
      customerAddressFallback: billing?.direccionFiscal ?? null,
      periodLabel: invoice ? periodLabel(invoice.period, invoice.months) : null,
      qrSvg,
      logoUrl: "/firma/cuik-firma-isotipo.png",
      nonce,
      autoPrint: new URL(request.url).searchParams.get("print") === "1",
    })
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": [
          "default-src 'none'",
          "img-src 'self' data:",
          "style-src 'unsafe-inline' https://fonts.googleapis.com",
          "font-src https://fonts.gstatic.com",
          `script-src 'nonce-${nonce}'`,
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; "),
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/documents/[id]/factura-cuik]", err)
    return errorResponse("Internal server error", 500)
  }
}
