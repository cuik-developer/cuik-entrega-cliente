import type { ApnsClientCert, AppleWalletConfig } from "@cuik/wallet/shared"

/**
 * The tenant's Pass Type ID certificate as an APNs client certificate.
 *
 * Only for a tenant-specific pass type (its `passTypeId` differs from the
 * global topic): that certificate is valid for that topic by construction,
 * so pushes do not depend on the team or scope of the global .p8 key. The
 * shared pass type keeps the provider token, which is known to work for it.
 * Returns undefined when the config is missing or not decodable.
 */
export function apnsClientCertFor(
  cfg: AppleWalletConfig | null | undefined,
  globalTopic: string | null | undefined,
): ApnsClientCert | undefined {
  if (!cfg?.passTypeId || !cfg.signerCertBase64 || !cfg.signerKeyBase64) return undefined
  if (globalTopic && cfg.passTypeId === globalTopic) return undefined
  const certPem = pem(cfg.signerCertBase64, "CERTIFICATE")
  const keyPem = pem(cfg.signerKeyBase64, "PRIVATE KEY")
  if (!certPem || !keyPem) {
    // No secret content: only which part failed, so the operator knows why the token path ran.
    console.warn(
      `[Wallet:APNs] Pass certificate for ${cfg.passTypeId} is not PEM (cert=${!!certPem} key=${!!keyPem}); using the provider token`,
    )
    return undefined
  }
  return {
    certPem,
    keyPem,
    ...(cfg.signerKeyPassphrase ? { passphrase: cfg.signerKeyPassphrase } : {}),
  }
}

/** PEM text from a value stored either as base64 of the PEM or as the PEM itself. */
function pem(value: string, marker: string): string | null {
  const raw = value.includes("-----BEGIN") ? value : Buffer.from(value, "base64").toString("utf8")
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  return text.includes("-----BEGIN") && text.toUpperCase().includes(marker) ? text : null
}
