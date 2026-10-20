import { describe, expect, it } from "vitest"
import {
  canvasNodeSchema,
  imageNodePropsSchema,
  passDesignColorsSchema,
  passDesignConfigV2Schema,
  passDesignSaveV2Schema,
  serializedCanvasSchema,
  shapeNodePropsSchema,
  stampGridNodePropsSchema,
  stampsConfigSchema,
  textNodePropsSchema,
} from "./pass-design-schema"

// ── Helpers ──────────────────────────────────────────────────────────

const baseNode = {
  id: "node-1",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  locked: false,
  visible: true,
  zIndex: 0,
  name: "test-node",
}

// ── textNodePropsSchema ──────────────────────────────────────────────

describe("textNodePropsSchema", () => {
  const validProps = {
    text: "Hello World",
    fontFamily: "Inter",
    fontSize: 24,
    fontStyle: "bold",
    fill: "#FFFFFF",
    align: "center",
    verticalAlign: "middle",
    lineHeight: 1.2,
  }

  it("accepts a valid text node payload", () => {
    const result = textNodePropsSchema.safeParse(validProps)
    expect(result.success).toBe(true)
  })

  it("rejects missing text field", () => {
    const { text, ...rest } = validProps
    const result = textNodePropsSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("rejects wrong type for fontSize", () => {
    const result = textNodePropsSchema.safeParse({
      ...validProps,
      fontSize: "24",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty object", () => {
    const result = textNodePropsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ── imageNodePropsSchema ─────────────────────────────────────────────

describe("imageNodePropsSchema", () => {
  const validProps = {
    src: "data:image/png;base64,abc123",
    assetType: "logo" as const,
    opacity: 1,
    fit: "cover" as const,
  }

  it("accepts a valid image node payload", () => {
    const result = imageNodePropsSchema.safeParse(validProps)
    expect(result.success).toBe(true)
  })

  it("accepts all valid assetType values", () => {
    for (const assetType of ["logo", "icon", "strip_bg", "stamp", "background", "custom"]) {
      const result = imageNodePropsSchema.safeParse({
        ...validProps,
        assetType,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid assetType", () => {
    const result = imageNodePropsSchema.safeParse({
      ...validProps,
      assetType: "invalid",
    })
    expect(result.success).toBe(false)
  })

  it("rejects opacity out of range (>1)", () => {
    const result = imageNodePropsSchema.safeParse({
      ...validProps,
      opacity: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative opacity", () => {
    const result = imageNodePropsSchema.safeParse({
      ...validProps,
      opacity: -0.1,
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid fit value", () => {
    const result = imageNodePropsSchema.safeParse({
      ...validProps,
      fit: "stretch",
    })
    expect(result.success).toBe(false)
  })
})

// ── stampGridNodePropsSchema ─────────────────────────────────────────

describe("stampGridNodePropsSchema", () => {
  const validProps = {
    stampSrc: "data:image/png;base64,stamp",
    gridCols: 4,
    gridRows: 2,
    maxVisits: 8,
    stampSize: 63,
    gapX: 10,
    gapY: 10,
    filledOpacity: 1,
    emptyOpacity: 0.35,
    previewFilled: 3,
  }

  it("accepts a valid stamp-grid node payload", () => {
    const result = stampGridNodePropsSchema.safeParse(validProps)
    expect(result.success).toBe(true)
  })

  it("rejects missing stampSrc", () => {
    const { stampSrc, ...rest } = validProps
    const result = stampGridNodePropsSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("rejects filledOpacity > 1", () => {
    const result = stampGridNodePropsSchema.safeParse({
      ...validProps,
      filledOpacity: 2,
    })
    expect(result.success).toBe(false)
  })

  it("rejects emptyOpacity < 0", () => {
    const result = stampGridNodePropsSchema.safeParse({
      ...validProps,
      emptyOpacity: -0.5,
    })
    expect(result.success).toBe(false)
  })

  it("applies default values for gridCols and gridRows", () => {
    const { gridCols, gridRows, stampSize, filledOpacity, emptyOpacity, ...rest } = validProps
    const result = stampGridNodePropsSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gridCols).toBe(4)
      expect(result.data.gridRows).toBe(2)
    }
  })
})

// ── shapeNodePropsSchema ─────────────────────────────────────────────

describe("shapeNodePropsSchema", () => {
  const validProps = {
    shapeType: "rectangle" as const,
    fill: "#FF0000",
    stroke: "#000000",
    strokeWidth: 2,
    cornerRadius: 0,
    opacity: 0.8,
  }

  it("accepts a valid shape node payload", () => {
    const result = shapeNodePropsSchema.safeParse(validProps)
    expect(result.success).toBe(true)
  })

  it("accepts all valid shapeType values", () => {
    for (const shapeType of ["rectangle", "circle", "rounded-rect"]) {
      const result = shapeNodePropsSchema.safeParse({
        ...validProps,
        shapeType,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid shapeType", () => {
    const result = shapeNodePropsSchema.safeParse({
      ...validProps,
      shapeType: "triangle",
    })
    expect(result.success).toBe(false)
  })

  it("rejects opacity out of range", () => {
    const result = shapeNodePropsSchema.safeParse({
      ...validProps,
      opacity: 1.1,
    })
    expect(result.success).toBe(false)
  })
})

// ── canvasNodeSchema (discriminated union) ───────────────────────────

describe("canvasNodeSchema", () => {
  it("accepts a valid text node", () => {
    const result = canvasNodeSchema.safeParse({
      ...baseNode,
      type: "text",
      props: {
        text: "Hello",
        fontFamily: "Inter",
        fontSize: 16,
        fontStyle: "normal",
        fill: "#000",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.5,
      },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid image node", () => {
    const result = canvasNodeSchema.safeParse({
      ...baseNode,
      type: "image",
      props: {
        src: "data:image/png;base64,abc",
        assetType: "logo",
        opacity: 1,
        fit: "cover",
      },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid stamp-grid node", () => {
    const result = canvasNodeSchema.safeParse({
      ...baseNode,
      type: "stamp-grid",
      props: {
        stampSrc: "data:image/png;base64,stamp",
        gridCols: 4,
        gridRows: 2,
        maxVisits: 8,
        stampSize: 63,
        gapX: 10,
        gapY: 10,
        filledOpacity: 1,
        emptyOpacity: 0.35,
        previewFilled: 3,
      },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid shape node", () => {
    const result = canvasNodeSchema.safeParse({
      ...baseNode,
      type: "shape",
      props: {
        shapeType: "circle",
        fill: "#FF0000",
        stroke: "#000",
        strokeWidth: 1,
        cornerRadius: 0,
        opacity: 1,
      },
    })
    expect(result.success).toBe(true)
  })

  it("rejects unknown type discriminator", () => {
    const result = canvasNodeSchema.safeParse({
      ...baseNode,
      type: "unknown",
      props: {},
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing base fields", () => {
    const result = canvasNodeSchema.safeParse({
      type: "text",
      props: {
        text: "Hello",
        fontFamily: "Inter",
        fontSize: 16,
        fontStyle: "normal",
        fill: "#000",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.5,
      },
    })
    expect(result.success).toBe(false)
  })
})

// ── serializedCanvasSchema ───────────────────────────────────────────

describe("serializedCanvasSchema", () => {
  it("accepts a valid serialized canvas with version=1", () => {
    const result = serializedCanvasSchema.safeParse({
      version: 1,
      canvasWidth: 375,
      canvasHeight: 567,
      nodes: [],
    })
    expect(result.success).toBe(true)
  })

  it("accepts canvas with nodes", () => {
    const result = serializedCanvasSchema.safeParse({
      version: 1,
      canvasWidth: 375,
      canvasHeight: 567,
      nodes: [
        {
          ...baseNode,
          type: "text",
          props: {
            text: "Title",
            fontFamily: "Inter",
            fontSize: 24,
            fontStyle: "bold",
            fill: "#FFF",
            align: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
          },
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects version != 1", () => {
    const result = serializedCanvasSchema.safeParse({
      version: 2,
      canvasWidth: 375,
      canvasHeight: 567,
      nodes: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing nodes array", () => {
    const result = serializedCanvasSchema.safeParse({
      version: 1,
      canvasWidth: 375,
      canvasHeight: 567,
    })
    expect(result.success).toBe(false)
  })
})

// ── passDesignColorsSchema ───────────────────────────────────────────

describe("passDesignColorsSchema", () => {
  it("accepts valid hex colors", () => {
    const result = passDesignColorsSchema.safeParse({
      backgroundColor: "#FFFFFF",
      foregroundColor: "#000000",
      labelColor: "#666666",
    })
    expect(result.success).toBe(true)
  })

  it("accepts lowercase hex", () => {
    const result = passDesignColorsSchema.safeParse({
      backgroundColor: "#ffffff",
      foregroundColor: "#000000",
      labelColor: "#aabbcc",
    })
    expect(result.success).toBe(true)
  })

  it("rejects 3-char hex shorthand", () => {
    const result = passDesignColorsSchema.safeParse({
      backgroundColor: "#FFF",
      foregroundColor: "#000",
      labelColor: "#666",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing hash", () => {
    const result = passDesignColorsSchema.safeParse({
      backgroundColor: "FFFFFF",
      foregroundColor: "#000000",
      labelColor: "#666666",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty string", () => {
    const result = passDesignColorsSchema.safeParse({
      backgroundColor: "",
      foregroundColor: "#000000",
      labelColor: "#666666",
    })
    expect(result.success).toBe(false)
  })
})

// ── stampsConfigSchema ───────────────────────────────────────────────

describe("stampsConfigSchema", () => {
  it("accepts valid config", () => {
    const result = stampsConfigSchema.safeParse({
      maxVisits: 8,
      gridCols: 4,
      gridRows: 2,
    })
    expect(result.success).toBe(true)
  })

  it("rejects non-integer maxVisits", () => {
    const result = stampsConfigSchema.safeParse({
      maxVisits: 8.5,
      gridCols: 4,
      gridRows: 2,
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing fields", () => {
    const result = stampsConfigSchema.safeParse({
      maxVisits: 8,
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-numeric values", () => {
    const result = stampsConfigSchema.safeParse({
      maxVisits: "8",
      gridCols: 4,
      gridRows: 2,
    })
    expect(result.success).toBe(false)
  })
})

// ── passDesignSaveV2Schema (updateDesign) ────────────────────────────

const v2Base = {
  version: 2,
  assets: { stripBg: "/defaults/cuik-strip.png", logo: null, stamp: null, icon: null },
  colors: { backgroundColor: "#1E3A5F", foregroundColor: "#FFFFFF", labelColor: "#CCCCCC" },
  fields: {
    headerFields: [{ key: "total", label: "# DE VISITAS", value: "0" }],
    secondaryFields: [{ key: "client", label: "NOMBRE", value: "{{client.name}}" }],
    backFields: [{ key: "stamps_b", label: "Visitas", value: "{{stamps.current}}" }],
  },
  logoText: "",
}

describe("passDesignSaveV2Schema", () => {
  it("accepts Don Clarito's stored config (86/84/101/124, 1 row, special 3)", () => {
    const r = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      stampsConfig: {
        maxVisits: 5,
        gridCols: 5,
        gridRows: 1,
        stampSize: 86,
        offsetX: 84,
        offsetY: 101,
        gapX: 124,
        gapY: 73,
        filledOpacity: 1,
        emptyOpacity: 0.35,
        fillOrder: "row",
        rowOffsets: [],
        specialPositions: [3],
        specialStampUrl: null,
        specialStampSize: null,
      },
    })
    expect(r.success).toBe(true)
  })

  it("accepts a legacy row with missing keys and the stripVersion marker", () => {
    const stampsConfig = { maxVisits: 8, gridCols: 4, gridRows: 2, stampSize: 63, stripVersion: 2 }
    const r = passDesignSaveV2Schema.safeParse({ ...v2Base, stampsConfig })
    expect(r.success).toBe(true)
    // passthrough: unknown markers survive
    if (r.success) expect((r.data.stampsConfig as Record<string, unknown>).stripVersion).toBe(2)
  })

  it("accepts migrated values scaled by 288/246 (decimals, offsetX after the 64 px crop)", () => {
    const r = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      stampsConfig: {
        maxVisits: 10,
        gridCols: 5,
        gridRows: 2,
        stampSize: 85.6,
        offsetX: -12,
        offsetY: 288,
        gapX: 234,
        gapY: 234,
        rowOffsets: [
          { x: 0, y: 0 },
          { x: 59, y: -12 },
        ],
        fillOrder: "interleaved",
      },
    })
    expect(r.success).toBe(true)
  })

  it("accepts a legacy config without fillOrder/rowOffsets/special keys", () => {
    const r = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      stampsConfig: {
        maxVisits: 8,
        gridCols: 4,
        gridRows: 2,
        stampSize: 74,
        offsetX: 166,
        offsetY: 27,
        gapX: 115,
        gapY: 85,
        filledOpacity: 1,
        emptyOpacity: 0.35,
      },
    })
    expect(r.success).toBe(true)
  })

  it("rejects NaN, negative size/pitch and out-of-range grids", () => {
    const base = { maxVisits: 8, gridCols: 4, gridRows: 2 }
    for (const bad of [
      { stampSize: Number.NaN },
      { stampSize: -4 },
      { gapX: -1 },
      { gapY: Number.POSITIVE_INFINITY },
      { gridRows: 0 },
      { gridCols: 11 },
      { maxVisits: 0 },
      { emptyOpacity: 2 },
    ]) {
      const r = passDesignSaveV2Schema.safeParse({ ...v2Base, stampsConfig: { ...base, ...bad } })
      expect(r.success, JSON.stringify(bad)).toBe(false)
    }
  })

  it("rejects invalid colours with a clear message", () => {
    const r = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      colors: { ...v2Base.colors, backgroundColor: "#FFF" },
      stampsConfig: { maxVisits: 8, gridCols: 4, gridRows: 2 },
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.errors[0].message).toContain("Color de fondo")
  })

  it("rejects empty or duplicate field keys across sections", () => {
    const stampsConfig = { maxVisits: 8, gridCols: 4, gridRows: 2 }
    const empty = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      stampsConfig,
      fields: { ...v2Base.fields, headerFields: [{ key: "", label: "X", value: "1" }] },
    })
    expect(empty.success).toBe(false)
    const dup = passDesignSaveV2Schema.safeParse({
      ...v2Base,
      stampsConfig,
      fields: { ...v2Base.fields, backFields: [{ key: "total", label: "Otra", value: "1" }] },
    })
    expect(dup.success).toBe(false)
  })
})

describe("passDesignConfigV2Schema caps (750×288 strip)", () => {
  it("accepts offsetY/gapY up to 288, stampSize up to 200 and an optional googleHero", () => {
    const r = passDesignConfigV2Schema.safeParse({
      ...v2Base,
      assets: { ...v2Base.assets, googleHero: "/api/assets/t/hero.png" },
      stampsConfig: {
        maxVisits: 8,
        gridCols: 4,
        gridRows: 2,
        stampSize: 200,
        offsetX: 0,
        offsetY: 288,
        gapX: 750,
        gapY: 288,
      },
    })
    expect(r.success).toBe(true)
  })
})
