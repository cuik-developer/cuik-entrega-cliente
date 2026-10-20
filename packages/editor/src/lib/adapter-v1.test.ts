import { describe, expect, it } from "vitest"

import { adaptV1ToV2 } from "./adapter-v1"

// Shape written by promotion-actions.ts and the solicitudes approval: no nodes,
// the live values live in the stamps_config / fields columns (here after the
// 13 Oct 2026 strip migration).
const PROMO_CANVAS = { width: 375, height: 123, elements: [] }
const MIGRATED_STAMPS = {
  maxVisits: 10,
  gridCols: 5,
  gridRows: 2,
  stampSize: 74,
  offsetX: 167,
  offsetY: 27,
  gapX: 115,
  gapY: 85,
  rowOffsets: [],
  stripVersion: 2,
}
const STORED_FIELDS = {
  headerFields: [{ key: "total", label: "# DE VISITAS", value: "{{stamps.total}}" }],
  secondaryFields: [{ key: "client", label: "NOMBRE", value: "{{client.name}}" }],
  backFields: [{ key: "rewards_b", label: "Premios pendientes", value: "{{rewards.pending}}" }],
}

describe("adaptV1ToV2", () => {
  it("keeps every stored stamps_config value (what the wallet routes read)", () => {
    const cfg = adaptV1ToV2(PROMO_CANVAS, null, MIGRATED_STAMPS, STORED_FIELDS)
    expect(cfg.stampsConfig).toMatchObject(MIGRATED_STAMPS)
  })

  it("uses the stored fields column instead of the (empty) canvas nodes", () => {
    const cfg = adaptV1ToV2(PROMO_CANVAS, null, MIGRATED_STAMPS, STORED_FIELDS)
    expect(cfg.fields).toEqual(STORED_FIELDS)
  })

  it("falls back to the old defaults when nothing is stored", () => {
    const cfg = adaptV1ToV2(PROMO_CANVAS, null, null)
    expect(cfg.stampsConfig).toMatchObject({ maxVisits: 8, offsetX: 197, gapX: 98 })
    expect(cfg.fields).toEqual({ headerFields: [], secondaryFields: [], backFields: [] })
  })

  it("ignores null stored values", () => {
    const cfg = adaptV1ToV2(PROMO_CANVAS, null, { maxVisits: null, gridCols: 3 })
    expect(cfg.stampsConfig.maxVisits).toBe(8)
    expect(cfg.stampsConfig.gridCols).toBe(3)
  })
})
