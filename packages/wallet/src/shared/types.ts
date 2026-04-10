// ─── Shared Wallet Types ───────────────────────────────────────────────

// ─── Environment / Config ──────────────────────────────────────────────

export type AppleWalletConfig = {
  teamId: string
  passTypeId: string
  signerKeyBase64: string
  signerCertBase64: string
  signerKeyPassphrase?: string
  wwdrBase64: string
  authSecret: string
  webServiceUrl: string
}

export type AppleApnsConfig = {
  keyId: string
  teamId: string
  p8Base64: string
  topic: string
}

export type GoogleWalletConfig = {
  issuerId: string
  serviceAccountJson: {
    client_email: string
    private_key: string
  }
}

export type WalletAvailability = {
  apple: boolean
  google: boolean
}

// ─── Strip Image ───────────────────────────────────────────────────────

export type StampGridLayout = {
  cols: number
  rows: number
  stampSize: number
  offsetX: number
  offsetY: number
  gapX: number
  gapY: number
  filledOpacity: number
  emptyOpacity: number
  fillOrder?: "row" | "interleaved"
  rowOffsets?: Array<{ x: number; y: number }>
}

export type StripImageParams = {
  backgroundImageDataUri: string
  stampImageDataUri: string
  stampsInCycle: number
  maxVisits: number
  gridLayout?: StampGridLayout
}

export type StripImageResult = {
  strip2x: Buffer
  strip1x: Buffer
}

// ─── Apple Pass ────────────────────────────────────────────────────────

export type CreateApplePassParams = {
  // Pass identity
  teamId: string
  passTypeId: string
  serialNumber: string
  authToken: string
  webServiceUrl: string

  // Certificates (PEM strings, decoded from base64 env vars)
  signerCert: string
  signerKey: string
  signerKeyPassphrase?: string
  wwdr: string

  // Pass content
  organizationName: string
  description: string
  logoText: string
  colors: {
    background: string
    foreground: string
    label: string
  }

  // Dynamic fields
  clientName: string
  stampsInCycle: number
  maxVisits: number
  totalVisits: number
  pendingRewards: number
  rewardValue?: string

  // Barcode
  qrMessage: string

  // Images (Buffers)
  stripImage2x: Buffer
  stripImage1x: Buffer
  logo?: Buffer
  icon: Buffer

  // Engagement features
  locations?: Array<{ latitude: number; longitude: number; relevantText?: string }>
  relevantDate?: Date

  // Dynamic fields from pass design (optional — when absent, hard-coded fields used)
  designFields?: {
    headerFields: Array<{ key: string; label: string; value: string; changeMessage?: string }>
    secondaryFields: Array<{ key: string; label: string; value: string; changeMessage?: string }>
    backFields: Array<{ key: string; label: string; value: string; changeMessage?: string }>
    auxiliaryFields?: Array<{ key: string; label: string; value: string; changeMessage?: string }>
  } | null
}

export type CreateApplePassResult =
  | { ok: true; buffer: Buffer; serial: string }
  | { ok: false; error: string }

// ─── APNs Push ─────────────────────────────────────────────────────────

export type ApnsPushParams = {
  deviceTokens: string[]
  passTypeId: string
  p8KeyPem: string
  teamId: string
  keyId: string
}

export type ApnsPushTokenResult = {
  tokenPrefix: string
  ok: boolean
  status: number
  envUsed: "production" | "sandbox"
  error?: string
}

export type ApnsPushResult = {
  sent: number
  total: number
  results: ApnsPushTokenResult[]
}

// ─── Apple Web Service Protocol ────────────────────────────────────────

export type WebServiceResponse = {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

export type WebServiceDeps = {
  findDeviceRegistration: (
    deviceLibId: string,
    serialNumber: string,
  ) => Promise<{ pushToken: string | null } | null>
  insertDeviceRegistration: (
    deviceLibId: string,
    passTypeId: string,
    serialNumber: string,
    pushToken: string,
  ) => Promise<void>
  deleteDeviceRegistration: (deviceLibId: string, serialNumber: string) => Promise<void>
  getSerialsForDevice: (
    deviceLibId: string,
    passTypeId: string,
    updatedSince?: string,
  ) => Promise<{ serialNumbers: string[]; lastUpdated: string }>
  getPassInstance: (serialNumber: string) => Promise<{
    authToken: string
    lastUpdatedAt: Date | null
    etag: string | null
    clientId: string
    designId: string
    campaignMessage: string | null
  } | null>
  verifyAuthToken: (serialNumber: string, token: string) => boolean
}

// ─── Google Wallet ─────────────────────────────────────────────────────

export type UpsertLoyaltyObjectParams = {
  issuerId: string
  classId: string
  serialNumber: string
  clientName: string
  clientDni?: string
  stampsInCycle: number
  maxVisits: number
  totalVisits: number
  hasReward: boolean
  rewardRedeemed: boolean
  qrValue: string
  accessToken: string

  // Promotion type — affects loyaltyPoints label. Defaults to "stamps" behavior.
  promotionType?: "stamps" | "points" | "discount" | "coupon" | "subscription"

  // Dynamic fields from pass design (optional — when absent, hard-coded fields used)
  designFields?: {
    headerFields: Array<{ key: string; label: string; value: string }>
    secondaryFields: Array<{ key: string; label: string; value: string }>
    backFields: Array<{ key: string; label: string; value: string }>
  } | null

  // Optional image below QR code (imageModulesData)
  imageUrl?: string
}

export type UpsertResult =
  | { ok: true; objectId: string }
  | { ok: false; error: string; status?: number }

export type SaveLinkParams = {
  objectId: string
  serviceAccountEmail: string
  privateKey: string
  origins: string[]
}

// ─── Wallet Update Orchestrator ────────────────────────────────────────

export type WalletUpdateParams = {
  clientId: string
  tenantId: string
  serialNumber: string
  stampsInCycle: number
  maxVisits: number
  totalVisits: number
  hasReward: boolean
  rewardRedeemed: boolean
  clientName: string
  apple: {
    deviceTokens: string[]
    passTypeId: string
    p8KeyPem: string
    teamId: string
    keyId: string
  } | null
  google: {
    issuerId: string
    classId: string
    accessToken: string
    qrValue: string
  } | null
  // Promotion type — affects loyaltyPoints label in Google Wallet. Defaults to "stamps".
  promotionType?: "stamps" | "points" | "discount" | "coupon" | "subscription"
  // Resolved design fields for Google upsert (optional — when absent, hard-coded fallback used)
  designFields?: {
    headerFields: Array<{ key: string; label: string; value: string }>
    secondaryFields: Array<{ key: string; label: string; value: string }>
    backFields: Array<{ key: string; label: string; value: string }>
  } | null
}

export type WalletUpdateResult = {
  apple: ApnsPushResult | { skipped: true; reason: string }
  google: UpsertResult | { skipped: true; reason: string }
}

// ─── Pass Design / Asset Data (read from DB, passed to wallet functions) ─

export type PassDesignData = {
  id: string
  tenantId: string
  name: string
  type: string
  colors: {
    backgroundColor: string
    foregroundColor: string
    labelColor: string
  }
  stampsConfig: {
    maxVisits: number
    gridCols: number
    gridRows: number
  }
  fields: {
    headerFields?: Array<{ key: string; label: string; value: string }>
    secondaryFields?: Array<{ key: string; label: string; value: string }>
    backFields?: Array<{ key: string; label: string; value: string }>
  }
}

export type PassAssetData = {
  id: string
  designId: string
  type: "logo" | "icon" | "strip_bg" | "stamp" | "background"
  url: string
  metadata?: unknown
}

// ─── Device Registration ───────────────────────────────────────────────

export type DeviceRegistration = {
  deviceLibId: string
  passTypeId: string
  serialNumber: string
  pushToken: string | null
}
