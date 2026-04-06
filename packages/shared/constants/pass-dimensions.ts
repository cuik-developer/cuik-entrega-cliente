/** Apple Wallet pass image dimensions */

export const STRIP_1X = { width: 375, height: 123 } as const
export const STRIP_2X = { width: 750, height: 246 } as const
export const STRIP_3X = { width: 1125, height: 369 } as const
export const LOGO_MAX = { width: 480, height: 150 } as const
export const ICON = { width: 87, height: 87 } as const

export const PASS_DIMENSIONS = {
  STRIP_1X,
  STRIP_2X,
  STRIP_3X,
  LOGO_MAX,
  ICON,
} as const
