import { z } from "zod"

export const walletLocationSchema = z.object({
  lat: z
    .number()
    .min(-90, "Latitud debe estar entre -90 y 90")
    .max(90, "Latitud debe estar entre -90 y 90"),
  lng: z
    .number()
    .min(-180, "Longitud debe estar entre -180 y 180")
    .max(180, "Longitud debe estar entre -180 y 180"),
  name: z.string().trim().min(1, "Nombre requerido").max(100),
  relevantText: z.string().trim().max(100).optional(),
})

export type WalletLocation = z.infer<typeof walletLocationSchema>

export const walletConfigSchema = z.object({
  locations: z.array(walletLocationSchema).max(10, "Maximo 10 ubicaciones").default([]),
  relevantDateEnabled: z.boolean().default(false),
})

export type WalletConfig = z.infer<typeof walletConfigSchema>

export const walletConfigLocationsSchema = z.object({
  locations: z.array(walletLocationSchema).max(10, "Maximo 10 ubicaciones"),
  relevantDateEnabled: z.boolean(),
})

export type WalletConfigLocationsInput = z.infer<typeof walletConfigLocationsSchema>
