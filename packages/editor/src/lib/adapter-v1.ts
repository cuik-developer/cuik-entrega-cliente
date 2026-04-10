import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"

interface V1Node {
  type: string
  name: string
  props: Record<string, unknown>
}

interface V1CanvasData {
  nodes?: V1Node[]
}

interface V1Colors {
  backgroundColor?: string
  foregroundColor?: string
  labelColor?: string
}

interface V1StampsConfig {
  maxVisits?: number
  gridCols?: number
  gridRows?: number
}

interface ExtractedAssets {
  stripBg: string | null
  logo: string | null
  stamp: string | null
  icon: string | null
}

interface ExtractedStampGrid {
  stamp: string | null
  stampSize: number
  filledOpacity: number
  emptyOpacity: number
}

type FieldEntry = { key: string; label: string; value: string }

/** Extract asset URLs from image-type nodes */
function extractAssetsFromNodes(nodes: V1Node[]): ExtractedAssets {
  const assets: ExtractedAssets = { stripBg: null, logo: null, stamp: null, icon: null }
  for (const node of nodes) {
    if (node.type !== "image") continue
    const assetType = node.props?.assetType as string | undefined
    const src = node.props?.src as string | undefined
    if (!src) continue
    switch (assetType) {
      case "strip_bg":
        assets.stripBg = src
        break
      case "logo":
        assets.logo = src
        break
      case "stamp":
        assets.stamp = src
        break
      case "icon":
        assets.icon = src
        break
    }
  }
  return assets
}

/** Extract stamp grid config from stamp-grid-type nodes */
function extractStampGrid(nodes: V1Node[]): ExtractedStampGrid {
  const result: ExtractedStampGrid = {
    stamp: null,
    stampSize: 63,
    filledOpacity: 1,
    emptyOpacity: 0.35,
  }
  for (const node of nodes) {
    if (node.type !== "stamp-grid") continue
    const stampSrc = node.props?.stampSrc as string | undefined
    if (stampSrc && !result.stamp) result.stamp = stampSrc
    if (node.props?.stampSize != null) result.stampSize = node.props.stampSize as number
    if (node.props?.filledOpacity != null) result.filledOpacity = node.props.filledOpacity as number
    if (node.props?.emptyOpacity != null) result.emptyOpacity = node.props.emptyOpacity as number
  }
  return result
}

/** Extract fields from text-type nodes by name prefix */
function extractFieldsFromNodes(nodes: V1Node[]) {
  const headerFields: FieldEntry[] = []
  const secondaryFields: FieldEntry[] = []
  const backFields: FieldEntry[] = []

  const prefixes = [
    { prefix: "header:", target: headerFields },
    { prefix: "secondary:", target: secondaryFields },
    { prefix: "back:", target: backFields },
  ] as const

  for (const node of nodes) {
    if (node.type !== "text") continue
    const name = node.name ?? ""
    const text = (node.props?.text as string) ?? ""
    for (const { prefix, target } of prefixes) {
      if (name.startsWith(prefix)) {
        const key = name.slice(prefix.length)
        target.push({ key, label: key.toUpperCase(), value: text })
        break
      }
    }
  }

  return { headerFields, secondaryFields, backFields }
}

/**
 * Adapts a v1 pass design (canvas nodes + separate columns) into the
 * declarative v2 config format.
 */
export function adaptV1ToV2(
  canvasData: unknown,
  colors: unknown,
  stampsConfig: unknown,
): PassDesignConfigV2 {
  const canvas = canvasData as V1CanvasData | null
  const cols = (colors ?? {}) as V1Colors
  const stamps = (stampsConfig ?? {}) as V1StampsConfig

  const nodes = canvas?.nodes ?? []

  const assets = extractAssetsFromNodes(nodes)
  const stampGrid = extractStampGrid(nodes)
  const fields = extractFieldsFromNodes(nodes)

  // Merge stamp source: prefer image node, fallback to stamp-grid node
  if (!assets.stamp && stampGrid.stamp) {
    assets.stamp = stampGrid.stamp
  }

  return {
    version: 2,
    assets: { stripBg: assets.stripBg, logo: assets.logo, stamp: assets.stamp, icon: assets.icon },
    colors: {
      backgroundColor: cols.backgroundColor ?? "#1E3A5F",
      foregroundColor: cols.foregroundColor ?? "#FFFFFF",
      labelColor: cols.labelColor ?? "#CCCCCC",
    },
    stampsConfig: {
      maxVisits: stamps.maxVisits ?? 8,
      gridCols: stamps.gridCols ?? 4,
      gridRows: stamps.gridRows ?? 2,
      stampSize: stampGrid.stampSize,
      offsetX: 197,
      offsetY: 23,
      gapX: 98,
      gapY: 73,
      filledOpacity: stampGrid.filledOpacity,
      emptyOpacity: stampGrid.emptyOpacity,
      fillOrder: "row",
      rowOffsets: [],
    },
    fields,
    logoText: "",
  }
}

/**
 * Type guard: checks if data is already a v2 config.
 */
export function isV2Config(data: unknown): data is PassDesignConfigV2 {
  return (
    data != null &&
    typeof data === "object" &&
    "version" in data &&
    (data as Record<string, unknown>).version === 2
  )
}
