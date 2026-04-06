import { z } from "zod"

const RESERVED_KEYS = [
  "name",
  "lastName",
  "email",
  "phone",
  "dni",
  "marketingOptIn",
  "birthday",
] as const

const strategicFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(50)
      .regex(
        /^[a-zA-Z][a-zA-Z0-9]*$/,
        "Key must start with a letter and contain only alphanumeric characters",
      )
      .refine((key) => !RESERVED_KEYS.includes(key as (typeof RESERVED_KEYS)[number]), {
        message: `Key must not be a reserved name: ${RESERVED_KEYS.join(", ")}`,
      }),
    label: z.string().min(1).max(100),
    type: z.enum(["text", "select", "date", "location_select"]),
    required: z.boolean().default(false),
    options: z.array(z.string().min(1).max(100)).optional(),
    placeholder: z.string().max(200).optional(),
  })
  .refine(
    (field) => {
      if (field.type === "select") {
        return Array.isArray(field.options) && field.options.length > 0
      }
      return true
    },
    { message: "Options are required and must be non-empty for select type fields" },
  )

const marketingBonusSchema = z.object({
  enabled: z.boolean().default(false),
  stampsBonus: z.number().int().min(0).max(10).default(0),
  pointsBonus: z.number().int().min(0).max(1000).default(0),
})

export const registrationConfigSchema = z
  .object({
    strategicFields: z.array(strategicFieldSchema).max(10).default([]),
    marketingBonus: marketingBonusSchema.default({}),
  })
  .refine(
    (config) => {
      const keys = config.strategicFields.map((f) => f.key)
      return new Set(keys).size === keys.length
    },
    { message: "Strategic field keys must be unique" },
  )

export type RegistrationConfig = z.infer<typeof registrationConfigSchema>
export type StrategicField = z.infer<typeof strategicFieldSchema>

export const DEFAULT_REGISTRATION_CONFIG: RegistrationConfig = registrationConfigSchema.parse({})
