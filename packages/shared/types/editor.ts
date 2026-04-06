import type { z } from "zod"

import type {
  canvasNodeSchema,
  imageNodePropsSchema,
  passDesignColorsSchema,
  passDesignConfigV2Schema,
  savePayloadSchema,
  serializedCanvasSchema,
  shapeNodePropsSchema,
  stampGridNodePropsSchema,
  stampsConfigSchema,
  textNodePropsSchema,
} from "../validators/pass-design-schema"

export type TextNodeProps = z.infer<typeof textNodePropsSchema>
export type ImageNodeProps = z.infer<typeof imageNodePropsSchema>
export type StampGridNodeProps = z.infer<typeof stampGridNodePropsSchema>
export type ShapeNodeProps = z.infer<typeof shapeNodePropsSchema>

export type CanvasNode = z.infer<typeof canvasNodeSchema>
export type SerializedCanvas = z.infer<typeof serializedCanvasSchema>
export type PassDesignColors = z.infer<typeof passDesignColorsSchema>
export type StampsConfig = z.infer<typeof stampsConfigSchema>
export type SavePayload = z.infer<typeof savePayloadSchema>
export type PassDesignConfigV2 = z.infer<typeof passDesignConfigV2Schema>
