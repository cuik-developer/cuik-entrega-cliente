// ─── Strip Image Dimensions ────────────────────────────────────────────

/** Apple Wallet strip image width at @2x resolution */
export const STRIP_WIDTH_2X = 750

/** Apple Wallet strip image height at @2x resolution */
export const STRIP_HEIGHT_2X = 246

/** Apple Wallet strip image width at @1x resolution */
export const STRIP_WIDTH_1X = 375

/** Apple Wallet strip image height at @1x resolution */
export const STRIP_HEIGHT_1X = 123

/** Default stamp icon size (pixels at @2x) */
export const STAMP_SIZE = 63

/** Top row Y offset (pixels at @2x) */
export const STAMP_TOP_ROW_Y = 23

/** Bottom row Y offset (pixels at @2x) */
export const STAMP_BOTTOM_ROW_Y = 136

/** Stamp grid starting X offset (pixels at @2x) */
export const STAMP_START_X = 197

/** Stamp grid horizontal gap (pixels at @2x) */
export const STAMP_GAP_X = 98

/** Opacity for filled (visited) stamps */
export const STAMP_OPACITY_FILLED = 1

/** Opacity for empty (unvisited) stamps */
export const STAMP_OPACITY_EMPTY = 0.35

/** Default stamps per row in grid layout */
export const STAMPS_PER_ROW = 4

// ─── Apple Pass Constants ──────────────────────────────────────────────

export const APPLE_PASS_FORMAT_VERSION = 1

export const APPLE_PASS_BARCODE_FORMAT = "PKBarcodeFormatQR"

export const APPLE_PASS_CONTENT_TYPE = "application/vnd.apple.pkpass"

export const APPLE_PASS_DEFAULT_DESCRIPTION = "Tarjeta de Fidelización"

/** Zero-width space — used as logoText to hide it on pass */
export const APPLE_PASS_LOGO_TEXT = "\u200B"

// ─── APNs Constants ────────────────────────────────────────────────────

export const APNS_PRODUCTION_HOST = "api.push.apple.com"

export const APNS_SANDBOX_HOST = "api.sandbox.push.apple.com"

export const APNS_PORT = 443

export const APNS_PUSH_TYPE = "background"

export const APNS_PRIORITY = "5"

// ─── Google Wallet API URLs ────────────────────────────────────────────

export const GOOGLE_WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1"

export const GOOGLE_OAUTH2_TOKEN_URL = "https://oauth2.googleapis.com/token"

export const GOOGLE_WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"

export const GOOGLE_SAVE_URL_BASE = "https://pay.google.com/gp/v/save"

// ─── Asset Loader ──────────────────────────────────────────────────────

/** Maximum number of cached asset entries */
export const ASSET_CACHE_MAX_ENTRIES = 50

/** Cache TTL in milliseconds (10 minutes) */
export const ASSET_CACHE_TTL_MS = 10 * 60 * 1000
