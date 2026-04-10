import { PKPass } from "passkit-generator"

import {
  APPLE_PASS_BARCODE_FORMAT,
  APPLE_PASS_CONTENT_TYPE,
  APPLE_PASS_FORMAT_VERSION,
} from "../shared/constants"
import type { CreateApplePassParams, CreateApplePassResult } from "../shared/types"

/** Convert hex color (#RRGGBB) to Apple's required rgb(r,g,b) format. Passes through rgb() strings unchanged. */
function toAppleRgb(color: string): string {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/)
  if (!hex) return color
  const r = Number.parseInt(hex[1].slice(0, 2), 16)
  const g = Number.parseInt(hex[1].slice(2, 4), 16)
  const b = Number.parseInt(hex[1].slice(4, 6), 16)
  return `rgb(${r},${g},${b})`
}

/**
 * Create a signed .pkpass buffer for Apple Wallet.
 *
 * Uses passkit-generator's PKPass with in-memory buffers (no filesystem temp dir).
 * Builds a storeCard-type pass with dynamic fields, strip images, barcode, and
 * web service protocol configuration for auto-updates.
 *
 * @param params - All data needed to build the pass (certs, content, images)
 * @returns Buffer containing the signed .pkpass file, or an error
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pass generation requires sequential validation and assembly
export async function createApplePass(
  params: CreateApplePassParams,
): Promise<CreateApplePassResult> {
  try {
    console.info(
      `[Wallet:CreatePass] serial=${params.serialNumber}`,
      `passTypeId=${params.passTypeId} teamId=${params.teamId}`,
      `webServiceUrl=${params.webServiceUrl}`,
      `colors=${JSON.stringify(params.colors)}`,
      `signerCert=${params.signerCert.slice(0, 40)}...`,
      `signerKey=${params.signerKey.slice(0, 40)}...`,
      `wwdr=${params.wwdr.slice(0, 40)}...`,
      `icon=${params.icon.byteLength}b strip2x=${params.stripImage2x.byteLength}b`,
      `logo=${params.logo?.byteLength ?? 0}b`,
      `hasDesignFields=${!!params.designFields}`,
    )

    const pass = new PKPass(
      {},
      {
        wwdr: params.wwdr,
        signerCert: params.signerCert,
        signerKey: params.signerKey,
        ...(params.signerKeyPassphrase ? { signerKeyPassphrase: params.signerKeyPassphrase } : {}),
      },
      {
        formatVersion: APPLE_PASS_FORMAT_VERSION,
        passTypeIdentifier: params.passTypeId,
        teamIdentifier: params.teamId,
        serialNumber: params.serialNumber,
        organizationName: params.organizationName,
        description: params.description,
        logoText: params.logoText,

        // Colors — Apple requires rgb(r,g,b), convert hex if needed
        backgroundColor: toAppleRgb(params.colors.background),
        foregroundColor: toAppleRgb(params.colors.foreground),
        labelColor: toAppleRgb(params.colors.label),

        // Web Service Protocol (auto-updates)
        webServiceURL: params.webServiceUrl,
        authenticationToken: params.authToken,
      },
    )

    // ─── Pass type: storeCard ─────────────────────────────────────────
    pass.type = "storeCard"

    // ─── Dynamic vs hard-coded fields ────────────────────────────────
    if (params.designFields) {
      // Dynamic mode: use resolved fields from pass design
      for (const field of params.designFields.headerFields) {
        pass.headerFields.push({
          key: field.key,
          label: field.label,
          value: field.value,
          ...(field.changeMessage ? { changeMessage: field.changeMessage } : {}),
        })
      }
      for (const field of params.designFields.secondaryFields) {
        pass.secondaryFields.push({
          key: field.key,
          label: field.label,
          value: field.value,
          ...(field.changeMessage ? { changeMessage: field.changeMessage } : {}),
        })
      }
      for (const field of params.designFields.auxiliaryFields ?? []) {
        pass.auxiliaryFields.push({
          key: field.key,
          label: field.label,
          value: field.value,
          ...(field.changeMessage ? { changeMessage: field.changeMessage } : {}),
        })
      }
      for (const field of params.designFields.backFields) {
        pass.backFields.push({
          key: field.key,
          label: field.label,
          value: field.value,
          ...(field.changeMessage ? { changeMessage: field.changeMessage } : {}),
        })
      }
    } else {
      // Hard-coded fallback: existing behavior for passes without design fields
      // Header fields (top right, visible on lock screen)
      pass.headerFields.push({
        key: "total",
        label: "# DE VISITAS",
        value: String(params.totalVisits),
      })

      // Secondary fields (below strip image)
      pass.secondaryFields.push(
        {
          key: "client",
          label: "NOMBRE",
          value: params.clientName,
        },
        {
          key: "stamps",
          label: "Visitas en ciclo",
          value: String(params.stampsInCycle),
        },
      )

      // Back fields (visible when pass is flipped)
      pass.backFields.push(
        {
          key: "client_b",
          label: "Cliente",
          value: params.clientName,
        },
        {
          key: "stamps_b",
          label: "Visitas en ciclo",
          value: `${params.stampsInCycle} de ${params.maxVisits}`,
        },
        {
          key: "total_b",
          label: "Visitas totales",
          value: String(params.totalVisits),
        },
        {
          key: "rewards_b",
          label: "Premios pendientes",
          value: String(params.pendingRewards),
        },
      )

      if (params.rewardValue) {
        pass.backFields.push({
          key: "reward_info",
          label: "Premio",
          value: params.rewardValue,
        })
      }
    }

    // ─── Barcode (QR) ─────────────────────────────────────────────────
    pass.setBarcodes({
      format: APPLE_PASS_BARCODE_FORMAT,
      message: params.qrMessage,
      messageEncoding: "iso-8859-1",
      altText: "Powered by Cuik",
    })

    // ─── Images ───────────────────────────────────────────────────────
    pass.addBuffer("strip@2x.png", params.stripImage2x)
    pass.addBuffer("strip.png", params.stripImage1x)
    pass.addBuffer("icon.png", params.icon)

    if (params.logo) {
      pass.addBuffer("logo.png", params.logo)
    }

    // ─── Locations (geo-fence for lock screen) ──────────────────────
    if (params.locations && params.locations.length > 0) {
      pass.setLocations(...params.locations)
    }

    // ─── Relevant Date ──────────────────────────────────────────────
    if (params.relevantDate) {
      pass.setRelevantDate(params.relevantDate)
    }

    // ─── Remove non-standard fields before signing ───────────────────
    // passkit-generator v3.5.7 adds "additionalInfoFields":[] to every
    // pass type, but Apple rejects storeCard passes that include it.
    // eventTicket legitimately uses this field — only strip it for other types.
    // Access the internal props via Symbol and delete the offending key.
    if ((pass.type as string) !== "eventTicket") {
      const propsSymbol = Object.getOwnPropertySymbols(pass).find((s) =>
        String(s).includes("props"),
      )
      if (propsSymbol) {
        const passType = pass.type
        const internalProps = (pass as unknown as Record<symbol, Record<string, unknown>>)[
          propsSymbol
        ]
        const typeData = passType
          ? (internalProps[passType] as Record<string, unknown> | undefined)
          : undefined
        if (typeData && "additionalInfoFields" in typeData) {
          delete typeData.additionalInfoFields
        }
      }
    }

    // ─── Generate signed .pkpass ──────────────────────────────────────
    const buffer = pass.getAsBuffer()

    console.info(
      `[Wallet:CreatePass] serial=${params.serialNumber} OK size=${buffer.byteLength}`,
      `passType=${pass.type}`,
      `headerFields=${pass.headerFields.length}`,
      `secondaryFields=${pass.secondaryFields.length}`,
      `backFields=${pass.backFields.length}`,
    )

    return { ok: true, buffer, serial: params.serialNumber }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during pass generation"
    console.error("[Wallet:Apple:CreatePass]", message)
    return { ok: false, error: message }
  }
}

/** Content-Type header value for .pkpass responses */
export { APPLE_PASS_CONTENT_TYPE }
