import type { UpsertLoyaltyObjectParams, UpsertResult } from "../shared/types"

const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject"

/**
 * Build the balance text for loyaltyPoints.
 * Format: "{current} de {max} visitas | Te faltan {remaining} para el premio"
 * Special cases for reward available/redeemed states.
 */
function buildBalanceText(
  stampsInCycle: number,
  maxVisits: number,
  hasReward: boolean,
  rewardRedeemed: boolean,
): string {
  if (rewardRedeemed) {
    return `Premio canjeado | Te faltan ${maxVisits} visitas para el proximo premio`
  }

  if (hasReward) {
    return `${maxVisits} de ${maxVisits} visitas | Premio disponible!`
  }

  const remaining = maxVisits - stampsInCycle
  return `${stampsInCycle} de ${maxVisits} visitas | Te faltan ${remaining} para el premio`
}

/**
 * Build the status text for textModulesData.
 */
function buildStatusText(
  stampsInCycle: number,
  maxVisits: number,
  hasReward: boolean,
  rewardRedeemed: boolean,
): string {
  if (hasReward) {
    return "Premio disponible!"
  }
  if (rewardRedeemed) {
    return "Premio canjeado"
  }
  const remaining = maxVisits - stampsInCycle
  return `Te faltan ${remaining} visitas para el proximo premio.`
}

/**
 * Build the loyaltyPoints label based on promotion type.
 * - stamps: "Sellos"
 * - discount/coupon/default: "Puntos"
 */
function buildLoyaltyPointsLabel(
  promotionType?: "stamps" | "points" | "discount" | "coupon" | "subscription",
): string {
  switch (promotionType) {
    case "points":
    case "discount":
    case "coupon":
    case "subscription":
      return "Puntos"
    default:
      return "Sellos"
  }
}

/**
 * Build the Google Wallet loyalty object payload.
 */
function buildLoyaltyObjectPayload(params: UpsertLoyaltyObjectParams) {
  const {
    issuerId,
    classId,
    serialNumber,
    clientName,
    clientDni,
    stampsInCycle,
    maxVisits,
    totalVisits,
    hasReward,
    rewardRedeemed,
    qrValue,
    promotionType,
  } = params

  // Google Wallet IDs only allow alphanumeric, dots, hyphens, and underscores
  const sanitizedSerial = serialNumber.replaceAll(":", "-")
  const objectId = `${issuerId}.${sanitizedSerial}`
  const balanceText = buildBalanceText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
  const statusText = buildStatusText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
  const loyaltyLabel = buildLoyaltyPointsLabel(promotionType)

  // ─── Dynamic vs hard-coded fields ────────────────────────────────
  if (params.designFields) {
    // Dynamic mode: map design fields to Google Wallet textModulesData
    const textModulesData: Array<{ id: string; header: string; body: string }> = []

    for (const field of params.designFields.headerFields) {
      textModulesData.push({ id: field.key, header: field.label, body: field.value })
    }
    for (const field of params.designFields.secondaryFields) {
      textModulesData.push({ id: field.key, header: field.label, body: field.value })
    }
    for (const field of params.designFields.backFields) {
      textModulesData.push({ id: field.key, header: field.label, body: field.value })
    }

    // Always use the computed balance text (from stampsInCycle/maxVisits)
    // NOT the first headerField which could be any arbitrary field
    const dynamicPayload: Record<string, unknown> = {
      id: objectId,
      classId,
      state: "ACTIVE",
      accountName: clientName,
      accountId: clientDni ?? serialNumber,
      barcode: {
        type: "qrCode",
        value: qrValue,
        alternateText: " ",
      },
      loyaltyPoints: {
        label: loyaltyLabel,
        balance: {
          string: balanceText,
        },
      },
      textModulesData,
    }

    if (params.imageUrl) {
      dynamicPayload.imageModulesData = [
        {
          mainImage: {
            sourceUri: { uri: params.imageUrl },
          },
          id: "DESIGN_IMAGE",
        },
      ]
    }

    return { objectId, payload: dynamicPayload }
  }

  // Hard-coded fallback: existing behavior for passes without design fields
  const fallbackPayload: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName: clientName,
    accountId: clientDni ?? serialNumber,
    barcode: {
      type: "QR_CODE",
      value: qrValue,
      alternateText: "",
    },
    loyaltyPoints: {
      label: loyaltyLabel,
      balance: {
        string: balanceText,
      },
    },
    textModulesData: [
      {
        id: "total_visits",
        header: "Visitas totales",
        body: String(totalVisits),
      },
      {
        id: "status",
        header: "Estado de tu tarjeta",
        body: statusText,
      },
    ],
  }

  if (params.imageUrl) {
    fallbackPayload.imageModulesData = [
      {
        mainImage: {
          sourceUri: { uri: params.imageUrl },
        },
        id: "DESIGN_IMAGE",
      },
    ]
  }

  return { objectId, payload: fallbackPayload }
}

/**
 * Upsert a Google Wallet loyalty object.
 *
 * Strategy: PUT first (update). If 404, fall back to POST (create).
 * Uses native `fetch` with Bearer token auth.
 */
export async function upsertLoyaltyObject(
  params: UpsertLoyaltyObjectParams,
): Promise<UpsertResult> {
  const { accessToken } = params
  const { objectId, payload } = buildLoyaltyObjectPayload(params)

  console.info(
    `[Wallet:Google] Upsert payload for objectId=${objectId}:`,
    JSON.stringify(payload, null, 2),
  )

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }

  // Try PUT (update) first
  const putResponse = await fetch(`${WALLET_API_BASE}/${objectId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  })

  if (putResponse.ok) {
    return { ok: true, objectId }
  }

  // If 404 on PUT, try POST (create new object)
  if (putResponse.status === 404) {
    const postResponse = await fetch(WALLET_API_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    if (postResponse.ok) {
      return { ok: true, objectId }
    }

    const postError = await postResponse.text().catch(() => "Unknown error")
    return {
      ok: false,
      error: `[Wallet:Google] POST loyalty object failed: ${postResponse.status} ${postError}`,
      status: postResponse.status,
    }
  }

  // Other error on PUT
  const putError = await putResponse.text().catch(() => "Unknown error")
  return {
    ok: false,
    error: `[Wallet:Google] PUT loyalty object failed: ${putResponse.status} ${putError}`,
    status: putResponse.status,
  }
}
