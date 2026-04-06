import { describe, expect, it } from "vitest"
import {
  canvasNodeSchema,
  imageNodePropsSchema,
  passDesignColorsSchema,
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
