import { z } from "zod"

// ── Hex color validator ──────────────────────────────────────────────
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (#RRGGBB)")

// ── Base node fields ─────────────────────────────────────────────────
const baseNodeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  zIndex: z.number(),
  name: z.string(),
})

// ── Node-specific props ──────────────────────────────────────────────
export const textNodePropsSchema = z.object({
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontStyle: z.string(),
  fill: z.string(),
  align: z.string(),
  verticalAlign: z.string(),
  lineHeight: z.number(),
})

export const imageNodePropsSchema = z.object({
  src: z.string(),
  assetType: z.enum(["logo", "icon", "strip_bg", "stamp", "background", "custom"]),
  opacity: z.number().min(0).max(1),
  fit: z.enum(["fill", "contain", "cover"]),
})

export const stampGridNodePropsSchema = z.object({
  stampSrc: z.string(),
  gridCols: z.number().int().default(4),
  gridRows: z.number().int().default(2),
  maxVisits: z.number().int(),
  stampSize: z.number().default(63),
  gapX: z.number(),
  gapY: z.number(),
  filledOpacity: z.number().min(0).max(1).default(1),
  emptyOpacity: z.number().min(0).max(1).default(0.35),
  previewFilled: z.number().int(),
})

export const shapeNodePropsSchema = z.object({
  shapeType: z.enum(["rectangle", "circle", "rounded-rect"]),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number(),
  cornerRadius: z.number(),
  opacity: z.number().min(0).max(1),
})

// ── Canvas node (discriminated union on `type`) ──────────────────────
const textNodeSchema = baseNodeSchema.extend({
  type: z.literal("text"),
  props: textNodePropsSchema,
})

const imageNodeSchema = baseNodeSchema.extend({
  type: z.literal("image"),
  props: imageNodePropsSchema,
})

const stampGridNodeSchema = baseNodeSchema.extend({
  type: z.literal("stamp-grid"),
  props: stampGridNodePropsSchema,
})

const shapeNodeSchema = baseNodeSchema.extend({
  type: z.literal("shape"),
  props: shapeNodePropsSchema,
})

export const canvasNodeSchema = z.discriminatedUnion("type", [
  textNodeSchema,
  imageNodeSchema,
  stampGridNodeSchema,
  shapeNodeSchema,
])

// ── Serialized canvas ────────────────────────────────────────────────
export const serializedCanvasSchema = z.object({
  version: z.literal(1),
  canvasWidth: z.number(),
  canvasHeight: z.number(),
  nodes: z.array(canvasNodeSchema),
})

// ── Pass design colors ───────────────────────────────────────────────
export const passDesignColorsSchema = z.object({
  backgroundColor: hexColorSchema,
  foregroundColor: hexColorSchema,
  labelColor: hexColorSchema,
})

// ── Stamps config ────────────────────────────────────────────────────
export const fillOrderSchema = z.enum(["row", "interleaved"]).default("row")

export const stampsConfigSchema = z.object({
  maxVisits: z.number().int(),
  gridCols: z.number().int(),
  gridRows: z.number().int(),
  stampSize: z.number().int().min(16).max(200).optional().default(63),
  offsetX: z.number().min(0).max(750).optional().default(197),
  offsetY: z.number().min(0).max(246).optional().default(23),
  gapX: z.number().min(0).max(300).optional().default(98),
  gapY: z.number().min(0).max(246).optional().default(73),
  filledOpacity: z.number().min(0).max(1).optional().default(1),
  emptyOpacity: z.number().min(0).max(1).optional().default(0.35),
  fillOrder: fillOrderSchema.optional().default("row"),
  rowOffsets: z
    .array(z.object({ x: z.number().min(-300).max(300), y: z.number().min(-200).max(200) }))
    .optional()
    .default([]),
})

// ── Pass design config v2 (declarative, no canvas nodes) ────────────
const passFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  changeMessage: z.string().optional(),
})

export const passDesignConfigV2Schema = z.object({
  version: z.literal(2),
  assets: z.object({
    stripBg: z.string().nullable(),
    logo: z.string().nullable(),
    stamp: z.string().nullable(),
    icon: z.string().nullable(),
  }),
  colors: passDesignColorsSchema,
  stampsConfig: z.object({
    maxVisits: z.number().int().min(1).max(30),
    gridCols: z.number().int().min(1).max(10),
    gridRows: z.number().int().min(1).max(5),
    stampSize: z.number().min(20).max(120).default(63),
    offsetX: z.number().min(0).max(750).default(197),
    offsetY: z.number().min(0).max(246).default(23),
    gapX: z.number().min(0).max(300).default(98),
    gapY: z.number().min(0).max(246).default(73),
    filledOpacity: z.number().min(0).max(1).default(1),
    emptyOpacity: z.number().min(0).max(1).default(0.35),
    fillOrder: fillOrderSchema.default("row"),
    rowOffsets: z.array(z.object({ x: z.number(), y: z.number() })).default([]),
  }),
  fields: z.object({
    headerFields: z.array(passFieldSchema).default([]),
    secondaryFields: z.array(passFieldSchema).default([]),
    backFields: z.array(passFieldSchema).default([]),
  }),
  logoText: z.string().default(""),
})

// ── Config version detection ─────────────────────────────────────────
export function getConfigVersion(data: unknown): "v1" | "v2" | "empty" {
  if (data == null) return "empty"
  if (
    typeof data === "object" &&
    "version" in data &&
    (data as Record<string, unknown>).version === 2
  )
    return "v2"
  return "v1"
}

// ── Save payload ─────────────────────────────────────────────────────
export const savePayloadSchema = z.object({
  canvasData: serializedCanvasSchema,
  colors: passDesignColorsSchema,
  stampsConfig: stampsConfigSchema,
  fields: z.object({
    headerFields: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          value: z.string(),
          changeMessage: z.string().optional(),
        }),
      )
      .default([]),
    secondaryFields: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          value: z.string(),
          changeMessage: z.string().optional(),
        }),
      )
      .default([]),
    backFields: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          value: z.string(),
          changeMessage: z.string().optional(),
        }),
      )
      .default([]),
  }),
  assets: z
    .array(
      z.object({
        type: z.enum(["logo", "icon", "strip_bg", "stamp", "background"]),
        dataUri: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
})
