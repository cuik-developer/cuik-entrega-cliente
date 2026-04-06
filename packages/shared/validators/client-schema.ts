import { z } from "zod"
import type { RegistrationConfig } from "./registration-config-schema"

export const registerClientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  lastName: z.string().trim().optional(),
  dni: z.string().trim().min(1, "DNI is required"),
  phone: z.string().trim().optional(),
  email: z.string().trim().min(1, "El email es requerido").email("Email inválido"),
  marketingOptIn: z.boolean().default(false),
})

export type RegisterClientInput = z.infer<typeof registerClientSchema>

/**
 * Builds a dynamic Zod registration schema based on the tenant's registration config.
 *
 * When config is null, returns the base schema with DNI optional (dynamic mode default).
 * Strategic fields of type "date" with key "birthday" are mapped to a top-level birthday field.
 * All other strategic fields are nested under a customData object.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: schema builder handling multiple field types and validation rules
export function buildRegistrationSchema(config: RegistrationConfig | null) {
  // Base fields — always present in dynamic mode
  const baseShape: Record<string, z.ZodTypeAny> = {
    name: z.string().trim().min(1, "El nombre es requerido"),
    lastName: z.string().trim().optional(),
    dni: z.string().trim().optional(),
    phone: z.string().trim().min(1, "El teléfono es requerido"),
    email: z.string().trim().min(1, "El email es requerido").email("Email inválido"),
    marketingOptIn: z.boolean().default(false),
  }

  if (!config || config.strategicFields.length === 0) {
    return z.object(baseShape)
  }

  // Process strategic fields
  let hasBirthday = false
  const customDataShape: Record<string, z.ZodTypeAny> = {}

  for (const field of config.strategicFields) {
    // Birthday is a special top-level field
    if (field.key === "birthday" || field.type === "date") {
      if (field.key === "birthday") {
        hasBirthday = true
        const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido")
        baseShape.birthday = field.required ? dateField : dateField.optional()
        continue
      }
    }

    // Build field validator based on type
    let fieldValidator: z.ZodTypeAny

    switch (field.type) {
      case "text": {
        const textField = z.string().trim()
        fieldValidator = field.required
          ? textField.min(1, `${field.label} es requerido`)
          : textField.optional()
        break
      }
      case "select": {
        if (field.options && field.options.length > 0) {
          const [first, ...rest] = field.options
          const enumField = z.enum([first, ...rest])
          fieldValidator = field.required ? enumField : enumField.optional()
        } else {
          const strField = z.string().trim()
          fieldValidator = field.required ? strField.min(1) : strField.optional()
        }
        break
      }
      case "date": {
        const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido")
        fieldValidator = field.required ? dateField : dateField.optional()
        break
      }
      case "location_select": {
        const uuidField = z.string().uuid("Selección inválida")
        fieldValidator = field.required ? uuidField : uuidField.optional()
        break
      }
      default:
        fieldValidator = z.string().optional()
    }

    customDataShape[field.key] = fieldValidator
  }

  // Add birthday as optional if not explicitly configured
  if (!hasBirthday) {
    // birthday stays out of the schema — not configured
  }

  // Add customData object if there are strategic fields
  if (Object.keys(customDataShape).length > 0) {
    baseShape.customData = z.object(customDataShape).optional()
  }

  return z.object(baseShape)
}

export type DynamicRegisterClientInput = z.infer<ReturnType<typeof buildRegistrationSchema>>
