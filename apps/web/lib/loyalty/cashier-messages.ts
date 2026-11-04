/**
 * What the cashier reads after registering a visit or redeeming, in ONE
 * place: Escanear and Buscar do the same job and must say the same thing.
 * Add a new result code here and both screens pick it up.
 */

const VISIT_MESSAGES: Record<string, string> = {
  ALREADY_SCANNED_TODAY: "Ya fue escaneado hoy",
  MAX_VISITS_REACHED: "Ya alcanzó el máximo de visitas de hoy",
  LOCATION_NOT_ALLOWED: "Esta sucursal no participa en la promoción",
  CLIENT_NOT_FOUND: "Cliente no encontrado en este comercio",
  NO_ACTIVE_PROMOTION: "No hay una promoción activa en este comercio",
  CLIENT_BLOCKED: "Cliente bloqueado: no puede registrar visitas ni canjear",
  CLIENT_ARCHIVED: "Cliente archivado: su pase ya no es válido",
  AMOUNT_REQUIRED: "El monto de compra es obligatorio",
  BELOW_MINIMUM_PURCHASE: "El monto de compra es menor al mínimo requerido",
  NO_POINTS_EARNED: "Esta compra no alcanza para sumar puntos: no se registró la visita",
}

const REDEEM_MESSAGES: Record<string, string> = {
  NO_PENDING_REWARD: "Este cliente no tiene premios pendientes",
  DUPLICATE_REDEEM: "Ese premio ya se canjeó hace unos segundos",
  INSUFFICIENT_POINTS: "Puntos insuficientes",
  CATALOG_ITEM_NOT_FOUND: "Premio no encontrado",
  CATALOG_ITEM_INACTIVE: "Premio no disponible",
  NO_ACTIVE_PROMOTION: "No hay una promoción activa en este comercio",
  CLIENT_NOT_FOUND: "Cliente no encontrado en este comercio",
  CLIENT_BLOCKED: "Cliente bloqueado: no puede registrar visitas ni canjear",
  CLIENT_ARCHIVED: "Cliente archivado: su pase ya no es válido",
}

export const VISIT_FALLBACK = "No se pudo registrar la visita. Intenta de nuevo"
export const REDEEM_FALLBACK = "No se pudo canjear. Intenta de nuevo"
export const CONNECTION_ERROR = "Error de conexión. Intenta de nuevo"

/**
 * Message for a visit that was not registered. `serverError` is the route's
 * own message (e.g. "El monto máximo por compra es S/ 10,000"), used when the
 * code is unknown or missing.
 */
export function visitRejectionMessage(code: unknown, serverError?: unknown): string {
  if (typeof code === "string" && VISIT_MESSAGES[code]) return VISIT_MESSAGES[code]
  return typeof serverError === "string" && serverError ? serverError : VISIT_FALLBACK
}

/** Message for a redeem (stamps reward or points catalog item) that did not go through. */
export function redeemRejectionMessage(code: unknown, serverError?: unknown): string {
  if (typeof code === "string" && REDEEM_MESSAGES[code]) return REDEEM_MESSAGES[code]
  return typeof serverError === "string" && serverError ? serverError : REDEEM_FALLBACK
}

const CASH_OUT_MESSAGES: Record<string, string> = {
  NOT_AVAILABLE: "Este cliente no tiene un premio anticipado para cobrar",
}

const VOID_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No se encontró ese canje",
  NOT_REDEEMED: "Ese canje ya fue anulado",
  WINDOW_PASSED: "Pasaron más de 15 minutos: pide a un administrador que lo corrija",
  VISITS_AFTER: "El cliente registró visitas después del canje: ya no se puede anular",
  FORBIDDEN: "Solo quien hizo el canje o un administrador puede anularlo",
  NOT_VOIDABLE: "Este canje no se puede anular desde la caja",
  ALREADY_VOIDED: "Este premio ya se anuló una vez: pide a un administrador que lo revise",
  CLIENT_ARCHIVED: "Cliente archivado: su pase ya no es válido",
}

export const VOID_FALLBACK = "No se pudo anular el canje. Intenta de nuevo"

/** Message for an early cash-out ("escalera canjeable") that did not go through. */
export function cashOutRejectionMessage(code: unknown, serverError?: unknown): string {
  if (typeof code === "string" && CASH_OUT_MESSAGES[code]) return CASH_OUT_MESSAGES[code]
  return redeemRejectionMessage(code, serverError)
}

/** Message for an undo of a redemption that did not go through. */
export function voidRejectionMessage(code: unknown, serverError?: unknown): string {
  if (typeof code === "string" && VOID_MESSAGES[code]) return VOID_MESSAGES[code]
  return typeof serverError === "string" && serverError ? serverError : VOID_FALLBACK
}
