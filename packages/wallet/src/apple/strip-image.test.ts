import { describe, expect, it } from "vitest"
import {
  STAMP_OPACITY_EMPTY,
  STAMP_OPACITY_FILLED,
  STAMP_SIZE,
  STAMP_START_X,
  STAMP_TOP_ROW_Y,
  STRIP_HEIGHT_2X,
  STRIP_WIDTH_2X,
} from "../shared/constants"
import type { StripImageParams } from "../shared/types"
import { _buildStripSvg } from "./strip-image"

const BASE_PARAMS: StripImageParams = {
  backgroundImageDataUri: "data:image/png;base64,iVBORw0KGgo=",
  stampImageDataUri: "data:image/png;base64,iVBORw0KGgo=",
  stampsInCycle: 3,
  maxVisits: 8,
}

describe("_buildStripSvg", () => {
  it("returns a valid SVG string", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    expect(svg).toContain('<?xml version="1.0"')
    expect(svg).toContain("<svg")
    expect(svg).toContain("</svg>")
  })

  it("uses correct @2x dimensions", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    expect(svg).toContain(`width="${STRIP_WIDTH_2X}"`)
    expect(svg).toContain(`height="${STRIP_HEIGHT_2X}"`)
  })

  it("includes a background image element", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    expect(svg).toContain(`href="${BASE_PARAMS.backgroundImageDataUri}"`)
  })

  it("renders correct number of stamp elements for maxVisits=8", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    const _stampImages = svg.match(/<image\s+href="data:image\/png;base64,iVBORw0KGgo="/g)
    // +1 for the background image also using an <image> tag with same href
    // So we count all <image> tags and subtract the background
    const allImages = svg.match(/<image\s/g) || []
    // 1 background + 8 stamps = 9
    expect(allImages.length).toBe(9)
  })

  it("renders correct number of stamps for maxVisits=6", () => {
    const svg = _buildStripSvg({ ...BASE_PARAMS, maxVisits: 6, stampsInCycle: 2 })
    const allImages = svg.match(/<image\s/g) || []
    // 1 background + 6 stamps = 7
    expect(allImages.length).toBe(7)
  })

  it("renders correct number of stamps for maxVisits=10", () => {
    const svg = _buildStripSvg({ ...BASE_PARAMS, maxVisits: 10, stampsInCycle: 0 })
    const allImages = svg.match(/<image\s/g) || []
    // 1 background + 10 stamps = 11
    expect(allImages.length).toBe(11)
  })

  it("applies filled opacity to visited stamps", () => {
    const svg = _buildStripSvg({ ...BASE_PARAMS, stampsInCycle: 3, maxVisits: 8 })
    const opacityMatches = [...svg.matchAll(/opacity="([^"]+)"/g)].map((m) =>
      Number.parseFloat(m[1]),
    )
    // First 3 stamps are filled, remaining 5 are empty
    const stampOpacities = opacityMatches // only stamp elements have opacity attribute
    expect(stampOpacities.filter((o) => o === STAMP_OPACITY_FILLED).length).toBe(3)
    expect(stampOpacities.filter((o) => o === STAMP_OPACITY_EMPTY).length).toBe(5)
  })

  it("renders all stamps as empty when stampsInCycle=0", () => {
    const svg = _buildStripSvg({ ...BASE_PARAMS, stampsInCycle: 0, maxVisits: 8 })
    const opacityMatches = [...svg.matchAll(/opacity="([^"]+)"/g)].map((m) =>
      Number.parseFloat(m[1]),
    )
    expect(opacityMatches.every((o) => o === STAMP_OPACITY_EMPTY)).toBe(true)
  })

  it("renders all stamps as filled when stampsInCycle=maxVisits", () => {
    const svg = _buildStripSvg({ ...BASE_PARAMS, stampsInCycle: 8, maxVisits: 8 })
    const opacityMatches = [...svg.matchAll(/opacity="([^"]+)"/g)].map((m) =>
      Number.parseFloat(m[1]),
    )
    expect(opacityMatches.every((o) => o === STAMP_OPACITY_FILLED)).toBe(true)
  })

  it("places stamps on top row and bottom row correctly", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    // Row 0: y = STAMP_TOP_ROW_Y (default offsetY)
    expect(svg).toContain(`y="${STAMP_TOP_ROW_Y}"`)
    // Row 1: y = offsetY + 1 * gapY (default: 23 + 73 = 96, since gapY defaults to stampSize+10)
    const defaultGapY = STAMP_SIZE + 10
    expect(svg).toContain(`y="${STAMP_TOP_ROW_Y + defaultGapY}"`)
  })

  it("starts stamp X positions at STAMP_START_X", () => {
    const svg = _buildStripSvg(BASE_PARAMS)
    expect(svg).toContain(`x="${STAMP_START_X}"`)
  })
})

describe("generateStripImage", () => {
  it("produces valid PNG buffers for strip2x and strip1x", async () => {
    // sharp is available, so we test the real output
    const { generateStripImage } = await import("./strip-image")
    const result = await generateStripImage(BASE_PARAMS)

    // PNG magic bytes: 0x89 0x50 0x4E 0x47 (‰PNG)
    const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47])

    expect(Buffer.isBuffer(result.strip2x)).toBe(true)
    expect(Buffer.isBuffer(result.strip1x)).toBe(true)
    expect(result.strip2x.subarray(0, 4).equals(PNG_HEADER)).toBe(true)
    expect(result.strip1x.subarray(0, 4).equals(PNG_HEADER)).toBe(true)
  })

  it("strip2x is larger than strip1x", async () => {
    const { generateStripImage } = await import("./strip-image")
    const result = await generateStripImage(BASE_PARAMS)

    expect(result.strip2x.length).toBeGreaterThan(result.strip1x.length)
  })
})
