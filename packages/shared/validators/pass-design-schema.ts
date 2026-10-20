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
/** Sorted, unique, 1-based visit numbers (max 50 stamps per card). */
const specialPositionsSchema = z
  .array(z.number().int().min(1).max(50))
  .max(50)
  .optional()
  .default([])
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b))

// Geometry lives on the Apple strip: 750×288 px (@2x of 375×144 pt).
// offsetX/offsetY = top-left of the first stamp; gapX/gapY = PITCH (left edge
// to the next left edge), so a pitch never needs to exceed the strip itself.
export const STRIP_CANVAS_WIDTH = 750
export const STRIP_CANVAS_HEIGHT = 288
export const STAMP_SIZE_MIN = 16
export const STAMP_SIZE_MAX = 200
export const GRID_COLS_MAX = 10
export const GRID_ROWS_MAX = 10
export const MAX_VISITS_MAX = 50

export const stampsConfigSchema = z.object({
  maxVisits: z.number().int(),
  gridCols: z.number().int(),
  gridRows: z.number().int(),
  stampSize: z.number().int().min(16).max(200).optional().default(63),
  offsetX: z.number().min(0).max(STRIP_CANVAS_WIDTH).optional().default(197),
  offsetY: z.number().min(0).max(STRIP_CANVAS_HEIGHT).optional().default(23),
  gapX: z.number().min(0).max(STRIP_CANVAS_WIDTH).optional().default(98),
  gapY: z.number().min(0).max(STRIP_CANVAS_HEIGHT).optional().default(73),
  filledOpacity: z.number().min(0).max(1).optional().default(1),
  emptyOpacity: z.number().min(0).max(1).optional().default(0.35),
  fillOrder: fillOrderSchema.optional().default("row"),
  rowOffsets: z
    .array(z.object({ x: z.number().min(-300).max(300), y: z.number().min(-200).max(200) }))
    .optional()
    .default([]),
  /** Visit numbers (1-based) drawn with the special mark: the ones that carry a gift. Empty = off. */
  specialPositions: specialPositionsSchema,
  /** Optional icon for the special stamps; null = the normal stamp with a badge drawn on it. */
  specialStampUrl: z.string().nullable().optional().default(null),
  /** Exact size of the special icon in px (centred in the same cell); null = same as the normal stamp. */
  specialStampSize: z.number().int().min(16).max(200).nullable().optional().default(null),
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
    /** Google-only hero (1032×336); null/absent = Google uses stripBg as before. */
    googleHero: z.string().nullable().optional(),
  }),
  colors: passDesignColorsSchema,
  stampsConfig: z.object({
    maxVisits: z.number().int().min(1).max(MAX_VISITS_MAX),
    gridCols: z.number().int().min(1).max(GRID_COLS_MAX),
    gridRows: z.number().int().min(1).max(GRID_ROWS_MAX),
    stampSize: z.number().min(STAMP_SIZE_MIN).max(STAMP_SIZE_MAX).default(63),
    offsetX: z.number().min(0).max(STRIP_CANVAS_WIDTH).default(197),
    offsetY: z.number().min(0).max(STRIP_CANVAS_HEIGHT).default(23),
    gapX: z.number().min(0).max(STRIP_CANVAS_WIDTH).default(98),
    gapY: z.number().min(0).max(STRIP_CANVAS_HEIGHT).default(73),
    filledOpacity: z.number().min(0).max(1).default(1),
    emptyOpacity: z.number().min(0).max(1).default(0.35),
    fillOrder: fillOrderSchema.default("row"),
    rowOffsets: z.array(z.object({ x: z.number(), y: z.number() })).default([]),
    specialPositions: specialPositionsSchema,
    specialStampUrl: z.string().nullable().optional().default(null),
    specialStampSize: z.number().int().min(16).max(200).nullable().optional().default(null),
  }),
  fields: z.object({
    headerFields: z.array(passFieldSchema).default([]),
    secondaryFields: z.array(passFieldSchema).default([]),
    backFields: z.array(passFieldSchema).default([]),
  }),
  logoText: z.string().default(""),
})

// ── Save validation for v2 configs (editor → updateDesign) ──────────
//
// Lenient on purpose: it must accept every config already stored in
// pass_designs (rows written before any validation, rows missing newer keys,
// rows carrying extra markers such as `stripVersion`, decimal sizes such as
// 85.6) so a legacy design can always be saved again. It only rejects what
// would break a pass: NaN/Infinity, negative sizes or pitches, out-of-range
// opacities, bad colours and empty/duplicate field keys (passkit-generator
// silently drops those fields). The caller stores the ORIGINAL object, never
// the parsed one, so validation cannot rewrite a live design.

const finite = (label: string) =>
  z
    .number({ invalid_type_error: `${label}: debe ser un número` })
    .finite(`${label}: valor inválido`)

export const stampsConfigSaveSchema = z
  .object({
    maxVisits: z
      .number({ invalid_type_error: "Máximo de visitas: debe ser un número" })
      .int("Máximo de visitas: debe ser un entero")
      .min(1, "Máximo de visitas: mínimo 1")
      .max(MAX_VISITS_MAX, `Máximo de visitas: máximo ${MAX_VISITS_MAX}`),
    gridCols: z
      .number()
      .int("Columnas: debe ser un entero")
      .min(1, "Columnas: mínimo 1")
      .max(GRID_COLS_MAX, `Columnas: máximo ${GRID_COLS_MAX}`)
      .optional(),
    gridRows: z
      .number()
      .int("Filas: debe ser un entero")
      .min(1, "Filas: mínimo 1")
      .max(GRID_ROWS_MAX, `Filas: máximo ${GRID_ROWS_MAX}`)
      .optional(),
    stampSize: finite("Tamaño del sello")
      .min(STAMP_SIZE_MIN, `Tamaño del sello: mínimo ${STAMP_SIZE_MIN} px`)
      .max(STAMP_SIZE_MAX, `Tamaño del sello: máximo ${STAMP_SIZE_MAX} px`)
      .optional(),
    // The 13 Oct 2026 strip migration (offsetX·s − 64) can have left a legacy
    // first stamp slightly off the left edge: tolerated, never blocks a save.
    offsetX: finite("Margen izquierdo")
      .min(-STAMP_SIZE_MAX, "Margen izquierdo: valor fuera de la franja")
      .max(STRIP_CANVAS_WIDTH, `Margen izquierdo: máximo ${STRIP_CANVAS_WIDTH} px`)
      .optional(),
    offsetY: finite("Margen superior")
      .min(-STAMP_SIZE_MAX, "Margen superior: valor fuera de la franja")
      .max(STRIP_CANVAS_HEIGHT, `Margen superior: máximo ${STRIP_CANVAS_HEIGHT} px`)
      .optional(),
    gapX: finite("Separación horizontal")
      .min(0, "Separación horizontal: no puede ser negativa")
      .max(STRIP_CANVAS_WIDTH, `Separación horizontal: máximo ${STRIP_CANVAS_WIDTH} px`)
      .optional(),
    gapY: finite("Separación vertical")
      .min(0, "Separación vertical: no puede ser negativa")
      .max(STRIP_CANVAS_HEIGHT, `Separación vertical: máximo ${STRIP_CANVAS_HEIGHT} px`)
      .optional(),
    filledOpacity: finite("Opacidad lleno").min(0).max(1).optional(),
    emptyOpacity: finite("Opacidad vacío").min(0).max(1).optional(),
    fillOrder: z.enum(["row", "interleaved"]).optional(),
    rowOffsets: z
      .array(
        z
          .object({
            x: finite("Ajuste por fila X").min(-STRIP_CANVAS_WIDTH).max(STRIP_CANVAS_WIDTH),
            y: finite("Ajuste por fila Y").min(-STRIP_CANVAS_HEIGHT).max(STRIP_CANVAS_HEIGHT),
          })
          .passthrough(),
      )
      .max(GRID_ROWS_MAX * 5)
      .optional(),
    specialPositions: z.array(z.number().int().min(1).max(50)).max(50).optional(),
    specialStampUrl: z.string().max(2048).nullable().optional(),
    specialStampSize: finite("Tamaño del sello especial")
      .min(STAMP_SIZE_MIN, `Tamaño del sello especial: mínimo ${STAMP_SIZE_MIN} px`)
      .max(STAMP_SIZE_MAX, `Tamaño del sello especial: máximo ${STAMP_SIZE_MAX} px`)
      .nullable()
      .optional(),
  })
  .passthrough()

const COLOR_LABELS: Record<string, string> = {
  backgroundColor: "Color de fondo",
  foregroundColor: "Color de texto",
  labelColor: "Color de labels",
}
const saveColorSchema = (key: keyof typeof COLOR_LABELS) =>
  z
    .string({ required_error: `${COLOR_LABELS[key]}: falta el color` })
    .regex(/^#[0-9a-fA-F]{6}$/, `${COLOR_LABELS[key]}: color inválido, usa el formato #RRGGBB`)

const saveFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    value: z.string(),
    changeMessage: z.string().optional(),
  })
  .passthrough()

const FIELD_SECTIONS = ["headerFields", "secondaryFields", "backFields"] as const

export const passDesignSaveV2Schema = z
  .object({
    version: z.literal(2),
    assets: z
      .object({
        stripBg: z.string().nullable().optional(),
        logo: z.string().nullable().optional(),
        stamp: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        googleHero: z.string().nullable().optional(),
      })
      .passthrough(),
    colors: z
      .object({
        backgroundColor: saveColorSchema("backgroundColor"),
        foregroundColor: saveColorSchema("foregroundColor"),
        labelColor: saveColorSchema("labelColor"),
      })
      .passthrough(),
    stampsConfig: stampsConfigSaveSchema,
    fields: z
      .object({
        headerFields: z.array(saveFieldSchema).optional(),
        secondaryFields: z.array(saveFieldSchema).optional(),
        backFields: z.array(saveFieldSchema).optional(),
      })
      .passthrough(),
    logoText: z.string().optional(),
  })
  .passthrough()
  .superRefine((cfg, ctx) => {
    // Apple drops a field whose key is empty or already used anywhere on the pass.
    const seen = new Set<string>()
    for (const section of FIELD_SECTIONS) {
      for (const field of cfg.fields[section] ?? []) {
        const key = field.key.trim()
        if (!key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", section],
            message: `Campo "${field.label || "sin título"}": falta la clave`,
          })
        } else if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", section],
            message: `La clave "${key}" se repite: cada campo necesita una clave única`,
          })
        }
        seen.add(key)
      }
    }
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
