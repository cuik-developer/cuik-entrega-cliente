// ─── Pass barcode: QR (default) or Code 128 ──────────────────────────
//
// Stores with a barcode gun read 1D codes faster than a phone camera reads a
// QR. The gun "types" what it reads like a keyboard, and with a Latin
// American layout ":" and "-" come out as other characters; so the Code 128
// carries only the 12 hex characters of `cuik:<slug>:<hex>` (layout-proof,
// wider bars). The cashier screens rebuild the full code with the tenant slug.
// Codes in any other format (migrated clients) are encoded whole.

export type BarcodeFormat = "qr" | "code128"

const CUIK_CODE = /^cuik:[a-z0-9-]+:([0-9a-f]{12})$/i

/** What the Code 128 encodes: the 12 hex chars of a Cuik code, else the whole code. */
export function shortBarcodeValue(qrCode: string): string {
  const m = CUIK_CODE.exec(qrCode)
  return m ? m[1].toLowerCase() : qrCode
}

type AppleBarcode = {
  format: "PKBarcodeFormatQR" | "PKBarcodeFormatCode128"
  message: string
  messageEncoding: string
  altText: string
}

/**
 * Barcodes for an Apple pass, in order of preference. iOS shows the first one
 * it supports; the Apple Watch cannot show Code 128 and falls back to the QR.
 * With "qr" (or nothing) this is exactly the pass we always shipped.
 */
export function appleBarcodes(qrCode: string, format?: BarcodeFormat): AppleBarcode[] {
  const qr: AppleBarcode = {
    format: "PKBarcodeFormatQR",
    message: qrCode,
    messageEncoding: "iso-8859-1",
    altText: "Powered by Cuik",
  }
  if (format !== "code128") return [qr]
  // Same text under the bars as under the QR. The 12 hex chars are not shown:
  // when the gun fails, the till searches by name or DNI, never by typing them.
  return [
    {
      format: "PKBarcodeFormatCode128",
      message: shortBarcodeValue(qrCode),
      messageEncoding: "iso-8859-1",
      altText: qr.altText,
    },
    qr,
  ]
}

/**
 * Barcode of a Google loyalty object. `qrType` keeps the enum spelling each
 * payload already used ("qrCode" / "QR_CODE"), so "qr" changes nothing; the
 * alternate text stays the one the payload always sent (blank), in both formats.
 */
export function googleBarcode(
  qrCode: string,
  format: BarcodeFormat | undefined,
  qrType: "qrCode" | "QR_CODE",
  alternateText: string,
): { type: string; value: string; alternateText: string } {
  if (format !== "code128") return { type: qrType, value: qrCode, alternateText }
  return { type: "CODE_128", value: shortBarcodeValue(qrCode), alternateText }
}
