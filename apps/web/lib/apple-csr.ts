import forge from "node-forge"

export interface CsrResult {
  csrPem: string // PEM-encoded PKCS#10 CSR (to give to Apple)
  privateKeyPem: string // PEM-encoded RSA private key (must be encrypted before storing)
}

export function generateCsr(passTypeId: string): CsrResult {
  // 1. Generate RSA-2048 key pair
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 })

  // 2. Create PKCS#10 CSR
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey

  // Subject: CN = Pass Type ID: {passTypeId}
  // This is the standard Apple convention
  csr.setSubject([{ name: "commonName", value: `Pass Type ID: ${passTypeId}` }])

  // 3. Sign the CSR with the private key
  csr.sign(keys.privateKey, forge.md.sha256.create())

  // 4. Verify CSR is valid
  if (!csr.verify()) {
    throw new Error("CSR verification failed after signing")
  }

  // 5. Export to PEM
  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}
