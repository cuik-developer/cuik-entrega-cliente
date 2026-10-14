import { describe, expect, it } from "vitest"
import { apnsClientCertFor } from "./apns-client-cert"

const CERT = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"
const KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----"
const b64 = (s: string) => Buffer.from(s).toString("base64")
const base = {
  teamId: "939CA98HMS",
  passTypeId: "pass.cuik.org.don-clarito",
  signerCertBase64: b64(CERT),
  signerKeyBase64: b64(KEY),
  wwdrBase64: "",
  authSecret: "x",
  webServiceUrl: "https://cuik.org/api/apple-wallet/v1",
}

describe("apnsClientCertFor", () => {
  it("decodes the tenant's pass certificate for a tenant-specific pass type", () => {
    const cc = apnsClientCertFor(base, "pass.cuik.org")
    expect(cc?.certPem).toBe(CERT)
    expect(cc?.keyPem).toBe(KEY)
    expect(cc?.passphrase).toBeUndefined()
    expect(
      apnsClientCertFor({ ...base, signerKeyPassphrase: "s" }, "pass.cuik.org")?.passphrase,
    ).toBe("s")
  })

  it("accepts PEM stored verbatim and normalises line endings", () => {
    const cc = apnsClientCertFor(
      { ...base, signerCertBase64: CERT.replace(/\n/g, "\r\n"), signerKeyBase64: KEY },
      "pass.cuik.org",
    )
    expect(cc?.certPem).toBe(CERT)
  })

  it("keeps the provider token for the shared pass type and for incomplete configs", () => {
    expect(
      apnsClientCertFor({ ...base, passTypeId: "pass.cuik.org" }, "pass.cuik.org"),
    ).toBeUndefined()
    expect(apnsClientCertFor(null, "pass.cuik.org")).toBeUndefined()
    expect(apnsClientCertFor({ ...base, signerKeyBase64: "" }, "pass.cuik.org")).toBeUndefined()
    expect(
      apnsClientCertFor({ ...base, signerCertBase64: b64("junk") }, "pass.cuik.org"),
    ).toBeUndefined()
  })
})
