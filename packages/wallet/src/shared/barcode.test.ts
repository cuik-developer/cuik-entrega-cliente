import { describe, expect, it } from "vitest"

import { appleBarcodes, googleBarcode, shortBarcodeValue } from "./barcode"

describe("shortBarcodeValue", () => {
  it("keeps only the hex of a Cuik code", () => {
    expect(shortBarcodeValue("cuik:mascota-veloz:A1B2c3d4e5f6")).toBe("a1b2c3d4e5f6")
  })
  it("keeps any other code whole (migrated clients)", () => {
    expect(shortBarcodeValue("MV_12345678")).toBe("MV_12345678")
    expect(shortBarcodeValue("cuik:cafe:xyz")).toBe("cuik:cafe:xyz")
  })
})

describe("appleBarcodes", () => {
  it("is the same single QR as always by default", () => {
    expect(appleBarcodes("cuik:cafe:a1b2c3d4e5f6")).toEqual([
      {
        format: "PKBarcodeFormatQR",
        message: "cuik:cafe:a1b2c3d4e5f6",
        messageEncoding: "iso-8859-1",
        altText: "Powered by Cuik",
      },
    ])
    expect(appleBarcodes("cuik:cafe:a1b2c3d4e5f6", "qr")).toHaveLength(1)
  })
  it("puts Code 128 first and keeps the QR for the Apple Watch", () => {
    const [bar, qr] = appleBarcodes("cuik:cafe:a1b2c3d4e5f6", "code128")
    expect(bar).toMatchObject({ format: "PKBarcodeFormatCode128", message: "a1b2c3d4e5f6" })
    expect(qr).toMatchObject({ format: "PKBarcodeFormatQR", message: "cuik:cafe:a1b2c3d4e5f6" })
  })
  it("shows the brand under the bars, never the hex", () => {
    const [bar, qr] = appleBarcodes("cuik:cafe:a1b2c3d4e5f6", "code128")
    expect(bar.altText).toBe("Powered by Cuik")
    expect(qr.altText).toBe("Powered by Cuik")
  })
})

describe("googleBarcode", () => {
  it("keeps each payload's QR spelling by default", () => {
    expect(googleBarcode("cuik:cafe:a1b2c3d4e5f6", undefined, "qrCode", " ")).toEqual({
      type: "qrCode",
      value: "cuik:cafe:a1b2c3d4e5f6",
      alternateText: " ",
    })
    expect(googleBarcode("x", "qr", "QR_CODE", "").type).toBe("QR_CODE")
  })
  it("switches to CODE_128 with the short value and the same blank alternate text", () => {
    expect(googleBarcode("cuik:cafe:a1b2c3d4e5f6", "code128", "QR_CODE", "")).toEqual({
      type: "CODE_128",
      value: "a1b2c3d4e5f6",
      alternateText: "",
    })
    expect(googleBarcode("cuik:cafe:a1b2c3d4e5f6", "code128", "qrCode", " ").alternateText).toBe(
      " ",
    )
  })
})
