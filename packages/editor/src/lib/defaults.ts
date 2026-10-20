import type {
  ImageNodeProps,
  PassDesignConfigV2,
  ShapeNodeProps,
  StampGridNodeProps,
  TextNodeProps,
} from "@cuik/shared/types/editor"

// ── V2 default config ───────────────────────────────────────────────

/**
 * Starting grid of a NEW design, drawn on the 750×288 Apple strip.
 * The old 750×246 defaults (63 / 197 / 23 / pitch 98 / 73) scaled by
 * 288/246, re-centred horizontally: 4 columns span 3·115 + 74 = 419 px,
 * so the left margin is (750 − 419) / 2 ≈ 166. Stored values (pitch):
 *   stampSize 74 · offsetX 166 · offsetY 27 · gapX 115 · gapY 85
 * = separations of 41 px (horizontal) and 11 px (vertical).
 * Existing rows are untouched: the server keeps its own fallbacks.
 */
export const NEW_DESIGN_STAMP_GRID = {
  stampSize: 74,
  offsetX: 166,
  offsetY: 27,
  gapX: 115,
  gapY: 85,
} as const

/** Default Cuik strip for new designs, already 750×288 (the 750×246 file stays for old rows). */
export const NEW_DESIGN_STRIP_URL = "/defaults/cuik-strip-288.png"

export function getDefaultConfigV2(businessName: string): PassDesignConfigV2 {
  return {
    version: 2,
    assets: {
      stripBg: NEW_DESIGN_STRIP_URL,
      logo: "/defaults/cuik-logo.png",
      stamp: "/defaults/cuik-stamp.png",
      icon: "/defaults/cuik-icon.png",
    },
    colors: {
      backgroundColor: "#1E3A5F",
      foregroundColor: "#FFFFFF",
      labelColor: "#CCCCCC",
    },
    stampsConfig: {
      maxVisits: 8,
      gridCols: 4,
      gridRows: 2,
      ...NEW_DESIGN_STAMP_GRID,
      filledOpacity: 1,
      emptyOpacity: 0.35,
      fillOrder: "row",
      rowOffsets: [],
      specialPositions: [],
      specialStampUrl: null,
      specialStampSize: null,
    },
    fields: {
      headerFields: [{ key: "total", label: "# DE VISITAS", value: "0" }],
      secondaryFields: [
        { key: "client", label: "NOMBRE", value: "Cliente" },
        { key: "stamps", label: "Visitas en ciclo", value: "0" },
      ],
      backFields: [
        {
          key: "stamps_b",
          label: "Visitas en ciclo",
          value: "{{stamps.current}} de {{stamps.max}}",
        },
        { key: "total_b", label: "Visitas totales", value: "{{stamps.total}}" },
        { key: "rewards_b", label: "Premios pendientes", value: "{{rewards.pending}}" },
      ],
    },
    logoText: businessName,
  }
}

// ── V1 node factory functions (kept for backward compat) ────────────

type NodeWithoutId<T> = {
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  visible: boolean
  name: string
  props: T
}

export function createDefaultTextNode(x: number, y: number): NodeWithoutId<TextNodeProps> {
  return {
    type: "text",
    x,
    y,
    width: 200,
    height: 40,
    rotation: 0,
    locked: false,
    visible: true,
    name: "Texto",
    props: {
      text: "Nuevo texto",
      fontFamily: "Plus Jakarta Sans",
      fontSize: 24,
      fontStyle: "normal",
      fill: "#000000",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
    },
  }
}

export function createDefaultImageNode(x: number, y: number): NodeWithoutId<ImageNodeProps> {
  return {
    type: "image",
    x,
    y,
    width: 200,
    height: 200,
    rotation: 0,
    locked: false,
    visible: true,
    name: "Imagen",
    props: {
      src: "",
      assetType: "custom",
      opacity: 1,
      fit: "contain",
    },
  }
}

export function createDefaultStampGridNode(
  x: number,
  y: number,
): NodeWithoutId<StampGridNodeProps> {
  return {
    type: "stamp-grid",
    x,
    y,
    width: 300,
    height: 150,
    rotation: 0,
    locked: false,
    visible: true,
    name: "Grilla de sellos",
    props: {
      stampSrc: "",
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
  }
}

export function createDefaultShapeNode(x: number, y: number): NodeWithoutId<ShapeNodeProps> {
  return {
    type: "shape",
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    locked: false,
    visible: true,
    name: "Forma",
    props: {
      shapeType: "rectangle",
      fill: "#cccccc",
      stroke: "#000000",
      strokeWidth: 0,
      cornerRadius: 0,
      opacity: 1,
    },
  }
}
